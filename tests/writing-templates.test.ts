import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWritingTemplate } from '../frontend/src/workspace/writing-templates.ts';

test('안내문과 편지는 입력한 내용만 넣고 비운 항목은 생략한다', () => {
  assert.equal(
    renderWritingTemplate('notice', { title: '  휴관 안내 ', body: '금요일에 문을 닫습니다.\r\n토요일에 다시 엽니다.', audience: '', contact: '안내 데스크' }),
    '휴관 안내\n\n금요일에 문을 닫습니다.\n토요일에 다시 엽니다.\n\n문의: 안내 데스크',
  );
  assert.equal(
    renderWritingTemplate('letter', { recipient: '할머니', body: '반찬 잘 먹었어요.', sender: '  ' }),
    '받는 분: 할머니\n\n반찬 잘 먹었어요.',
  );
});

test('신청 사유와 모임 공지는 이유, 날짜, 장소를 입력한 그대로 보존한다', () => {
  assert.equal(
    renderWritingTemplate('application', { subject: '한글 교실 참가 신청', reason: '편지를 쓰고 싶습니다.', applicant: '김지우' }),
    '한글 교실 참가 신청\n\n신청 사유\n편지를 쓰고 싶습니다.\n\n신청인: 김지우',
  );
  assert.equal(
    renderWritingTemplate('meeting', { name: '독서 모임', date: '12월 7일 오후 2시', place: '주민센터 2층' }),
    '독서 모임 안내\n\n일시: 12월 7일 오후 2시\n장소: 주민센터 2층',
  );
});

test('필수 항목 누락, 한 줄에 들어간 줄바꿈, 과대 입력을 차단한다', () => {
  assert.throws(() => renderWritingTemplate('notice', { title: '  ', body: '안내' }), /제목.*입력/);
  assert.throws(() => renderWritingTemplate('meeting', { name: '모임', date: '토요일\n일요일', place: '도서관' }), /날짜와 시간.*한 줄/);
  assert.throws(() => renderWritingTemplate('letter', { recipient: '가'.repeat(81), body: '편지' }), /받는 분.*80자/);
});

test('기존 초안 검증을 거쳐 제어 문자와 64줄을 넘는 결과를 차단한다', () => {
  assert.throws(() => renderWritingTemplate('notice', { title: '안내', body: '첫 문장\u0000둘째 문장' }), /일반 글자/);
  assert.throws(() => renderWritingTemplate('notice', { title: '안내', body: Array(63).fill('한 줄').join('\n') }), /64줄/);
});
