import { codePointLength, validateDraft } from './ai-edit.ts';

export type WritingTemplateId = 'notice' | 'letter' | 'application' | 'meeting';

export interface WritingTemplateField {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly required: boolean;
  readonly maxLength: number;
  readonly multiline?: boolean;
}

export interface WritingTemplate {
  readonly id: WritingTemplateId;
  readonly label: string;
  readonly fields: readonly WritingTemplateField[];
}

export const WRITING_TEMPLATES: readonly WritingTemplate[] = [
  {
    id: 'notice',
    label: '안내문',
    fields: [
      { id: 'title', label: '제목', placeholder: '예: 도서관 휴관 안내', required: true, maxLength: 80 },
      { id: 'body', label: '알릴 내용', placeholder: '예: 이번 주 금요일에 도서관 문을 닫습니다.', required: true, maxLength: 1200, multiline: true },
      { id: 'audience', label: '안내 대상', placeholder: '예: 도서관 이용자', required: false, maxLength: 80 },
      { id: 'contact', label: '문의할 곳', placeholder: '예: 도서관 안내 데스크', required: false, maxLength: 100 },
    ],
  },
  {
    id: 'letter',
    label: '편지',
    fields: [
      { id: 'recipient', label: '받는 분', placeholder: '예: 할머니', required: true, maxLength: 80 },
      { id: 'body', label: '전할 말', placeholder: '예: 지난번에 챙겨 주신 반찬을 맛있게 먹었어요.', required: true, maxLength: 1200, multiline: true },
      { id: 'sender', label: '보낸 분', placeholder: '예: 지우', required: false, maxLength: 80 },
    ],
  },
  {
    id: 'application',
    label: '신청 사유',
    fields: [
      { id: 'subject', label: '신청하는 일', placeholder: '예: 한글 교실 참가 신청', required: true, maxLength: 100 },
      { id: 'reason', label: '신청 이유', placeholder: '예: 혼자서 안내문과 편지를 쓰고 싶습니다.', required: true, maxLength: 1200, multiline: true },
      { id: 'applicant', label: '신청하는 분', placeholder: '예: 김지우', required: false, maxLength: 80 },
    ],
  },
  {
    id: 'meeting',
    label: '모임 공지',
    fields: [
      { id: 'name', label: '모임 이름', placeholder: '예: 주말 독서 모임', required: true, maxLength: 80 },
      { id: 'date', label: '날짜와 시간', placeholder: '예: 12월 7일 오후 2시', required: true, maxLength: 100 },
      { id: 'place', label: '만나는 곳', placeholder: '예: 주민센터 2층', required: true, maxLength: 100 },
      { id: 'details', label: '더 알릴 내용', placeholder: '예: 읽고 싶은 책을 한 권 가져오세요.', required: false, maxLength: 1000, multiline: true },
    ],
  },
];

export function renderWritingTemplate(
  id: WritingTemplateId,
  values: Readonly<Record<string, string>>,
): string {
  const template = WRITING_TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error('글 양식을 다시 골라 주세요.');

  const fields: Record<string, string> = {};
  for (const field of template.fields) {
    const value = (values[field.id] ?? '').replace(/\r\n?/g, '\n').trim();
    if (field.required && !value) throw new Error(`‘${field.label}’ 항목을 입력해 주세요.`);
    if (!field.multiline && value.includes('\n')) throw new Error(`‘${field.label}’ 항목은 한 줄로 입력해 주세요.`);
    if (codePointLength(value) > field.maxLength) {
      throw new Error(`‘${field.label}’ 항목은 ${field.maxLength.toLocaleString('ko-KR')}자 이내로 입력해 주세요.`);
    }
    fields[field.id] = value;
  }

  let sections: string[];
  switch (id) {
    case 'notice':
      sections = [fields.title, fields.audience && `대상: ${fields.audience}`, fields.body, fields.contact && `문의: ${fields.contact}`];
      break;
    case 'letter':
      sections = [`받는 분: ${fields.recipient}`, fields.body, fields.sender && `보낸 분: ${fields.sender}`];
      break;
    case 'application':
      sections = [fields.subject, `신청 사유\n${fields.reason}`, fields.applicant && `신청인: ${fields.applicant}`];
      break;
    case 'meeting':
      sections = [`${fields.name} 안내`, `일시: ${fields.date}\n장소: ${fields.place}`, fields.details];
      break;
  }

  return validateDraft(sections.filter(Boolean).join('\n\n'));
}
