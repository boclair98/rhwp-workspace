import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  createLibraryDocument,
  normalizeFileName,
  decodeBackup,
  encodeBackup,
  planImport,
  MAX_DOCUMENTS,
} from '../frontend/src/workspace/library-model.ts';
import {
  saveDocument,
  listDocuments,
  importDocuments,
  deleteDocument,
  importWorkspace,
  listArchivedHistory,
} from '../frontend/src/workspace/library-store.ts';
import {
  createArchivedHistory,
  encodeWorkspaceBackup,
  decodeWorkspaceBackup,
  parseHistorySnapshot,
} from '../frontend/src/workspace/history-backup.ts';

const bytes = (text = 'sample') =>
  Uint8Array.from([
    0xd0,
    0xcf,
    0x11,
    0xe0,
    0xa1,
    0xb1,
    0x1a,
    0xe1,
    ...new TextEncoder().encode(text),
  ]);
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
test('Korean filenames retain the actual format and reject paths/reserved names', () => {
  assert.equal(normalizeFileName(' 업무 문서.hwpx ', 'hwp'), '업무 문서.hwp');
  for (const name of ['../원본', 'C:\\파일', 'NUL', '', '문서.docx'])
    assert.throws(() => normalizeFileName(name, 'hwp'));
});
test('backup round trip preserves Korean name, timestamp and every byte', async () => {
  const doc = await createLibraryDocument(
    '이름 <script>.hwp',
    bytes(),
    'hwp',
  ).catch(() => null);
  assert.equal(doc, null);
  const original = await createLibraryDocument(
    '계약 초안.hwp',
    bytes('내용'),
    'hwp',
  );
  const [restored] = await decodeBackup(await encodeBackup([original]));
  assert.equal(restored.fileName, original.fileName);
  assert.equal(restored.sha256, original.sha256);
  assert.equal(restored.updatedAt, original.updatedAt);
  assert.deepEqual(restored.data, original.data);
});
test('unknown version, tampering, malformed data and extension/content mismatch are rejected', async () => {
  const doc = await createLibraryDocument('문서', bytes(), 'hwp');
  const backup = JSON.parse(await encodeBackup([doc]));
  await assert.rejects(
    () => decodeBackup(JSON.stringify({ ...backup, version: 2 })),
    /버전/,
  );
  backup.documents[0].sha256 = '0'.repeat(64);
  await assert.rejects(() => decodeBackup(JSON.stringify(backup)), /체크섬/);
  backup.documents[0].data = '!!!!';
  await assert.rejects(() => decodeBackup(JSON.stringify(backup)), /손상/);
  await assert.rejects(
    () =>
      createLibraryDocument(
        'bad',
        new TextEncoder().encode('<html>error</html>'),
        'hwpx',
      ),
    /형식/,
  );
});
test('same name with different content is additive; repeated import skips identical content', async () => {
  const old = await createLibraryDocument('업무', bytes('old'), 'hwp');
  const next = await createLibraryDocument('업무', bytes('new'), 'hwp', old.id);
  await saveDocument(old);
  assert.deepEqual(await importDocuments([next]), { added: 1, skipped: 0 });
  const rows = await listDocuments();
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.id)).size, 2);
  assert.deepEqual(await importDocuments([next]), { added: 0, skipped: 1 });
  assert.deepEqual(rows.find((row) => row.id === old.id)?.data, old.data);
});
test('an invalid later entry prevents the entire import before any write', async () => {
  const original = await createLibraryDocument(
    '원본',
    bytes('original'),
    'hwp',
  );
  await saveDocument(original);
  const backup = JSON.parse(
    await encodeBackup([
      await createLibraryDocument('추가', bytes('new'), 'hwp'),
      original,
    ]),
  );
  backup.documents[1].sha256 = 'bad';
  await assert.rejects(async () => {
    const validated = await decodeBackup(JSON.stringify(backup));
    await importDocuments(validated);
  });
  assert.equal((await listDocuments()).length, 1);
});
test('write failure aborts all rows rather than reporting successful migration', async () => {
  const old = await createLibraryDocument('원본', bytes('old'), 'hwp');
  await saveDocument(old);
  const rows = await Promise.all(
    ['추가1', '추가2'].map((name) =>
      createLibraryDocument(name, bytes(name), 'hwp'),
    ),
  );
  const originalPut = IDBObjectStore.prototype.put;
  let calls = 0;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (++calls === 2) throw new DOMException('quota', 'QuotaExceededError');
    return originalPut.apply(this, args);
  };
  try {
    await assert.rejects(() => importDocuments(rows), /quota/);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(
    (await listDocuments()).map((row) => row.id),
    [old.id],
  );
});
test('count limit fails without trimming existing documents; updates persist and deletes are targeted', async () => {
  const doc = await createLibraryDocument('문서', bytes(), 'hwp');
  const many = Array.from({ length: MAX_DOCUMENTS }, (_, i) => ({
    ...doc,
    id: String(i),
    fileName: `${i}.hwp`,
  }));
  assert.throws(
    () => planImport(many, [{ ...doc, fileName: '추가.hwp' }]),
    /한도/,
  );
  await saveDocument(doc);
  await saveDocument({ ...doc, fileName: '변경.hwp' });
  assert.equal((await listDocuments())[0].fileName, '변경.hwp');
  await deleteDocument(doc.id);
  assert.equal((await listDocuments()).length, 0);
});

