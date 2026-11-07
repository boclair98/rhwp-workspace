import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteNamedWritingDraft, exportWritingDrafts, importWritingDrafts, listWritingDrafts,
  saveNamedWritingDraft, WRITING_DRAFT_BACKUP_LIMIT, WRITING_DRAFT_LIMIT, WRITING_DRAFT_LIBRARY_KEY, type SavedWritingDraft,
} from '../frontend/src/workspace/writing-draft-library.ts';
import { saveWritingDraft, type WritingDraft, type WritingDraftStorage } from '../frontend/src/workspace/writing-draft-store.ts';

const storageKey = WRITING_DRAFT_LIBRARY_KEY;
const legacyKey = 'rhwp.writing-draft';
const draft: WritingDraft = {
  mode: 'draft',
  method: 'template',
  templateId: 'meeting',
  templateValues: { meeting: { name: '주말 모임', place: '주민센터' }, letter: { recipient: '친구' } },
  prompt: '',
  manual: '안녕하세요.',
  preview: { text: '토요일에 만나요.', source: 'manual' },
};

function memoryStorage() {
  const records = new Map<string, string>();
  const writes: string[] = [];
  const storage: WritingDraftStorage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { writes.push(value); records.set(key, value); },
    removeItem: key => { records.delete(key); },
  };
  return { records, storage, writes };
}

function backup(entries: SavedWritingDraft[]): string {
  return JSON.stringify({ format: 'rhwp-writing-drafts', version: 1, entries });
}

test('이전 초안을 첫 저장에서 옮기고 이전 버전의 추가 저장이 새 보관함을 덮지 않는다', () => {
  const { records, storage, writes } = memoryStorage();
  assert.deepEqual(listWritingDrafts(storage), []);
  saveWritingDraft(draft, storage);
  const legacy = records.get(legacyKey);
  assert.deepEqual(listWritingDrafts(storage), [
    { id: 'legacy-draft', name: '이전에 보관한 초안', createdAt: 0, updatedAt: 0, draft },
  ]);
  assert.equal(exportWritingDrafts(storage), backup(listWritingDrafts(storage)));
  assert.equal(records.get(legacyKey), legacy);
  assert.equal(writes.length, 1);

  const entry = saveNamedWritingDraft({ name: '새 초안', draft }, storage);
  assert.equal(records.size, 1);
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(records.get(storageKey)!).version, 2);
  assert.deepEqual(listWritingDrafts(storage).map(row => row.id), [entry.id, 'legacy-draft']);
  saveWritingDraft({ ...draft, manual: '이전 창에서 쓴 글' }, storage);
  assert.deepEqual(listWritingDrafts(storage).map(row => row.id), [entry.id, 'legacy-draft']);
  assert.equal(listWritingDrafts(storage)[1].draft.manual, draft.manual);
});

test('같은 이름의 초안은 각각 보관하고 이름은 공백을 다듬어 유니코드 60자까지 받는다', () => {
  const { storage, writes } = memoryStorage();
  const name = '🌷'.repeat(60);
  const first = saveNamedWritingDraft({ name: `  ${name}  `, draft }, storage);
  const second = saveNamedWritingDraft({ name, draft: { ...draft, manual: '새 문장입니다.' } }, storage);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(listWritingDrafts(storage), [second, first]);
  assert.equal(first.name, name);
  for (const invalid of ['', '　', '🌷'.repeat(61), '\n이름', '글\u007f', '제\u202e목']) {
    assert.throws(() => saveNamedWritingDraft({ name: invalid, draft }, storage), /초안 이름을/);
  }
  assert.equal(writes.length, 2);
});

