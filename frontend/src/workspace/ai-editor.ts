import type { WasmBridge } from '../core/wasm-bridge';
import type { InputHandler } from '../engine/input-handler';
import type { DocumentPosition } from '../core/types';
import { createAiTarget, validateAiTarget, validateDraft, validateRevision, codePointLength, type AiEditTarget } from './ai-edit.ts';

const cell = (pos: DocumentPosition) => pos.parentParaIndex !== undefined;
function cellPath(pos: DocumentPosition) {
  return pos.cellPath?.length ? pos.cellPath : [{ controlIndex: pos.controlIndex, cellIndex: pos.cellIndex, cellParaIndex: pos.cellParaIndex }];
}

function path(pos: DocumentPosition): string {
  return JSON.stringify(cellPath(pos));
}

function samePosition(a: DocumentPosition, b: DocumentPosition): boolean {
  if (a.sectionIndex !== b.sectionIndex || a.paragraphIndex !== b.paragraphIndex
    || a.charOffset !== b.charOffset || a.parentParaIndex !== b.parentParaIndex
    || Boolean(a.isTextBox) !== Boolean(b.isTextBox)) return false;
  if (!cell(a)) return true;

  const left = cellPath(a), right = cellPath(b);
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return entry.controlIndex === other.controlIndex && entry.cellIndex === other.cellIndex
      && entry.cellParaIndex === other.cellParaIndex;
  });
}

/** The text actually written by one AI operation, excluding added paragraph separators. */
export interface AiAppliedRange {
  kind: 'body' | 'sentence';
  generation: number;
  revision: number;
  start: DocumentPosition;
  end: DocumentPosition;
  text: string;
}

export class AiEditor {
  revision = 0;
  private wasm: WasmBridge;
  private input: () => InputHandler | null;
  constructor(wasm: WasmBridge, input: () => InputHandler | null) { this.wasm = wasm; this.input = input; }

  private paragraph(pos: DocumentPosition): string {
    const w = this.wasm;
    if (cell(pos)) {
      // Counts larger than a cell's actual text are clamped by RHWP. Refuse very large paragraphs.
      return w.getTextInCellByPath(pos.sectionIndex, pos.parentParaIndex!, path(pos), 0, 20001);
    }
    const length = w.getParagraphLength(pos.sectionIndex, pos.paragraphIndex);
    if (length > 20000) throw new Error('이 문단은 너무 길어요. 짧은 문단에서 다시 선택해 주세요.');
    return w.getTextRange(pos.sectionIndex, pos.paragraphIndex, 0, length);
  }

  private editableInput(): InputHandler {
    const input = this.input();
    if (!input || !this.wasm.hasLoadedDocument()) throw new Error('문서가 준비된 뒤 문장을 선택해 주세요.');
    if (input.isFormMode() || input.isInSeparateCaretSpace() || input.isInCellSelectionMode()
      || input.isInTableObjectSelection() || input.isInPictureObjectSelection()) {
      throw new Error('본문이나 표 셀의 일반 글자에서 이용해 주세요.');
    }
    return input;
  }

  capture(): AiEditTarget {
    const input = this.editableInput();
    const selection = input.getSelection();
    if (!selection) throw new Error('문서에서 수정할 문장을 먼저 선택해 주세요.');
    const target = createAiTarget(selection, this.paragraph(selection.start), this.wasm.documentGeneration, this.revision);
    if (codePointLength(target.paragraphText) > 20000) throw new Error('이 문단은 너무 길어요. 짧은 문단에서 다시 선택해 주세요.');
    for (let offset = target.start.charOffset; offset <= target.end.charOffset; offset++) {
      const field = this.wasm.getFieldInfoAt({ ...target.start, charOffset: offset });
      if (field.inField) throw new Error('링크·누름틀 같은 필드가 포함된 범위는 아직 지원하지 않아요. 일반 문장을 선택해 주세요.');
    }
    return target;
  }

  captureDraft(): AiEditTarget {
    const input = this.editableInput();
    const start = structuredClone(input.getCursorPosition());
    if (input.hasSelection() || cell(start) || start.isTextBox || this.wasm.getFieldInfoAt(start).inField) {
      throw new Error('문서 본문에서 글을 넣을 곳을 한 번 눌러 주세요.');
    }
    const paragraphText = this.paragraph(start);
    if (!Number.isInteger(start.charOffset) || start.charOffset < 0 || start.charOffset > codePointLength(paragraphText)) {
      throw new Error('문서 본문에서 글을 넣을 곳을 다시 눌러 주세요.');
    }
    return { start, end: start, generation: this.wasm.documentGeneration, revision: this.revision, text: '', paragraphText };
  }