const snapshot = () =>
  new TextEncoder().encode(
    JSON.stringify({
      meta: {
        name: '이전 작업',
        pageCount: 1,
        sectionCount: 1,
        pageDisplayNumbers: [1],
      },
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          sectionPage: 1,
          globalIndex: 0,
          controlCount: 0,
          text: '이전 내용',
          normalizedText: '이전내용',
          stableId: '원본-id',
          signature: 'sig',
          isAnchorCandidate: true,
        },
      ],
      controls: [],
    }),
  );

test('portable workspace preserves both IR identity history and legacy HWP history', async () => {
  const doc = await createLibraryDocument('원본', bytes(), 'hwp');
  const ir = await createArchivedHistory(
    '첫 초안',
    '원본.hwp',
    1700000000000,
    'ir',
    snapshot(),
  );
  const legacy = await createArchivedHistory(
    '구버전',
    '원본.hwp',
    1600000000000,
    'legacy',
    bytes('legacy'),
  );
  const restored = await decodeWorkspaceBackup(
    await encodeWorkspaceBackup([doc], [ir, legacy]),
  );
  assert.equal(restored.documents.length, 1);
  assert.equal(restored.history.length, 2);
  assert.equal(restored.history[0].label, ir.label);
  assert.equal(restored.history[0].createdAt, ir.createdAt);
  assert.equal(
    parseHistorySnapshot(restored.history[0].data).paragraphs[0].stableId,
    '원본-id',
  );
  assert.deepEqual(restored.history[1].data, legacy.data);
  assert.deepEqual(
    await importWorkspace(restored.documents, restored.history),
    { added: 1, skipped: 0, historyAdded: 2, historySkipped: 0 },
  );
  assert.deepEqual(
    await importWorkspace(restored.documents, restored.history),
    { added: 0, skipped: 1, historyAdded: 0, historySkipped: 2 },
  );
  assert.equal((await listArchivedHistory()).length, 2);
});

test('history corruption rejects the entire workspace before document writes', async () => {
  const doc = await createLibraryDocument('추가', bytes(), 'hwp');
  const history = await createArchivedHistory(
    '작업',
    '추가.hwp',
    1,
    'ir',
    snapshot(),
  );
  const value = JSON.parse(await encodeWorkspaceBackup([doc], [history]));
  value.history[0].sha256 = 'bad';
  await assert.rejects(async () => {
    const rows = await decodeWorkspaceBackup(JSON.stringify(value));
    await importWorkspace(rows.documents, rows.history);
  }, /체크섬/);
  assert.equal((await listDocuments()).length, 0);
  assert.equal((await listArchivedHistory()).length, 0);
  const bad = JSON.parse(new TextDecoder().decode(snapshot()));
  bad.meta.pageDisplayNumbers = ['bad'];
  assert.throws(
    () => parseHistorySnapshot(new TextEncoder().encode(JSON.stringify(bad))),
    /쪽번호/,
  );
});

test('history write failure rolls back document and history stores together', async () => {
  const doc = await createLibraryDocument('추가', bytes(), 'hwp');
  const history = await createArchivedHistory(
    '작업',
    '추가.hwp',
    1,
    'ir',
    snapshot(),
  );
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (this.name === 'history')
      throw new DOMException('quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try {
    await assert.rejects(() => importWorkspace([doc], [history]), /quota/);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.equal((await listDocuments()).length, 0);
  assert.equal((await listArchivedHistory()).length, 0);
});

test('v1 database upgrade preserves existing documents and accepts documents-only backups', async () => {
  const doc = await createLibraryDocument('기존 보관본', bytes(), 'hwp');
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('geulgyeol-workspace', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('documents', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(doc);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => reject(tx.error);
    };
  });
  assert.equal((await listDocuments())[0].id, doc.id);
  assert.deepEqual(await listArchivedHistory(), []);
  assert.equal(
    (await decodeWorkspaceBackup(await encodeBackup([doc]))).history.length,
    0,
  );
});
