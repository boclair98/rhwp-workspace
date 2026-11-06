import { AI_TEXT_LIMIT, codePointLength, validateDraft, validateRevision } from './ai-edit.ts';
import { WRITING_TEMPLATES, type WritingTemplateId } from './writing-templates.ts';

const STORAGE_KEY = 'rhwp.writing-draft';
const VERSION = 1;
const MAX_RECORD_LENGTH = 32_000;
const PROMPT_LIMIT = 1_000;

export interface WritingDraft {
  mode: 'draft' | 'rewrite';
  method: 'template' | 'ai';
  templateId: WritingTemplateId;
  templateValues: Partial<Record<WritingTemplateId, Record<string, string>>>;
  prompt: string;
  manual: string;
  preview?: { text: string; source: 'manual' | 'ai' | 'template' };
}

export interface WritingDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every(key => keys.includes(key));
}

function isLimitedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit * 2 && codePointLength(value) <= limit;
}

function checkedDraft(value: unknown): WritingDraft {
  const invalid = () => new Error('글쓰기 초안 정보를 확인하고 다시 보관해 주세요.');
  if (!isRecord(value) || !hasOnlyKeys(value, ['mode', 'method', 'templateId', 'templateValues', 'prompt', 'manual', 'preview'])) {
    throw invalid();
  }
  const { mode, method, templateId, templateValues, prompt, manual, preview } = value;
  const selectedTemplate = WRITING_TEMPLATES.find(template => template.id === templateId);
  if ((mode !== 'draft' && mode !== 'rewrite') || (method !== 'template' && method !== 'ai')
      || !selectedTemplate || !isRecord(templateValues)) {
    throw invalid();
  }
  if (typeof prompt !== 'string' || prompt.length > PROMPT_LIMIT) {
    throw new Error('요청 문구를 1,000자 이내로 줄인 뒤 보관해 주세요.');
  }
  if (!isLimitedText(manual, AI_TEXT_LIMIT)) {
    throw new Error('직접 쓴 글을 2,000자 이내로 줄인 뒤 보관해 주세요.');
  }

  const checkedValues: WritingDraft['templateValues'] = {};
  for (const [id, fields] of Object.entries(templateValues)) {
    const template = WRITING_TEMPLATES.find(item => item.id === id);
    if (!template || !isRecord(fields)) throw invalid();
    const entries: Array<[string, string]> = [];
    for (const [name, content] of Object.entries(fields)) {
      const field = template.fields.find(item => item.id === name);
      if (!field) throw invalid();
      if (!isLimitedText(content, field.maxLength)) {
        throw new Error(`‘${field.label}’ 항목을 ${field.maxLength.toLocaleString('ko-KR')}자 이내로 줄인 뒤 보관해 주세요.`);
      }
      if (!field.multiline && /[\r\n]/.test(content)) {
        throw new Error(`‘${field.label}’ 항목을 한 줄로 적은 뒤 보관해 주세요.`);
      }
      entries.push([name, content]);
    }
    checkedValues[template.id] = Object.fromEntries(entries);
  }

  const draft: WritingDraft = {
    mode, method, templateId: selectedTemplate.id, templateValues: checkedValues, prompt, manual,
  };
  if (preview !== undefined) {
    if (!isRecord(preview) || !hasOnlyKeys(preview, ['text', 'source'])
        || (preview.source !== 'manual' && preview.source !== 'ai' && preview.source !== 'template')
        || !isLimitedText(preview.text, AI_TEXT_LIMIT)) {
      throw invalid();
    }
    const text = mode === 'draft' ? validateDraft(preview.text) : validateRevision('', preview.text);
    draft.preview = { text, source: preview.source };
  }
  return draft;
}

export function saveWritingDraft(draft: WritingDraft, storage?: WritingDraftStorage): void {
  const value = JSON.stringify({ version: VERSION, draft: checkedDraft(draft) });
  if (value.length > MAX_RECORD_LENGTH) {
    throw new Error('보관할 내용이 너무 길어요. 필요 없는 문장을 줄여 주세요.');
  }
  try {
    (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, value);
  } catch {
    throw new Error('초안을 보관하지 못했어요. 브라우저 저장 공간이나 설정을 확인해 주세요.');
  }
}

export function loadWritingDraft(storage?: WritingDraftStorage): WritingDraft | null {
  let value: string | null;
  try {
    value = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
  } catch {
    throw new Error('초안을 불러오지 못했어요. 브라우저 저장 설정을 확인해 주세요.');
  }
  if (value === null) return null;

  const corrupted = () => new Error('보관한 초안 정보를 읽을 수 없어요. 새 초안을 보관해 주세요.');
  if (value.length > MAX_RECORD_LENGTH) throw corrupted();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw corrupted();
  }
  if (!isRecord(parsed) || !Number.isInteger(parsed.version)) {
    throw corrupted();
  }
  if (parsed.version !== VERSION) {
    throw new Error('이 앱에서는 보관한 초안의 버전을 열 수 없어요. 최신 버전에서 다시 열어 주세요.');
  }
  if (!hasOnlyKeys(parsed, ['version', 'draft'])) throw corrupted();
  try {
    return checkedDraft(parsed.draft);
  } catch {
    throw corrupted();
  }
}