  assertCurrent(target: AiEditTarget): void {
    if (target.generation !== this.wasm.documentGeneration || target.revision !== this.revision) {
      throw new Error('문서가 바뀌었어요. 글을 넣을 위치나 다듬을 문장을 다시 골라 주세요.');
    }
    validateAiTarget(target, this.wasm.documentGeneration, this.revision, this.paragraph(target.start));
  }

  assertCurrentPosition(target: AiEditTarget, mode: 'draft' | 'rewrite'): void {
    this.assertCurrent(target);
    const current = mode === 'draft' ? this.captureDraft() : this.capture();
    if (current.generation !== target.generation || current.revision !== target.revision
      || current.text !== target.text || !samePosition(current.start, target.start) || !samePosition(current.end, target.end)) {
      throw new Error('문서에서 위치나 선택이 바뀌었어요. 다시 미리본 뒤 넣어 주세요.');
    }
  }

  private appliedRange(kind: AiAppliedRange['kind'], start: DocumentPosition, end: DocumentPosition, text: string): AiAppliedRange {
    return { kind, start: structuredClone(start), end: structuredClone(end), text, generation: this.wasm.documentGeneration, revision: this.revision };
  }

  isCurrentApplied(range: AiAppliedRange): boolean {
    return range.generation === this.wasm.documentGeneration && range.revision === this.revision;
  }

  private insertBodyLines(w: WasmBridge, start: DocumentPosition, lines: string[], prefix: string, suffix: string): DocumentPosition {
    const { sectionIndex, paragraphIndex, charOffset } = start;
    let pos = { sectionIndex, paragraphIndex, charOffset };
    for (const [index, line] of lines.entries()) {
      if (line) w.insertText(sectionIndex, pos.paragraphIndex, pos.charOffset, line);
      pos.charOffset += codePointLength(line);
      if (index < lines.length - 1) {
        const result = JSON.parse(w.splitParagraph(sectionIndex, pos.paragraphIndex, pos.charOffset));
        if (!result.ok || result.paraIdx !== pos.paragraphIndex + 1) throw new Error('문단을 나눌 수 없어요. 다른 위치에서 다시 시도해 주세요.');
        pos = { sectionIndex, paragraphIndex: result.paraIdx, charOffset: 0 };
      }
    }
    for (const [index, line] of lines.entries()) {
      const expected = (index === 0 ? prefix : '') + line + (index === lines.length - 1 ? suffix : '');
      if (this.paragraph({ sectionIndex, paragraphIndex: paragraphIndex + index, charOffset: 0 }) !== expected) {
        throw new Error('글을 바꾸는 중 문제가 생겨 원래 문서로 되돌렸어요.');
      }
    }
    return pos;
  }

  applyDraft(target: AiEditTarget, proposed: string, separateParagraphs = false): AiAppliedRange {
    const input = this.editableInput();
    this.assertCurrent(target);
    const text = validateDraft(proposed);
    const { sectionIndex, paragraphIndex, charOffset } = target.start;
    const original = [...target.paragraphText];
    const prefix = original.slice(0, charOffset).join('');
    const suffix = original.slice(charOffset).join('');
    const leading = separateParagraphs && prefix.trim() ? '\n\n' : '';
    const trailing = separateParagraphs && suffix.trim() ? '\n\n' : '';
    const lines = text.split('\n');
    let ran = false;
    input.executeOperation({
      kind: 'snapshot',
      operationType: 'aiDraftInsertion',
      operation: w => {
        this.assertCurrent(target);
        const pos = this.insertBodyLines(w, target.start, (leading + text + trailing).split('\n'), prefix, suffix);
        ran = true;
        return pos;
      },
    });
    if (!ran) throw new Error('현재 위치에 글을 넣을 수 없어요. 본문을 다시 눌러 주세요.');
    const start = { sectionIndex, paragraphIndex: paragraphIndex + (leading ? 2 : 0), charOffset: leading ? 0 : charOffset };
    const end = {
      sectionIndex,
      paragraphIndex: start.paragraphIndex + lines.length - 1,
      charOffset: (lines.length === 1 ? start.charOffset : 0) + codePointLength(lines[lines.length - 1]),
    };
    return this.appliedRange('body', start, end, text);
  }