test('변경 보관은 ID와 처음 보관한 시각을 유지하고 이전 수정 시각을 거부한다', () => {
  const { storage, writes } = memoryStorage();
  const original = saveNamedWritingDraft({ name: '글', draft }, storage);
  const input = { name: '고친 글', draft, id: original.id };
  assert.throws(() => saveNamedWritingDraft(input, storage), /최신 초안/);
  assert.throws(() => saveNamedWritingDraft({ ...input, id: 'missing', expectedUpdatedAt: original.updatedAt }, storage), /보관함에 없어요/);
  const updated = saveNamedWritingDraft({ ...input, expectedUpdatedAt: original.updatedAt }, storage);
  assert.equal(updated.id, original.id);
  assert.equal(updated.createdAt, original.createdAt);
  assert.ok(updated.updatedAt > original.updatedAt);
  assert.throws(() => saveNamedWritingDraft({ ...input, expectedUpdatedAt: original.updatedAt }, storage), /최신 초안/);
  assert.deepEqual(listWritingDrafts(storage), [updated]);
  assert.equal(writes.length, 2);
});

test('삭제는 이전 수정 시각을 거부하고 마지막 초안을 지운 뒤 빈 보관함을 유지한다', () => {
  const { records, storage } = memoryStorage();
  saveWritingDraft(draft, storage);
  const [legacy] = listWritingDrafts(storage);
  assert.throws(() => deleteNamedWritingDraft(legacy.id, 1, storage), /최신 초안/);
  assert.throws(() => deleteNamedWritingDraft('missing', 0, storage), /보관함에 없어요/);
  deleteNamedWritingDraft(legacy.id, legacy.updatedAt, storage);
  assert.deepEqual(JSON.parse(records.get(storageKey)!), { version: 2, entries: [] });
  saveWritingDraft(draft, storage);
  assert.deepEqual(listWritingDrafts(storage), []);
  assert.equal(exportWritingDrafts(storage), backup([]));
});

test('백업을 한 번에 추가하고 같은 이름과 내용은 건너뛰며 충돌하는 ID는 새로 만든다', () => {
  const { storage, writes } = memoryStorage();
  const original = saveNamedWritingDraft({ name: '모임 공지', draft }, storage);
  const changed = { ...original, draft: { ...draft, manual: '다른 내용입니다.' } };
  const duplicate = {
    ...original,
    id: 'duplicate',
    draft: { ...draft, templateValues: { letter: { recipient: '친구' }, meeting: { place: '주민센터', name: '주말 모임' } } },
  };
  const otherName = { ...original, id: 'other-name', name: '다른 이름' };
  const text = backup([changed, duplicate, otherName]);
  assert.deepEqual(importWritingDrafts(text, storage), { added: 2, skipped: 1 });
  assert.equal(writes.length, 2);

  const [first, second, third] = listWritingDrafts(storage);
  assert.deepEqual(first, original);
  assert.deepEqual(second, { ...changed, id: second.id });
  assert.notEqual(second.id, original.id);
  assert.deepEqual(third, otherName);
  assert.deepEqual(importWritingDrafts(text, storage), { added: 0, skipped: 3 });
  assert.equal(writes.length, 2);

  const restored = memoryStorage().storage;
  assert.deepEqual(importWritingDrafts(exportWritingDrafts(storage), restored), { added: 3, skipped: 0 });
  assert.deepEqual(listWritingDrafts(restored), listWritingDrafts(storage));
});

test('손상된 백업 전체를 거부하고 앞에서 검사한 항목도 추가하지 않는다', () => {
  const { records, storage, writes } = memoryStorage();
  const original = saveNamedWritingDraft({ name: '원래 글', draft }, storage);
  const incoming = { ...original, id: 'incoming', name: '가져올 글' };
  const next = { ...incoming, id: 'another' };
  const before = records.get(storageKey);
  for (const invalid of [
    '{',
    backup([incoming, { ...next, id: incoming.id }]),
    backup([incoming, { ...next, id: '..' }]),
    backup([incoming, { ...next, updatedAt: -1 }]),
    backup([incoming, { ...next, createdAt: next.updatedAt + 1 }]),
    backup([incoming, { ...next, updatedAt: 1.5 }]),
    backup([incoming, { ...next, updatedAt: Number.MAX_SAFE_INTEGER }]),
    backup([incoming, { ...next, name: '  ' }]),
    backup([incoming, { ...next, draft: { ...draft, consent: true } }]),
    JSON.stringify({ format: 'rhwp-writing-drafts', version: 1, entries: [{ ...incoming, documentBytes: [0] }] }),
    JSON.stringify({ format: 'rhwp-writing-drafts', version: 1, entries: [incoming], credentials: {} }),
  ]) {
    assert.throws(() => importWritingDrafts(invalid, storage), /원본 백업 파일/);
    assert.equal(records.get(storageKey), before);
  }
  assert.equal(writes.length, 1);
});

