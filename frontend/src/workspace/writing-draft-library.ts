import { codePointLength } from './ai-edit.ts';
import {
  loadWritingDraft, validateWritingDraft, type WritingDraft, type WritingDraftStorage,
} from './writing-draft-store.ts';

export const WRITING_DRAFT_LIMIT = 12;
export const WRITING_DRAFT_BACKUP_LIMIT = 500_000;

export const WRITING_DRAFT_LIBRARY_KEY = 'rhwp.writing-drafts';
const LEGACY_STORAGE_KEY = 'rhwp.writing-draft';
const STORAGE_VERSION = 2;
const BACKUP_FORMAT = 'rhwp-writing-drafts';
const BACKUP_VERSION = 1;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
// Leave room for the format field so any valid store can be exported.
const STORAGE_LIMIT = WRITING_DRAFT_BACKUP_LIMIT - (JSON.stringify({ format: BACKUP_FORMAT }).length - 1);

export interface SavedWritingDraft {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  draft: WritingDraft;
}

interface SaveNamedDraft {
  name: string;
  draft: WritingDraft;
  id?: string;
  expectedUpdatedAt?: number;
}

interface DraftLibraryState {
  entries: SavedWritingDraft[];
  legacySource?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key));
}

function exceedsSize(text: string, limit: number): boolean {
  return text.length > limit || new TextEncoder().encode(text).byteLength > limit;
}

function normalizeName(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const name = raw.trim();
  if (!name || name.length > 120 || codePointLength(name) > 60 || /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/u.test(raw)) {
    throw new Error('초안 이름을 줄바꿈 없이 1~60자로 입력해 주세요.');
  }
  return name;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;
}

function parseRecord(text: string, invalid: () => Error): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed)) throw invalid();
  return parsed;
}

function validateEntries(value: unknown, invalid: () => Error): SavedWritingDraft[] {
  if (!Array.isArray(value) || value.length > WRITING_DRAFT_LIMIT) throw invalid();
  const ids = new Set<string>();
  return value.map(row => {
    if (!isRecord(row) || !hasKeys(row, ['id', 'name', 'createdAt', 'updatedAt', 'draft'])) throw invalid();
    const { id, name, createdAt, updatedAt, draft } = row;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || ids.has(id) ||
        !isTimestamp(createdAt) || !isTimestamp(updatedAt) || updatedAt < createdAt) {
      throw invalid();
    }
    ids.add(id);
    try {
      return { id, name: normalizeName(name), createdAt, updatedAt, draft: validateWritingDraft(draft) };
    } catch {
      throw invalid();
    }
  });
}

function readLibrary(storage?: WritingDraftStorage): DraftLibraryState {
  let text: string | null;
  let legacyText: string | null = null;
  try {
    const backend = storage ?? globalThis.localStorage;
    text = backend.getItem(WRITING_DRAFT_LIBRARY_KEY);
    if (text === null) legacyText = backend.getItem(LEGACY_STORAGE_KEY);
  } catch {
    throw new Error('초안 보관함을 열지 못했어요. 브라우저 저장 설정을 확인해 주세요.');
  }
  const invalid = () => new Error('초안 보관함을 읽을 수 없어요. 이 브라우저의 보관 정보를 확인해 주세요.');
  if (text === null) {
    if (legacyText === null) return { entries: [] };
    const draft = loadWritingDraft({ getItem: () => legacyText, setItem: () => { throw invalid(); } });
    return draft ? {
      entries: [{ id: 'legacy-draft', name: '이전에 보관한 초안', createdAt: 0, updatedAt: 0, draft }],
      legacySource: legacyText,
    } : { entries: [] };
  }
  if (exceedsSize(text, STORAGE_LIMIT)) throw invalid();
  const record = parseRecord(text, invalid);
  if (!Number.isSafeInteger(record.version)) throw invalid();
  if (record.version !== STORAGE_VERSION) {
    throw new Error('이 버전에서는 초안 보관함을 열 수 없어요. 최신 버전에서 다시 열어 주세요.');
  }
  if (!hasKeys(record, ['version', 'entries'])) throw invalid();
  return { entries: validateEntries(record.entries, invalid) };
}