  replaceApplied(range: AiAppliedRange, proposed: string): AiAppliedRange {
    const changed = '방금 쓴 부분의 위치를 확인할 수 없어요. 수정할 문장을 선택하고 다시 요청해 주세요.';
    if (!this.isCurrentApplied(range)) throw new Error(changed);
    if (range.kind === 'sentence') {
      const target = createAiTarget(range, this.paragraph(range.start), range.generation, range.revision);
      if (target.text !== range.text) throw new Error(changed);
      return this.apply(target, proposed);
    }

    const input = this.editableInput();
    const text = validateDraft(proposed);
    if (text === range.text) throw new Error('방금 쓴 글과 같아요. 바꿀 내용을 조금 더 알려 주세요.');
    const { start, end } = range;
    const { sectionIndex, paragraphIndex, charOffset } = start;
    const lines = text.split('\n');
    let newEnd: DocumentPosition | undefined;
    input.executeOperation({
      kind: 'snapshot',
      operationType: 'aiDraftRevision',
      operation: w => {
        if (!this.isCurrentApplied(range)) throw new Error(changed);
        const original: string[] = [];
        for (let para = paragraphIndex; para <= end.paragraphIndex; para++) {
          original.push(this.paragraph({ sectionIndex, paragraphIndex: para, charOffset: 0 }));
        }
        const first = [...original[0]], last = [...original[original.length - 1]];
        if (charOffset > first.length || end.charOffset > last.length) throw new Error(changed);
        const actual = original.map((line, index) => [...line].slice(
          index === 0 ? charOffset : 0,
          index === original.length - 1 ? end.charOffset : undefined,
        ).join('')).join('\n');
        if (actual !== range.text) throw new Error(changed);
        const prefix = first.slice(0, charOffset).join('');
        const suffix = last.slice(end.charOffset).join('');
        const count = w.getParagraphCount(sectionIndex);
        const controls = () => w.getControls().map(control => control.ctrlId).join(' ');
        const beforeControls = controls();
        const removed = w.deleteRange(sectionIndex, paragraphIndex, charOffset, end.paragraphIndex, end.charOffset);
        if (!removed.ok || this.paragraph(start) !== prefix + suffix) throw new Error(changed);
        const position = this.insertBodyLines(w, start, lines, prefix, suffix);
        if (w.getParagraphCount(sectionIndex) !== count - original.length + lines.length || beforeControls !== controls()) {
          throw new Error('표나 개체를 보호하기 위해 문서를 원래대로 되돌렸어요.');
        }
        newEnd = position;
        return position;
      },
    });
    if (!newEnd) throw new Error('현재 편집 상태에서는 글을 바꿀 수 없어요.');
    return this.appliedRange('body', start, newEnd, text);
  }

  apply(target: AiEditTarget, proposed: string): AiAppliedRange {
    const input = this.input();
    if (!input || input.isFormMode() || input.isInSeparateCaretSpace()) throw new Error('일반 편집 모드에서 적용해 주세요.');
    this.assertCurrent(target);
    const text = validateRevision(target.text, proposed);
    const p = target.start, count = target.end.charOffset - p.charOffset;
    let ran = false;
    input.executeOperation({
      kind: 'snapshot', operationType: 'aiSentenceRevision',
      selectionBefore: { start: structuredClone(target.start), end: structuredClone(target.end), blockPhase: null },
      operation: w => {
        this.assertCurrent(target);
        const shape = cell(p)
          ? w.getCellCharPropertiesAtByPath(p.sectionIndex, p.parentParaIndex!, path(p), p.charOffset)
          : w.getCharPropertiesAt(p.sectionIndex, p.paragraphIndex, p.charOffset);
        if (cell(p)) {
          w.deleteTextInCellByPath(p.sectionIndex, p.parentParaIndex!, path(p), p.charOffset, count);
          w.insertTextInCellByPath(p.sectionIndex, p.parentParaIndex!, path(p), p.charOffset, text);
          w.applyCharFormatInCellByPath(p.sectionIndex, p.parentParaIndex!, path(p), p.charOffset, p.charOffset + codePointLength(text), JSON.stringify(shape));
        } else {
          w.deleteText(p.sectionIndex, p.paragraphIndex, p.charOffset, count);
          w.insertText(p.sectionIndex, p.paragraphIndex, p.charOffset, text);
          w.applyCharFormat(p.sectionIndex, p.paragraphIndex, p.charOffset, p.charOffset + codePointLength(text), JSON.stringify(shape));
        }
        const actual = this.paragraph(p);
        const expected = [...target.paragraphText].slice(0, p.charOffset).join('') + text + [...target.paragraphText].slice(target.end.charOffset).join('');
        if (actual !== expected) throw new Error('수정 결과가 원래 범위와 맞지 않아 되돌렸어요. 문장을 다시 선택해 주세요.');
        ran = true;
        return { ...p, charOffset: p.charOffset + codePointLength(text) };
      },
    });
    if (!ran) throw new Error('현재 편집 상태에서는 적용할 수 없어요. 일반 편집 모드인지 확인해 주세요.');
    return this.appliedRange('sentence', p, { ...p, charOffset: p.charOffset + codePointLength(text) }, text);
  }
}
