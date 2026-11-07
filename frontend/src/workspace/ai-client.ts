import { AI_TEXT_LIMIT } from './ai-edit';
import type { WritingTemplateId } from './writing-templates';

export interface AiConnection {
  configured: boolean;
  reason: string | null;
  provider: string;
  model: string | null;
  maxTextLength: number;
  deployment?: 'coders';
  usage?: 'site';
}

export function isCodersSite(): boolean {
  return location.protocol === 'https:' && location.hostname.endsWith('.coders.kr');
}

export class AiAccessError extends Error {}

function isCodersGate(res: Response): boolean {
  return isCodersSite() && (
    res.type === 'opaqueredirect' || res.status === 401 || res.status === 402
    || (res.status >= 300 && res.status < 400)
    || (res.status < 500 && res.headers.get('content-type')?.includes('text/html') === true)
  );
}

export async function readAiConnection(signal?: AbortSignal): Promise<AiConnection> {
  let res: Response;
  try { res = await fetch('/api/ai/status', { signal, headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'manual' }); }
  catch { throw new Error('AI 연결 상태를 확인할 수 없어요. 잠시 후 다시 확인해 주세요.'); }
  if (isCodersGate(res)) {
    return { configured: false, reason: 'platform_gate', provider: 'OpenAI', model: null, maxTextLength: AI_TEXT_LIMIT, deployment: 'coders' };
  }
  const value = await res.json().catch(() => null);
  if (!res.ok || typeof value?.configured !== 'boolean') throw new Error('AI 연결 상태를 읽지 못했어요. 잠시 후 다시 확인해 주세요.');
  return value;
}
export type AiWritingRequest =
  | { mode: 'draft'; template: WritingTemplateId; details: string }
  | { mode: 'draft'; prompt: string }
  | { mode: 'rewrite'; text: string; prompt: string };

export async function makeAiWriting({ mode, ...input }: AiWritingRequest, signal: AbortSignal): Promise<{ text: string; explanation: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, redirect: 'manual', signal,
      body: JSON.stringify({ ...input, consent: true }),
    });
  } catch {
    throw new Error(signal.aborted ? '응답 시간이 지났거나 요청을 취소했어요. 다시 시도해 주세요.' : 'AI 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
  if (isCodersGate(res)) throw new AiAccessError('코더스 로그인 또는 이용 한도를 확인한 뒤 다시 시도해 주세요.');
  let value;
  try { value = await res.json(); } catch {
    console.warn('[글쓰기 도우미] JSON 응답을 읽지 못했습니다.', {
      status: res.status, responseType: res.type, isJson: res.headers.get('content-type')?.includes('application/json') === true,
    });
    throw new Error('서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!res.ok) {
    const message = typeof value?.error?.message === 'string' ? value.error.message
      : res.status >= 500 ? 'AI에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' : '글을 만들지 못했어요. 다시 시도해 주세요.';
    if (value?.error?.code === 'LOGIN_REQUIRED') throw new AiAccessError(message);
    throw new Error(message);
  }
  const generated = value?.[mode === 'draft' ? 'draftText' : 'revisedText'];
  if (typeof generated !== 'string' || [...generated].length > AI_TEXT_LIMIT || typeof value?.explanation !== 'string') {
    throw new Error('받아온 글을 읽을 수 없어요. 다시 시도해 주세요.');
  }
  return { text: generated, explanation: value.explanation };
}
