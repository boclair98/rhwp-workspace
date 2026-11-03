import {
  assertCapacity,
  planImport,
  type LibraryDocument,
} from './library-model.ts';
import {
  assertWorkspaceCapacity,
  planHistoryImport,
  type ArchivedHistory,
} from './history-backup.ts';
const STORE = 'documents';
const HISTORY = 'history';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error(
          '브라우저 저장소를 사용할 수 없습니다. 파일 저장으로 내려받아 주세요.',
        ),
      );
      return;
    }
    const req = indexedDB.open('geulgyeol-workspace', 2);
    req.onupgradeneeded = () => {
      for (const name of [STORE, HISTORY])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(
        new Error(
          '브라우저 보관함을 열 수 없습니다. 저장소 권한과 여유 공간을 확인해 주세요.',
        ),
      );
    req.onblocked = () =>
      reject(new Error('다른 글결 탭을 닫고 다시 시도해 주세요.'));
  });
}
export async function listDocuments(): Promise<LibraryDocument[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    let rows: LibraryDocument[] = [];
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      rows = req.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(rows.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    tx.onabort = () => {
      db.close();
      reject(new Error('보관 목록을 읽지 못했습니다. 다시 시도해 주세요.'));
    };
  });
}
async function mutate<T>(
  change: (
    rows: LibraryDocument[],
    store: IDBObjectStore,
    history: ArchivedHistory[],
    historyStore: IDBObjectStore,
  ) => T,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, HISTORY], 'readwrite');
    const store = tx.objectStore(STORE),
      historyStore = tx.objectStore(HISTORY);
    let result: T;
    let failure: unknown;
    const docsRequest = store.getAll(),
      historyRequest = historyStore.getAll();
    let ready = 0;
    const apply = () => {
      if (++ready !== 2) return;
      try {
        result = change(
          docsRequest.result,
          store,
          historyRequest.result,
          historyStore,
        );
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    docsRequest.onsuccess = apply;
    historyRequest.onsuccess = apply;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(
        failure instanceof Error
          ? failure
          : new Error(
              '브라우저 보관에 실패했습니다. 공간을 확인하고 파일 저장으로 내려받아 주세요.',
            ),
      );
    };
  });
}
export function saveDocument(doc: LibraryDocument): Promise<void> {
  return mutate((rows, store, history) => {
    const next = [...rows.filter((row) => row.id !== doc.id), doc];
    assertCapacity(next);
    assertWorkspaceCapacity(next, history);
    store.put(doc);
  });
}
export function importDocuments(
  rows: LibraryDocument[],
): Promise<{ added: number; skipped: number }> {
  return importWorkspace(rows, []).then((result) => ({
    added: result.added,
    skipped: result.skipped,
  }));
}
export function deleteDocument(id: string): Promise<void> {
  return mutate((_rows, store) => {
    store.delete(id);
  });
}
async function readHistory(id?: string): Promise<ArchivedHistory[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY, 'readonly');
    let rows: ArchivedHistory[] = [];
    const request = id
      ? tx.objectStore(HISTORY).get(id)
      : tx.objectStore(HISTORY).getAll();
    request.onsuccess = () => {
      rows = id ? (request.result ? [request.result] : []) : request.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(rows);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error('작업 이력을 읽지 못했습니다. 다시 시도해 주세요.'));
    };
  });
}
export async function listArchivedHistory(): Promise<ArchivedHistory[]> {
  return (await readHistory()).sort((a, b) => b.createdAt - a.createdAt);
}
export async function getArchivedHistory(
  id: string,
): Promise<ArchivedHistory | null> {
  return (await readHistory(id))[0] ?? null;
}
export function deleteArchivedHistory(id?: string): Promise<void> {
  return mutate((_rows, _store, _history, store) => {
    if (id) store.delete(id);
    else store.clear();
  });
}
export function importWorkspace(
  docs: LibraryDocument[],
  history: ArchivedHistory[],
): Promise<{
  added: number;
  skipped: number;
  historyAdded: number;
  historySkipped: number;
}> {
  return mutate((oldDocs, docStore, oldHistory, historyStore) => {
    const docPlan = planImport(oldDocs, docs),
      historyPlan = planHistoryImport(oldHistory, history);
    assertWorkspaceCapacity(
      [...oldDocs, ...docPlan.added],
      [...oldHistory, ...historyPlan.added],
    );
    docPlan.added.forEach((row) => docStore.put(row));
    historyPlan.added.forEach((row) => historyStore.put(row));
    return {
      added: docPlan.added.length,
      skipped: docPlan.skipped,
      historyAdded: historyPlan.added.length,
      historySkipped: historyPlan.skipped,
    };
  });
}
