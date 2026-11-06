import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiTarget, validateAiTarget, validateRevision, revisionDifference } from '../frontend/src/workspace/ai-edit.ts';

const position = (charOffset: number, extra = {}) => ({ sectionIndex: 0, paragraphIndex: 0, charOffset, ...extra });
const capture = () => createAiTarget({ start: position(3), end: position(7) }, '앞말 😀한글문장 뒷말', 4, 8);

test('선택 위치는 UTF-16이 아닌 Unicode 글자 수로 읽고 주변 문장을 보존한다', () => {
  const target = capture();
  assert.equal(target.text, '😀한글문');
  assert.equal(target.paragraphText, '앞말 😀한글문장 뒷말');
  assert.deepEqual(revisionDifference('가😀나다', '가😀수정다'), { prefix: '가😀', removed: '나', added: '수정', suffix: '다' });
});
test('서로 다른 문단, 셀, 중첩 셀의 범위를 혼합하지 않는다', () => {
  for (const extra of [{ paragraphIndex: 1 }, { parentParaIndex: 0, cellIndex: 1 }, { cellPath: [{ controlIndex: 0, cellIndex: 2, cellParaIndex: 0 }] }, { isTextBox: true }]) {
    assert.throws(() => createAiTarget({ start: position(0), end: position(2, extra) }, '한국어', 1, 1));
  }
  const cell = { parentParaIndex: 0, controlIndex: 0, cellIndex: 1, cellParaIndex: 0 };
  assert.equal(createAiTarget({ start: position(0, cell), end: position(3, cell) }, '표 문장', 1, 1).text, '표 문');
});
test('잘못된 선택과 제어 문자, 과대 범위는 거부한다', () => {
  for (const [start, end, text] of [[0, 0, '문장'], [-1, 1, '문장'], [0, 5, '문장'], [0, 2, '\t한글'], [0, 2001, '가'.repeat(2001)] ] as const) {
    assert.throws(() => createAiTarget({ start: position(start), end: position(end) }, text, 1, 1));
  }
});
test('파일 교체, 같은 문서의 다른 편집, 선택 문단 변경을 모두 차단한다', () => {
  const target = capture();
  assert.doesNotThrow(() => validateAiTarget(target, 4, 8, target.paragraphText));
  assert.throws(() => validateAiTarget(target, 5, 8, target.paragraphText));
  assert.throws(() => validateAiTarget(target, 4, 9, target.paragraphText));
  assert.throws(() => validateAiTarget(target, 4, 8, '앞에 추가' + target.paragraphText));
});
test('빈 문장으로 삭제, 줄바꿈, 제어 문자, 같은 내용과 과대 수정안을 거부한다', () => {
  for (const value of ['', '  ', '원문', '두\n문단', '제어\u0000문자', '가'.repeat(2001), '\ud800']) assert.throws(() => validateRevision('원문', value));
  assert.equal(validateRevision('원문', '수정한 문장 😀'), '수정한 문장 😀');
});
test('원문 위치를 복제해서 뒤늦은 커서/선택 변경으로 오염되지 않는다', () => {
  const start = position(0, { cellPath: [{ controlIndex: 0, cellIndex: 1, cellParaIndex: 0 }] });
  const end = { ...start, charOffset: 2 };
  const target = createAiTarget({ start, end }, '한글', 1, 1);
  start.charOffset = 1; start.cellPath[0].cellIndex = 8;
  assert.equal(target.start.charOffset, 0); assert.equal(target.start.cellPath?.[0].cellIndex, 1);
});
test('추가/삭제만 있는 수정안에서도 변경 전후 문장 전체를 재구성할 수 있다', () => {
  for (const [before, after] of [['한국어', '좋은 한국어'], ['좋은 한국어', '한국어'], ['가나다', '전부 수정'], ['동일', '동일']]) {
    const d = revisionDifference(before, after);
    assert.equal(d.prefix + d.removed + d.suffix, before);
    assert.equal(d.prefix + d.added + d.suffix, after);
  }
});