test('백업의 버전, 파일 형식과 UTF-8 크기를 검사한다', () => {
  const { storage, writes } = memoryStorage();
  assert.throws(() => importWritingDrafts('{"format":"rhwp-writing-drafts","version":2,"entries":[]}', storage), /최신 버전/);
  assert.throws(() => importWritingDrafts('{"format":"geulgyeol-workspace","version":1,"entries":[]}', storage), /원본 백업 파일/);
  const multibyte = JSON.stringify('글'.repeat(Math.ceil(WRITING_DRAFT_BACKUP_LIMIT / 3)));
  assert.ok(multibyte.length < WRITING_DRAFT_BACKUP_LIMIT);
  assert.throws(() => importWritingDrafts(multibyte, storage), /500KB/);
  assert.equal(writes.length, 0);
});

test('저장이나 가져오기가 12개 한도를 넘으면 기존 항목을 그대로 둔다', () => {
  const { records, storage, writes } = memoryStorage();
  for (let index = 0; index < WRITING_DRAFT_LIMIT; index++) {
    saveNamedWritingDraft({ name: `초안 ${index}`, draft }, storage);
  }
  const before = records.get(storageKey);
  const [row] = listWritingDrafts(storage);
  assert.throws(() => saveNamedWritingDraft({ name: '초과', draft }, storage), /12개까지/);
  assert.throws(() => importWritingDrafts(backup([{ ...row, id: 'new', name: '초과' }]), storage), /12개까지/);
  assert.equal(records.get(storageKey), before);
  assert.equal(writes.length, WRITING_DRAFT_LIMIT);
});

test('손상된 보관함을 읽거나 수정할 때 원래 기록을 그대로 둔다', () => {
  const { records, storage, writes } = memoryStorage();
  const saved = { id: 'test', name: '초안', createdAt: 0, updatedAt: 0, draft };
  for (const invalid of [
    '{',
    JSON.stringify({ version: 2, entries: [saved], target: '문서 위치' }),
    JSON.stringify({ version: 2, entries: [{ ...saved, draft: { ...draft, selectedText: '원문' } }] }),
    ' '.repeat(WRITING_DRAFT_BACKUP_LIMIT + 1),
  ]) {
    records.set(storageKey, invalid);
    assert.throws(() => listWritingDrafts(storage), /보관함을 읽을 수 없어요/);
    assert.throws(() => saveNamedWritingDraft({ name: '초안', draft }, storage), /보관함을 읽을 수 없어요/);
    assert.equal(records.get(storageKey), invalid);
  }
  records.set(storageKey, JSON.stringify({ version: 3, entries: [] }));
  assert.throws(() => listWritingDrafts(storage), /최신 버전/);
  assert.equal(writes.length, 0);
});

test('브라우저 접근과 쓰기 실패를 알리고 실패한 변환·삭제·가져오기를 반영하지 않는다', () => {
  const { records, storage } = memoryStorage();
  saveWritingDraft(draft, storage);
  const original = records.get(legacyKey);
  const failedRead: WritingDraftStorage = { ...storage, getItem: () => { throw new Error('Blocked'); } };
  const failedWrite: WritingDraftStorage = { ...storage, setItem: () => { throw new Error('Quota exceeded'); } };
  assert.throws(() => listWritingDrafts(failedRead), /브라우저 저장 설정/);
  assert.throws(() => saveNamedWritingDraft({ name: '새 초안', draft }, failedWrite), /변경을 저장하지 못했어요/);
  const [legacy] = listWritingDrafts(failedWrite);
  assert.throws(() => deleteNamedWritingDraft(legacy.id, legacy.updatedAt, failedWrite), /변경을 저장하지 못했어요/);
  assert.throws(() => importWritingDrafts(backup([{ ...legacy, name: '다른 초안' }]), failedWrite), /변경을 저장하지 못했어요/);
  assert.equal(records.get(legacyKey), original);
  assert.equal(records.get(storageKey), undefined);
});
