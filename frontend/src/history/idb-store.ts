import { listArchivedHistory, getArchivedHistory, deleteArchivedHistory } from '../workspace/library-store';
import { parseHistorySnapshot } from '../workspace/history-backup';
import { digest } from '../workspace/library-model';
/**
 * 문서 이력 — IndexedDB + 메모리 폴백.
 * - 신규: IR 스냅샷 JSON(`CompareDocumentSnapshot`)으로 stable_id 보존.
 * - 레거시: HWP 바이트만 있던 항목은 비교 시 `compareDocuments`(alignment)로 폴백.
 */

import type { CompareDocumentSnapshot } from '@/compare/types';
import type { DocHistoryEntryMeta } from './types';

const DB_NAME = 'rhwpStudioDocHistory';
const DB_VER = 1;
const META = 'historyMeta';
const BLOBS = 'historyBlobs';
const MAX_SNAPSHOTS = 24;

type MetaRow = DocHistoryEntryMeta;

type MemEntry = {
  meta: MetaRow;
  irSnapshot?: CompareDocumentSnapshot;
  legacyBytes?: Uint8Array;
};

const memory = new Map<string, MemEntry>();

export type HistoryPayload =
  | { kind: 'ir'; snapshot: CompareDocumentSnapshot }
  | { kind: 'legacy'; bytes: Uint8Array };

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' });
    };
  });
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  const db = await openDb();
  if (!db) return fallback();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

