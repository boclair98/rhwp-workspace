import { AI_TEXT_LIMIT } from './ai-edit';

export interface AiConnection {
  configured: boolean;
  reason: string | null;
  provider: string;
  model: string | null;
  maxTextLength: number;
}
export async function readAiConnection(signal?: AbortSignal): Promise<AiConnection> {
  let res: Response;
  try { res = await fetch('/api/ai/status', { signal, cache: 'no-store' }); }
  catch { throw new Error('로컬 서버에 연결할 수 없어요. 서버 실행 상태를 확인해 주세요.'); }
  if (!res.ok) throw new Error('AI 연결 설정을 읽지 못했어요. 로컬 서버를 실행하고 다시 확인해 주세요.');
  const value = await res.json();
  if (typeof value.configured !== 'boolean') throw new Error('AI API를 지원하는 로컬 서버로 실행해 주세요.');
  return value;
}
export async function makeAiWriting(mode: 'draft' | 'rewrite', text: string, prompt: string, consent: boolean, signal: AbortSignal): Promise<{ text: string; explanation: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify(mode === 'draft' ? { prompt, consent } : { text, prompt, consent }),
    });
  } catch {
    throw new Error(signal.aborted ? '응답 시간이 지났거나 요청을 취소했어요. 다시 시도해 주세요.' : 'AI 서버에 연결할 수 없어요. 로컬 서버를 확인해 주세요.');
  }
  let value;
  try { value = await res.json(); } catch { throw new Error('서버 응답을 읽지 못했어요. 로컬 서버를 확인해 주세요.'); }
  if (!res.ok) throw new Error(value?.error?.message || '글을 만들지 못했어요. 다시 시도해 주세요.');
  const generated = value?.[mode === 'draft' ? 'draftText' : 'revisedText'];
  if (typeof generated !== 'string' || [...generated].length > AI_TEXT_LIMIT || typeof value?.explanation !== 'string') {
    throw new Error('받아온 글을 읽을 수 없어요. 다시 시도해 주세요.');
  }
  return { text: generated, explanation: value.explanation };
}
