import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initSync, HwpDocument } from '../pkg/rhwp.js';
import { AiEditor } from '../frontend/src/workspace/ai-editor.ts';

initSync({ module: fs.readFileSync(new URL('../pkg/rhwp_bg.wasm', import.meta.url)) });

function harness(doc: HwpDocument, selection: any) {
  const w: any = { documentGeneration: 1, hasLoadedDocument: () => true };
  for (const name of ['getParagraphLength', 'getTextRange', 'getTextInCellByPath', 'deleteText', 'insertText', 'splitParagraph', 'deleteTextInCellByPath', 'insertTextInCellByPath', 'applyCharFormat', 'applyCharFormatInCellByPath']) w[name] = (doc as any)[name].bind(doc);
  for (const name of ['getCharPropertiesAt', 'getCellCharPropertiesAtByPath']) w[name] = (...args: any[]) => JSON.parse((doc as any)[name](...args));
  w.getFieldInfoAt = () => ({ inField: false });
  let before = -1, after = -1;
  const input: any = {
    isFormMode: () => false, isInSeparateCaretSpace: () => false, isInCellSelectionMode: () => false,
    isInTableObjectSelection: () => false, isInPictureObjectSelection: () => false, getSelection: () => selection,
    getCursorPosition: () => p(0), hasSelection: () => selection !== null,
    executeOperation: (descriptor: any) => {
      before = doc.saveSnapshot();
      try { descriptor.operation(w); after = doc.saveSnapshot(); }
      catch (error) { doc.restoreSnapshot(before); throw error; }
    },
  };
  return { editor: new AiEditor(w, () => input), w, input, undo: () => doc.restoreSnapshot(before), redo: () => doc.restoreSnapshot(after), release: () => { if (before >= 0) doc.discardSnapshot(before); if (after >= 0) doc.discardSnapshot(after); doc.free(); } };
}
const p = (charOffset: number) => ({ sectionIndex: 0, paragraphIndex: 0, charOffset });

test('새 글 삽입은 선택 없이 여러 문단을 넣고 앞뒤 원문과 저장·되돌리기를 보존한다', () => {
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  doc.insertText(0, 0, 0, '앞말 뒷말');
  doc.splitParagraph(0, 0, 5);
  doc.insertText(0, 1, 0, '다음 문단');
  const h = harness(doc, null);
  h.input.getCursorPosition = () => p(3);
  const assertDraft = (target: HwpDocument) => {
    assert.deepEqual([0, 1, 2, 3].map(index => target.getTextRange(0, index, 0, 100)),
      ['앞말 모임 안내', '', '토요일에 만나요. 뒷말', '다음 문단']);
  };
  try {
    const target = h.editor.captureDraft();
    h.editor.applyDraft(target, '모임 안내\r\n\r\n토요일에 만나요. ');
    // The surrounding document remains byte-for-byte text-identical outside the insertion.
    const saved = new HwpDocument(doc.exportHwp());
    try { assertDraft(saved); } finally { saved.free(); }
    h.undo();
    assert.equal(doc.getTextRange(0, 0, 0, 100), '앞말 뒷말');
    assert.equal(doc.getTextRange(0, 1, 0, 100), '다음 문단');
    h.redo();
    assertDraft(doc);
  } finally { h.release(); }
});

test('실제 HWP 엔진: 선택 범위 수정·첫 글자 서식·주변 문장·Undo/Redo·저장 재열기', () => {
  const blank = HwpDocument.createEmpty(); blank.createBlankDocument();
  const original = '앞말 😀 원래 문장 뒤 문장은 유지합니다.';
  blank.insertText(0, 0, 0, original);
  const start = [...'앞말 😀 '].length, end = start + [...'원래 문장'].length;
  blank.applyCharFormat(0, 0, start, end, JSON.stringify({ bold: true, fontSize: 1200 }));
  const doc = new HwpDocument(blank.exportHwp()); blank.free();
  const h = harness(doc, { start: p(start), end: p(end) });
  try {
    const target = h.editor.capture();
    assert.equal(target.text, '원래 문장');
    h.editor.apply(target, '더 명확한 수정 문장');
    const expected = '앞말 😀 더 명확한 수정 문장 뒤 문장은 유지합니다.';
    assert.equal(doc.getTextRange(0, 0, 0, 500), expected);
    let props = JSON.parse(doc.getCharPropertiesAt(0, 0, start));
    assert.equal(props.bold, true); assert.equal(props.fontSize, 1200);
    h.undo(); assert.equal(doc.getTextRange(0, 0, 0, 500), original);
    h.redo(); assert.equal(doc.getTextRange(0, 0, 0, 500), expected);
    const saved = doc.exportHwp();
    const reopened = new HwpDocument(saved);
    try { assert.equal(reopened.getTextRange(0, 0, 0, 500), expected); props = JSON.parse(reopened.getCharPropertiesAt(0, 0, start)); assert.equal(props.bold, true); assert.equal(props.fontSize, 1200); }
    finally { reopened.free(); }
    fs.mkdirSync(new URL('../test-results/ai-panel/', import.meta.url), { recursive: true });
    fs.writeFileSync(new URL('../test-results/ai-panel/engine-body.hwp', import.meta.url), saved);
  } finally { h.release(); }
});

