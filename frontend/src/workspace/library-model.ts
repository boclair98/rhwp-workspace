import { detectDocumentByteKind } from '../core/document-signature.ts';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENTS = 50;
export const MAX_BACKUP_BYTES = 72 * 1024 * 1024;
export interface LibraryDocument {
  id: string;
  fileName: string;
  format: 'hwp' | 'hwpx';
  updatedAt: number;
  sha256: string;
  data: Uint8Array;
}
export function normalizeFileName(
  value: string,
  format: 'hwp' | 'hwpx',
): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 120 ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)
  )
    throw new Error('이름은 1~120자로 입력하고 경로·특수문자를 빼주세요.');
  const base = trimmed.replace(/\.(hwp|hwpx)$/i, '').trim();
  if (
    !base ||
    /[. ]$/.test(base) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)
  )
    throw new Error('다른 문서 이름을 입력해 주세요.');
  if (/\.[a-z0-9]{2,5}$/i.test(base))
    throw new Error('문서 확장자는 HWP 또는 HWPX로 유지해 주세요.');
  const result = `${base}.${format}`;
  if (result.length > 120)
    throw new Error('확장자를 포함해 120자 이내로 입력해 주세요.');
  return result;
}
export async function digest(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function validateDocumentBytes(
  data: Uint8Array,
  format: 'hwp' | 'hwpx',
): void {
  if (!data.length || data.length > MAX_DOCUMENT_BYTES)
    throw new Error('문서는 파일당 20MB까지 보관할 수 있습니다.');
  const kind = detectDocumentByteKind(data);
  if (kind !== (format === 'hwp' ? 'hwp' : 'zip'))
    throw new Error(
      '문서 형식과 파일 내용이 다릅니다. 원본 HWP/HWPX를 확인해 주세요.',
    );
}
export async function createLibraryDocument(
  fileName: string,
  data: Uint8Array,
  format: 'hwp' | 'hwpx',
  id: string = crypto.randomUUID(),
): Promise<LibraryDocument> {
  validateDocumentBytes(data, format);
  return {
    id,
    fileName: normalizeFileName(fileName, format),
    format,
    updatedAt: Date.now(),
    sha256: await digest(data),
    data: new Uint8Array(data),
  };
}
export function base64(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i += 32768)
    value += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(value);
}
export function assertCapacity(rows: LibraryDocument[]): void {
  if (
    rows.length > MAX_DOCUMENTS ||
    rows.reduce((sum, row) => sum + row.data.length, 0) > MAX_LIBRARY_BYTES
  )
    throw new Error(
      '보관함 한도는 50개·총 50MB입니다. 먼저 백업하고 필요 없는 문서를 정리해 주세요.',
    );
}
export function planImport(
  existing: LibraryDocument[],
  incoming: LibraryDocument[],
): { added: LibraryDocument[]; skipped: number } {
  const result = [...existing],
    added: LibraryDocument[] = [];
  let skipped = 0;
  for (const doc of incoming) {
    if (
      result.some(
        (row) => row.fileName === doc.fileName && row.sha256 === doc.sha256,
      )
    ) {
      skipped++;
      continue;
    }
    const next = { ...doc, id: crypto.randomUUID() };
    result.push(next);
    added.push(next);
  }
  assertCapacity(result);
  return { added, skipped };
}
export async function encodeBackup(rows: LibraryDocument[]): Promise<string> {
  assertCapacity(rows);
  const documents = await Promise.all(
    rows.map(async (row) => ({
      fileName: row.fileName,
      format: row.format,
      updatedAt: row.updatedAt,
      sha256: await digest(row.data),
      data: base64(row.data),
    })),
  );
  return JSON.stringify({
    format: 'geulgyeol-workspace',
    version: 1,
    createdAt: new Date().toISOString(),
    documents,
  });
}
export async function decodeBackup(text: string): Promise<LibraryDocument[]> {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error('백업 파일은 72MB까지 가져올 수 있습니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      '백업 JSON을 읽을 수 없습니다. 내보낸 원본 파일을 선택해 주세요.',
    );
  }
  if (!parsed || typeof parsed !== 'object')
    throw new Error('글결 백업 파일이 아닙니다.');
  const value = parsed as Record<string, unknown>;
  if (value.format !== 'geulgyeol-workspace')
    throw new Error('글결에서 내보낸 백업 파일을 선택해 주세요.');
  if (value.version !== 1)
    throw new Error(
      '지원하지 않는 백업 버전입니다. 원래 글결 버전에서 다시 내보내 주세요.',
    );
  if (!Array.isArray(value.documents) || value.documents.length > MAX_DOCUMENTS)
    throw new Error('백업의 문서 목록을 확인할 수 없습니다.');
  const rows: LibraryDocument[] = [];
  for (const raw of value.documents) {
    if (!raw || typeof raw !== 'object')
      throw new Error('백업의 문서 항목이 올바르지 않습니다.');
    const row = raw as Record<string, unknown>;
    if (
      typeof row.fileName !== 'string' ||
      (row.format !== 'hwp' && row.format !== 'hwpx') ||
      typeof row.data !== 'string' ||
      typeof row.sha256 !== 'string' ||
      !Number.isSafeInteger(row.updatedAt) ||
      Number(row.updatedAt) < 0 ||
      Number(row.updatedAt) > 8640000000000000
    )
      throw new Error('백업 문서의 필수 정보가 누락됐습니다.');
    if (row.data.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4)
      throw new Error('백업의 문서 데이터가 너무 큽니다.');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
      if (base64(bytes) !== row.data) throw new Error();
    } catch {
      throw new Error(
        '백업의 문서 데이터가 손상되었습니다. 원본 백업을 선택해 주세요.',
      );
    }
    const doc = await createLibraryDocument(row.fileName, bytes, row.format);
    if (doc.sha256 !== row.sha256)
      throw new Error(
        '문서 체크섬이 다릅니다. 파일이 손상되었을 수 있어 가져오기를 중단했습니다.',
      );
    doc.updatedAt = Number(row.updatedAt);
    rows.push(doc);
    assertCapacity(rows);
  }
  return rows;
}
