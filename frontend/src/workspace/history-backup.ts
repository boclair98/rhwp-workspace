import type { CompareDocumentSnapshot } from '../compare/types';
import {
  base64,
  decodeBackup,
  digest,
  encodeBackup,
  MAX_LIBRARY_BYTES,
  MAX_DOCUMENT_BYTES,
  validateDocumentBytes,
  type LibraryDocument,
} from './library-model.ts';
export interface ArchivedHistory {
  id: string;
  label: string;
  sourceFileName: string;
  createdAt: number;
  kind: 'ir' | 'legacy';
  sha256: string;
  data: Uint8Array;
}
export const MAX_HISTORY = 100;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0;
function anchor(value: unknown): boolean {
  return (
    record(value) &&
    count(value.pageIndex) &&
    ['x', 'y', 'width', 'height'].every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        Math.abs(Number(value[key])) < 1e9,
    )
  );
}
export function parseHistorySnapshot(
  data: Uint8Array,
): CompareDocumentSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error('작업 이력의 JSON이 손상되었습니다.');
  }
  if (
    !record(value) ||
    !record(value.meta) ||
    typeof value.meta.name !== 'string' ||
    !count(value.meta.pageCount) ||
    !count(value.meta.sectionCount) ||
    !Array.isArray(value.paragraphs) ||
    !Array.isArray(value.controls) ||
    value.paragraphs.length > 50000 ||
    value.controls.length > 50000
  )
    throw new Error('지원하지 않는 작업 이력 형식입니다.');
  if (
    value.meta.pageDisplayNumbers !== undefined &&
    (!Array.isArray(value.meta.pageDisplayNumbers) ||
      value.meta.pageDisplayNumbers.length > 50000 ||
      !value.meta.pageDisplayNumbers.every(count))
  )
    throw new Error('작업 이력의 쪽번호 정보가 올바르지 않습니다.');
  for (const para of value.paragraphs) {
    if (
      !record(para) ||
      ![
        'section',
        'paragraph',
        'sectionPage',
        'globalIndex',
        'controlCount',
      ].every((key) => count(para[key])) ||
      !['text', 'normalizedText', 'stableId', 'signature'].every(
        (key) => typeof para[key] === 'string',
      ) ||
      typeof para.isAnchorCandidate !== 'boolean' ||
      (para.anchor !== undefined && !anchor(para.anchor))
    )
      throw new Error('작업 이력의 문단 정보를 확인할 수 없습니다.');
  }
  for (const control of value.controls) {
    if (
      !record(control) ||
      !['key', 'type', 'summary'].every(
        (key) => typeof control[key] === 'string',
      ) ||
      !count(control.section) ||
      !count(control.paragraph) ||
      !['text', 'table', 'shape', 'image', 'chart', 'paragraphMeta'].includes(
        String(control.kind),
      ) ||
      !anchor(control.anchor)
    )
      throw new Error('작업 이력의 개체 정보를 확인할 수 없습니다.');
  }
  return value as unknown as CompareDocumentSnapshot;
}
export async function createArchivedHistory(
  label: string,
  sourceFileName: string,
  createdAt: number,
  kind: 'ir' | 'legacy',
  data: Uint8Array,
): Promise<ArchivedHistory> {
  if (
    !data.length ||
    data.length > MAX_DOCUMENT_BYTES ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    createdAt > 8640000000000000 ||
    !label.trim() ||
    label.length > 500 ||
    sourceFileName.length > 160
  )
    throw new Error('작업 이력의 이름·시간·크기를 확인해 주세요.');
  if (kind === 'ir') parseHistorySnapshot(data);
  else validateDocumentBytes(data, 'hwp');
  return {
    id: `workspace-history-${crypto.randomUUID()}`,
    label,
    sourceFileName,
    createdAt,
    kind,
    sha256: await digest(data),
    data: new Uint8Array(data),
  };
}
export function assertWorkspaceCapacity(
  docs: LibraryDocument[],
  history: ArchivedHistory[],
): void {
  if (
    history.length > MAX_HISTORY ||
    [...docs, ...history].reduce((n, row) => n + row.data.length, 0) >
      MAX_LIBRARY_BYTES
  )
    throw new Error(
      '문서와 이력은 합계 50MB, 작업 이력은 100개까지 이전할 수 있습니다.',
    );
}
export function planHistoryImport(
  existing: ArchivedHistory[],
  incoming: ArchivedHistory[],
): { added: ArchivedHistory[]; skipped: number } {
  const all = [...existing],
    added: ArchivedHistory[] = [];
  let skipped = 0;
  for (const row of incoming) {
    if (
      all.some(
        (old) =>
          old.sha256 === row.sha256 &&
          old.label === row.label &&
          old.sourceFileName === row.sourceFileName &&
          old.createdAt === row.createdAt,
      )
    ) {
      skipped++;
      continue;
    }
    const next = { ...row, id: `workspace-history-${crypto.randomUUID()}` };
    all.push(next);
    added.push(next);
  }
  return { added, skipped };
}
export async function encodeWorkspaceBackup(
  docs: LibraryDocument[],
  history: ArchivedHistory[],
): Promise<string> {
  assertWorkspaceCapacity(docs, history);
  const value = JSON.parse(await encodeBackup(docs));
  value.history = await Promise.all(
    history.map(async (row) => ({
      label: row.label,
      sourceFileName: row.sourceFileName,
      createdAt: row.createdAt,
      kind: row.kind,
      sha256: await digest(row.data),
      data: base64(row.data),
    })),
  );
  return JSON.stringify(value);
}
export async function decodeWorkspaceBackup(
  text: string,
): Promise<{ documents: LibraryDocument[]; history: ArchivedHistory[] }> {
  const documents = await decodeBackup(text);
  const value = JSON.parse(text);
  const input: unknown = value.history ?? [];
  if (!Array.isArray(input) || input.length > MAX_HISTORY)
    throw new Error('백업의 작업 이력 목록을 확인할 수 없습니다.');
  const history: ArchivedHistory[] = [];
  for (const row of input) {
    if (
      !record(row) ||
      typeof row.label !== 'string' ||
      typeof row.sourceFileName !== 'string' ||
      typeof row.createdAt !== 'number' ||
      (row.kind !== 'ir' && row.kind !== 'legacy') ||
      typeof row.sha256 !== 'string' ||
      typeof row.data !== 'string' ||
      row.data.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4
    )
      throw new Error('백업의 작업 이력 정보가 올바르지 않습니다.');
    let data: Uint8Array;
    try {
      data = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
      if (base64(data) !== row.data) throw new Error();
    } catch {
      throw new Error('작업 이력 데이터가 손상되었습니다.');
    }
    const item = await createArchivedHistory(
      row.label,
      row.sourceFileName,
      row.createdAt,
      row.kind,
      data,
    );
    if (item.sha256 !== row.sha256)
      throw new Error('작업 이력 체크섬이 다릅니다. 가져오기를 중단했습니다.');
    history.push(item);
    assertWorkspaceCapacity(documents, history);
  }
  return { documents, history };
}
