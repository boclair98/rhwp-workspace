import type { DocumentPosition } from '../core/types';

export const AI_TEXT_LIMIT = 2000;
export const codePointLength = (value: string): number => [...value].length;
const controlText = /[\x00-\x1f\x7f\ufffc\u2028\u2029\ud800-\udfff]/u;

export interface AiEditTarget {
  generation: number;
  revision: number;
  start: DocumentPosition;
  end: DocumentPosition;
  text: string;
  paragraphText: string;
}

const location = (pos: DocumentPosition) => JSON.stringify([
  pos.sectionIndex, pos.paragraphIndex, pos.parentParaIndex ?? null,
  pos.controlIndex ?? null, pos.cellIndex ?? null, pos.cellParaIndex ?? null,
  pos.cellPath ?? [], pos.isTextBox ?? false,
]);

export function createAiTarget(
  selection: { start: DocumentPosition; end: DocumentPosition },
  paragraphText: string,
  generation: number,
  revision: number,
): AiEditTarget {
  const { start, end } = selection;
  if (start.isTextBox || end.isTextBox || location(start) !== location(end)) {
    throw new Error('한 문단 또는 한 표 셀 안에서 문장을 선택해 주세요. 여러 문단·셀과 글상자는 아직 지원하지 않아요.');
  }
  if (!Number.isInteger(start.charOffset) || !Number.isInteger(end.charOffset)
    || start.charOffset < 0 || end.charOffset <= start.charOffset
    || end.charOffset > codePointLength(paragraphText)) throw new Error('문서에서 수정할 문장을 먼저 선택해 주세요.');
  const text = [...paragraphText].slice(start.charOffset, end.charOffset).join('');
  if (!text.trim() || codePointLength(text) > AI_TEXT_LIMIT || controlText.test(text)) {
    throw new Error('일반 문장을 2,000자 이내로 선택해 주세요. 개체나 줄바꿈이 포함된 범위는 지원하지 않아요.');
  }
  return { generation, revision, start: structuredClone(start), end: structuredClone(end), text, paragraphText };
}

export function validateAiTarget(target: AiEditTarget, generation: number, revision: number, paragraphText: string): void {
  if (target.generation !== generation || target.revision !== revision || target.paragraphText !== paragraphText) {
    throw new Error('선택한 뒤 문서가 바뀌었어요. 문장을 다시 선택하고 수정안을 확인해 주세요.');
  }
}

export function validateRevision(original: string, proposed: string): string {
  if (!proposed.trim()) throw new Error('수정할 문장을 입력해 주세요. 빈 수정안으로 원문을 지우지 않아요.');
  if (codePointLength(proposed) > AI_TEXT_LIMIT) throw new Error('수정안은 2,000자 이내로 입력해 주세요.');
  if (controlText.test(proposed)) throw new Error('수정안은 줄바꿈이나 제어 문자 없이 한 문단으로 입력해 주세요.');
  if (proposed === original) throw new Error('원문과 수정안이 같아요. 바꿀 내용을 입력해 주세요.');
  return proposed;
}

export function validateDraft(proposed: string): string {
  const text = proposed.replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new Error('문서에 넣을 글을 입력해 주세요.');
  if (codePointLength(text) > AI_TEXT_LIMIT || text.split('\n').length > 16) {
    throw new Error('글을 2,000자와 16줄 이내로 줄여 주세요.');
  }
  if (controlText.test(text.replaceAll('\n', ''))) throw new Error('일반 글자로 입력해 주세요.');
  return text;
}

// A Unicode-safe, bounded change span. Both sides retain the complete sentence.
export function revisionDifference(before: string, after: string) {
  const a = [...before], b = [...after];
  let left = 0, right = 0;
  while (left < a.length && left < b.length && a[left] === b[left]) left++;
  while (right < a.length - left && right < b.length - left && a[a.length - right - 1] === b[b.length - right - 1]) right++;
  return { prefix: a.slice(0, left).join(''), removed: a.slice(left, a.length - right).join(''), added: b.slice(left, b.length - right).join(''), suffix: a.slice(a.length - right).join('') };
}