test('실제 HWP 엔진: 한 표 셀만 수정하고 다른 셀과 표 구조를 유지한다', () => {
  const doc = HwpDocument.createEmpty(); doc.createBlankDocument();
  const created = JSON.parse(doc.createTable(0, 0, 0, 2, 2));
  const ci = created.controlIndex ?? created.controlIdx ?? 0;
  const path = JSON.stringify([{ controlIndex: ci, cellIndex: 0, cellParaIndex: 0 }]);
  doc.insertTextInCellByPath(0, 0, path, 0, '첫 칸 문장');
  const other = JSON.stringify([{ controlIndex: ci, cellIndex: 1, cellParaIndex: 0 }]);
  doc.insertTextInCellByPath(0, 0, other, 0, '두 번째 칸 보존');
  const pos = { ...p(0), parentParaIndex: 0, controlIndex: ci, cellIndex: 0, cellParaIndex: 0, cellPath: JSON.parse(path) };
  const h = harness(doc, { start: pos, end: { ...pos, charOffset: 6 } });
  try {
    const target = h.editor.capture(); assert.equal(target.text, '첫 칸 문장');
    h.editor.assertCurrentPosition(target, 'rewrite');
    h.editor.apply(target, '표 안의 수정 문장');
    assert.equal(doc.getTextInCellByPath(0, 0, path, 0, 500), '표 안의 수정 문장');
    assert.equal(doc.getTextInCellByPath(0, 0, other, 0, 500), '두 번째 칸 보존');
    h.undo(); assert.equal(doc.getTextInCellByPath(0, 0, path, 0, 500), '첫 칸 문장');
    h.redo();
    const saved = doc.exportHwp(), reopened = new HwpDocument(saved);
    try { assert.equal(reopened.getTextInCellByPath(0, 0, path, 0, 500), '표 안의 수정 문장'); assert.equal(reopened.getTextInCellByPath(0, 0, other, 0, 500), '두 번째 칸 보존'); } finally { reopened.free(); }
    fs.writeFileSync(new URL('../test-results/ai-panel/engine-cell.hwp', import.meta.url), saved);
  } finally { h.release(); }
});

test('실제 엔진: 대상 문단이 이동하거나 다른 편집이 생기면 쓰기 전 거부한다', () => {
  const doc = HwpDocument.createEmpty(); doc.createBlankDocument(); doc.insertText(0, 0, 0, '원래 문장');
  const h = harness(doc, { start: p(0), end: p(5) });
  try {
    const target = h.editor.capture(); h.editor.revision++;
    assert.throws(() => h.editor.apply(target, '수정 문장'));
    assert.equal(doc.getTextRange(0, 0, 0, 500), '원래 문장');
    h.editor.revision--; h.w.documentGeneration++;
    assert.throws(() => h.editor.apply(target, '수정 문장'));
    assert.equal(doc.getTextRange(0, 0, 0, 500), '원래 문장');
  } finally { h.release(); }
});

test('초안은 같은 캐럿 위치에서만 적용할 수 있다', () => {
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  doc.insertText(0, 0, 0, '원래 문장');
  const h = harness(doc, null);
  try {
    const target = h.editor.captureDraft();
    h.input.getCursorPosition = () => ({ ...p(0), cursorRect: { pageIndex: 0, x: 12, y: 24, height: 20 } });
    assert.doesNotThrow(() => h.editor.assertCurrentPosition(target, 'draft'));
    h.input.getCursorPosition = () => p(1);
    assert.throws(() => h.editor.assertCurrentPosition(target, 'draft'), /위치나 선택이 바뀌었어요/);
    assert.equal(doc.getTextRange(0, 0, 0, 100), '원래 문장');
  } finally { h.release(); }
});

test('문장 내용이 같아도 선택 범위가 바뀌면 거부한다', () => {
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  doc.insertText(0, 0, 0, '같은 문장 같은 문장');
  const h = harness(doc, { start: p(0), end: p(5) });
  try {
    const target = h.editor.capture();
    assert.doesNotThrow(() => h.editor.assertCurrentPosition(target, 'rewrite'));
    h.input.getSelection = () => ({ start: p(6), end: p(11) });
    assert.equal(h.editor.capture().text, target.text);
    assert.throws(() => h.editor.assertCurrentPosition(target, 'rewrite'), /위치나 선택이 바뀌었어요/);
    assert.equal(doc.getTextRange(0, 0, 0, 100), '같은 문장 같은 문장');
  } finally { h.release(); }
});

test('본문과 캐럿이 같아도 새로 연 문서에 이전 위치를 적용할 수 없다', () => {
  const original = HwpDocument.createEmpty();
  original.createBlankDocument();
  original.insertText(0, 0, 0, '원래 문장');
  const h = harness(original, null);
  try {
    const target = h.editor.captureDraft();
    const reopened = new HwpDocument(original.exportHwp());
    const current = harness(reopened, null);
    try {
      current.w.documentGeneration = h.w.documentGeneration + 1;
      assert.deepEqual(current.editor.captureDraft(), { ...target, generation: current.w.documentGeneration });
      assert.throws(() => current.editor.assertCurrentPosition(target, 'draft'), /문서가 바뀌었어요/);
      assert.equal(reopened.getTextRange(0, 0, 0, 100), '원래 문장');
    } finally { current.release(); }
  } finally { h.release(); }
});
