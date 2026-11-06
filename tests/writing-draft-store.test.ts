import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadWritingDraft, saveWritingDraft, type WritingDraft, type WritingDraftStorage,
} from '../frontend/src/workspace/writing-draft-store.ts';

function memoryStorage() {
  const entries = new Map<string, string>();
  const storage: WritingDraftStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  };
  return { entries, storage };
}

const draft: WritingDraft = {
  mode: 'draft',
  method: 'template',
  templateId: 'meeting',
  templateValues: {
    meeting: { name: '토요 모임', date: '', place: '주민센터' },
    letter: { body: '고마웠어요.\n다음에 또 만나요.' },
  },
  prompt: '참석 여부를 물어보는 문장',
  manual: '',
  preview: { text: '토요 모임\n\n주민센터에서 만나요.', source: 'template' },
};

test('채우는 중인 초안과 미리보기를 한 건으로 보관하고 최근 보관본을 불러온다', () => {
  const { entries, storage } = memoryStorage();
  assert.equal(loadWritingDraft(storage), null);
  saveWritingDraft(draft, storage);
  assert.deepEqual(loadWritingDraft(storage), draft);

  const replacement = { ...draft, prompt: '짧게 써 주세요.', preview: undefined };
  saveWritingDraft(replacement, storage);
  assert.equal(entries.size, 1);
  const { preview: _, ...expected } = replacement;
  assert.deepEqual(loadWritingDraft(storage), expected);
});

test('편집 대상과 자격증명 등 초안 이외의 속성은 저장하지 않는다', () => {
  const { entries, storage } = memoryStorage();
  const withTarget = { ...draft, target: { selection: '문서의 글' }, credential: '임시 값' };
  assert.throws(() => saveWritingDraft(withTarget, storage), /초안 정보/);
  assert.equal(entries.size, 0);

  const withUnknownField = { ...draft, templateValues: { meeting: { name: '모임', documentBytes: '임시 값' } } };
  assert.throws(() => saveWritingDraft(withUnknownField, storage), /초안 정보/);
  assert.equal(entries.size, 0);
});

test('길이와 미리보기 형식을 검사하고 실패하면 이전 보관본을 유지한다', () => {
  const { storage } = memoryStorage();
  saveWritingDraft(draft, storage);
  assert.throws(() => saveWritingDraft({ ...draft, prompt: '가'.repeat(1001) }, storage), /1,000자/);
  assert.throws(() => saveWritingDraft({
    ...draft, templateValues: { meeting: { name: '가'.repeat(81) } },
  }, storage), /80자/);
  assert.throws(() => saveWritingDraft({ ...draft, mode: 'rewrite' }, storage), /줄바꿈/);
  assert.deepEqual(loadWritingDraft(storage), draft);
});

test('손상된 JSON, 허용되지 않은 속성과 크기 초과를 명시적으로 보고한다', () => {
  const { entries, storage } = memoryStorage();
  saveWritingDraft(draft, storage);
  const key = [...entries.keys()][0];
  const malformed = [
    '{',
    JSON.stringify({ version: 1, draft: { ...draft, selection: '허용되지 않는 속성' } }),
    ' '.repeat(32_001),
  ];
  for (const value of malformed) {
    entries.set(key, value);
    assert.throws(() => loadWritingDraft(storage), /초안 정보를 읽을 수 없어요/);
    assert.equal(entries.get(key), value);
  }
});

test('지원하지 않는 버전은 손상 기록과 구분해서 안내한다', () => {
  const { entries, storage } = memoryStorage();
  saveWritingDraft(draft, storage);
  const key = [...entries.keys()][0];
  entries.set(key, JSON.stringify({ version: 2, draft, updatedAt: 1 }));
  assert.throws(() => loadWritingDraft(storage), /버전을 열 수 없어요/);
});

test('브라우저 저장 접근과 쓰기 실패를 성공으로 반환하지 않는다', () => {
  const storage: WritingDraftStorage = {
    getItem: () => { throw new Error('Storage unavailable'); },
    setItem: () => { throw new Error('Quota exceeded'); },
  };
  assert.throws(() => loadWritingDraft(storage), /브라우저 저장 설정/);
  assert.throws(() => saveWritingDraft(draft, storage), /초안을 보관하지 못했어요/);
});