async function listMetaMemory(): Promise<MetaRow[]> {
  return [...memory.values()]
    .map((e) => e.meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function listNativeHistoryMeta(): Promise<MetaRow[]> {
  return withDb(
    async (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(META, 'readonly');
        const req = tx.objectStore(META).getAll();
        req.onsuccess = () => {
          const rows = (req.result as MetaRow[]) ?? [];
          resolve(rows.sort((a, b) => b.createdAt - a.createdAt));
        };
        req.onerror = () => reject(req.error);
      }),
    listMetaMemory,
  );
}

type BlobRow = { id: string; snapshotJson?: string; data?: ArrayBuffer };

export async function getHistoryPayload(id: string): Promise<HistoryPayload | null> {
  if (id.startsWith('workspace-history-')) {
    const row = await getArchivedHistory(id);
    if (!row) return null;
    return row.kind === 'ir' ? { kind: 'ir', snapshot: parseHistorySnapshot(row.data) } : { kind: 'legacy', bytes: row.data };
  }
  const mem = memory.get(id);
  if (mem) {
    if (mem.irSnapshot) return { kind: 'ir', snapshot: mem.irSnapshot };
    if (mem.legacyBytes) return { kind: 'legacy', bytes: mem.legacyBytes };
    return null;
  }
  return withDb(
    async (db) =>
      new Promise<HistoryPayload | null>((resolve, reject) => {
        const tx = db.transaction(BLOBS, 'readonly');
        const req = tx.objectStore(BLOBS).get(id);
        req.onsuccess = () => {
          const v = req.result as BlobRow | undefined;
          if (!v) {
            resolve(null);
            return;
          }
          if (typeof v.snapshotJson === 'string' && v.snapshotJson.length > 0) {
            try {
              resolve({ kind: 'ir', snapshot: JSON.parse(v.snapshotJson) as CompareDocumentSnapshot });
            } catch {
              resolve(null);
            }
            return;
          }
          if (v.data) {
            resolve({ kind: 'legacy', bytes: new Uint8Array(v.data) });
            return;
          }
          resolve(null);
        };
        req.onerror = () => reject(req.error);
      }),
    async () => null,
  );
}

async function deleteOldestIfOverLimit(db: IDBDatabase): Promise<void> {
  const meta: MetaRow[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).getAll();
    req.onsuccess = () => resolve((req.result as MetaRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  if (meta.length < MAX_SNAPSHOTS) return;
  meta.sort((a, b) => a.createdAt - b.createdAt);
  const remove = meta.slice(0, meta.length - MAX_SNAPSHOTS + 1);
  for (const m of remove) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META, BLOBS], 'readwrite');
      tx.objectStore(META).delete(m.id);
      tx.objectStore(BLOBS).delete(m.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

function cloneSnapshot(s: CompareDocumentSnapshot): CompareDocumentSnapshot {
  return JSON.parse(JSON.stringify(s)) as CompareDocumentSnapshot;
}

/** IR 스냅샷 저장 — 문단 stable_id가 JSON에 포함되어 이력 비교 시 identity 모드에 적합 */
export async function saveHistoryIrSnapshot(
  label: string,
  sourceFileName: string,
  snapshot: CompareDocumentSnapshot,
): Promise<DocHistoryEntryMeta> {
  const id = globalThis.crypto?.randomUUID?.() ?? `h_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = Date.now();
  const json = JSON.stringify(snapshot);
  const byteLength = new TextEncoder().encode(json).length;
  const meta: MetaRow = {
    id,
    label: label.trim() || `스냅샷 ${new Date(createdAt).toLocaleString('ko-KR')}`,
    createdAt,
    sourceFileName,
    byteLength,
    storageKind: 'ir',
  };

  const db = await openDb();
  if (!db) {
    while (memory.size >= MAX_SNAPSHOTS) {
      const oldest = [...memory.entries()].sort((a, b) => a[1].meta.createdAt - b[1].meta.createdAt)[0];
      if (oldest) memory.delete(oldest[0]);
    }
    memory.set(id, { meta, irSnapshot: cloneSnapshot(snapshot) });
    return meta;
  }

  try {
    await deleteOldestIfOverLimit(db);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META, BLOBS], 'readwrite');
      tx.objectStore(META).put(meta);
      tx.objectStore(BLOBS).put({ id, snapshotJson: json });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return meta;
  } finally {
    db.close();
  }
}

export async function deleteHistorySnapshot(id: string): Promise<void> {
  if (id.startsWith('workspace-history-')) { await deleteArchivedHistory(id); return; }
  const meta = (await listNativeHistoryMeta()).find(row => row.id === id);
  if (meta) {
    const hash = await nativeHistoryHash(id);
    const duplicates = (await listArchivedHistory().catch(() => [])).filter(row => row.label === meta.label && row.sourceFileName === meta.sourceFileName && row.createdAt === meta.createdAt && row.sha256 === hash);
    for (const row of duplicates) await deleteArchivedHistory(row.id);
  }
  memory.delete(id);
  await withDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction([META, BLOBS], 'readwrite');
        tx.objectStore(META).delete(id);
        tx.objectStore(BLOBS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
    async () => {},
  );
}

export async function clearHistory(): Promise<void> {
  if (idbAvailable()) await deleteArchivedHistory();
  memory.clear();
  await withDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction([META, BLOBS], 'readwrite');
        tx.objectStore(META).clear();
        tx.objectStore(BLOBS).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
    async () => {},
  );
}

async function nativeHistoryHash(id: string): Promise<string | null> {
  const payload = await getHistoryPayload(id);
  if (!payload) return null;
  return digest(payload.kind === 'legacy' ? payload.bytes : new TextEncoder().encode(JSON.stringify(payload.snapshot)));
}

export async function listHistoryMeta(): Promise<MetaRow[]> {
  const native = await listNativeHistoryMeta();
  // Preserve the original in-memory history feature when persistent storage is unavailable.
  const migrated = await listArchivedHistory().catch(() => []);
  const distinct = [];
  for (const row of migrated) {
    const match = native.find(old => old.label === row.label && old.sourceFileName === row.sourceFileName && old.createdAt === row.createdAt);
    if (!match || await nativeHistoryHash(match.id) !== row.sha256) distinct.push(row);
  }
  return [...native, ...distinct.map(row => ({ id: row.id, label: row.label, sourceFileName: row.sourceFileName, createdAt: row.createdAt, byteLength: row.data.length, storageKind: row.kind === 'ir' ? 'ir' as const : 'legacy' as const }))].sort((a, b) => b.createdAt - a.createdAt);
}