function writeEntries(entries: SavedWritingDraft[], legacySource: string | undefined, storage?: WritingDraftStorage): void {
  if (entries.length > WRITING_DRAFT_LIMIT) {
    throw new Error('초안은 12개까지 보관할 수 있어요. 보관함에서 필요 없는 초안을 정리해 주세요.');
  }
  const text = JSON.stringify({ version: STORAGE_VERSION, entries });
  if (exceedsSize(text, STORAGE_LIMIT)) {
    throw new Error('보관할 내용이 너무 커요. 초안을 줄이거나 필요 없는 초안을 정리해 주세요.');
  }
  let backend: WritingDraftStorage;
  try {
    backend = storage ?? globalThis.localStorage;
    backend.setItem(WRITING_DRAFT_LIBRARY_KEY, text);
  } catch {
    throw new Error('초안 보관함의 변경을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인해 주세요.');
  }
  if (legacySource !== undefined) {
    try {
      if (backend.getItem(LEGACY_STORAGE_KEY) === legacySource) backend.removeItem?.(LEGACY_STORAGE_KEY);
    } catch { /* The new library has already been saved. */ }
  }
}

function availableId(ids: ReadonlySet<string>): string {
  let id: string;
  do {
    id = crypto.randomUUID();
  } while (ids.has(id));
  return id;
}

function unchangedEntry(entries: SavedWritingDraft[], id: string, expectedUpdatedAt?: number): SavedWritingDraft {
  const entry = entries.find(row => row.id === id);
  if (!entry) throw new Error('이 초안이 보관함에 없어요. 초안 목록을 다시 확인해 주세요.');
  if (entry.updatedAt !== expectedUpdatedAt) {
    throw new Error('보관된 초안이 바뀌었어요. 보관함에서 최신 초안을 확인해 주세요.');
  }
  return entry;
}

export function listWritingDrafts(storage?: WritingDraftStorage): SavedWritingDraft[] {
  return readLibrary(storage).entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveNamedWritingDraft(input: SaveNamedDraft, storage?: WritingDraftStorage): SavedWritingDraft {
  const name = normalizeName(input.name);
  const draft = validateWritingDraft(input.draft);
  const { entries, legacySource } = readLibrary(storage);
  const previous = input.id === undefined ? undefined : unchangedEntry(entries, input.id, input.expectedUpdatedAt);
  const now = Date.now();
  const updatedAt = previous ? Math.max(now, previous.updatedAt + 1) : now;
  if (!isTimestamp(updatedAt)) throw new Error('초안의 보관 시각을 갱신할 수 없어요. 새 초안으로 보관해 주세요.');
  const entry: SavedWritingDraft = {
    id: previous?.id ?? availableId(new Set(entries.map(row => row.id))),
    name, createdAt: previous?.createdAt ?? now, updatedAt, draft,
  };
  writeEntries([entry, ...entries.filter(row => row.id !== entry.id)], legacySource, storage);
  return entry;
}

export function deleteNamedWritingDraft(id: string, expectedUpdatedAt: number, storage?: WritingDraftStorage): void {
  const { entries, legacySource } = readLibrary(storage);
  unchangedEntry(entries, id, expectedUpdatedAt);
  writeEntries(entries.filter(row => row.id !== id), legacySource, storage);
}

export function exportWritingDrafts(storage?: WritingDraftStorage): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, entries: listWritingDrafts(storage) });
}

function contentKey(row: SavedWritingDraft): string {
  return JSON.stringify([row.name, row.draft], (_key, value: unknown) => isRecord(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
    : value);
}

export function importWritingDrafts(json: string, storage?: WritingDraftStorage): { added: number; skipped: number } {
  if (exceedsSize(json, WRITING_DRAFT_BACKUP_LIMIT)) {
    throw new Error('초안 백업 파일은 500KB까지 가져올 수 있어요.');
  }
  const invalid = () => new Error('초안 백업을 읽을 수 없어요. 내보낸 원본 백업 파일을 선택해 주세요.');
  const record = parseRecord(json, invalid);
  if (record.format !== BACKUP_FORMAT || !Number.isSafeInteger(record.version)) throw invalid();
  if (record.version !== BACKUP_VERSION) {
    throw new Error('이 버전에서는 초안 백업을 열 수 없어요. 최신 버전에서 다시 열어 주세요.');
  }
  if (!hasKeys(record, ['format', 'version', 'entries'])) throw invalid();
  const incoming = validateEntries(record.entries, invalid);
  const { entries: existing, legacySource } = readLibrary(storage);
  const contents = new Set(existing.map(contentKey));
  const reservedIds = new Set([...existing, ...incoming].map(row => row.id));
  const added: SavedWritingDraft[] = [];
  for (const row of incoming) {
    const key = contentKey(row);
    if (contents.has(key)) continue;
    contents.add(key);
    const id = existing.some(entry => entry.id === row.id) ? availableId(reservedIds) : row.id;
    reservedIds.add(id);
    added.push({ ...row, id });
  }
  if (added.length) writeEntries([...existing, ...added], legacySource, storage);
  return { added: added.length, skipped: incoming.length - added.length };
}
