# 서비스화 참고와 적용 범위

확인일: 2026-11-04

- [ST Studio 주간 AI 스킬 글](https://ststudio.pe.kr/community/weekly-ai-skills-2026-10-27): 명세/질문, 기존 구현 재사용, 디자인 검토, 실제 결과 검증처럼 작업 목적에 맞게 스킬을 선별하는 관점 참고. 웹 검색 도구로 접근되지 않아 원문 HTML을 직접 받아 본문을 확인했다. 기사에 소개된 도구를 일괄 설치하거나 자동 실행하지 않았다.
- [Awesome Korean Agent Skills](https://github.com/J-nowcow/awesome-korean-agent-skills): 한국어 에이전트 지침을 기능별로 정리한 목록이다. [오피스/문서](https://github.com/J-nowcow/awesome-korean-agent-skills/blob/main/categories/office-docs.md), 웹 프론트엔드, 리팩토링 분류를 읽고 필요한 개선 범위를 정했다. 문서 엔진이나 서비스에 넣는 플러그인 목록으로 취급하지 않는다.

실제 제품 판단은 저장소 코드에 근거한다. 최근 문서에는 바이트가 없고, 파일 저장은 다운로드이며, 브라우저 간 보관함 이동이 없는 점을 확인했다. 수집하지 않은 사용자 후기나 불편 통계를 만들지 않는다.

이번 구현은 기존 RHWP 편집 명령을 재사용하면서 문서 보관/백업 이동/저장 안내를 보완한다. 개발 스킬과 사용자 기능을 혼동하지 않으며, AI 기능이나 외부 API를 연결했다고 표시하지 않는다.

UI 정돈에서는 [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard)와 기존 번들 파일/라이선스를 확인했다. UI의 400/500/600/700을 실제 각 굵기 파일로 연결하고, 기존 테마의 시스템 글꼴 우선순위를 수정했다. 사용자 요청의 토스 참고는 타이포그래피·간결한 위계·절제된 색과 문구에 적용했다. 자체 SVG와 기존 TypeScript/CSS로 구현했다.

## UI/UX 재구성 — 2026-11-05

- [Taste Skill](https://www.tasteskill.dev/): 기존 화면의 정보 밀도와 타이포그래피를 먼저 살피는 관점. 편집기라는 용도에 맞춰 문서 영역과 반복 조작에 집중했다.
- [SEED Foundations](https://seed-design.io/foundations): 색상·타입·간격을 의미 토큰으로 일관되게 사용하는 관점. 기존 Pretendard/무채색/파란색을 유지하며 SEED 패키지로 이전하지 않았다.
- [Microsoft Office 리본 표시/숨기기](https://support.microsoft.com/en-gb/office/foundations-experiences/show-or-hide-the-ribbon-in-office), [간소화 리본](https://support.microsoft.com/en-us/outlook/use-the-simplified-ribbon): 자주 쓰는 도구를 먼저 보여 주고 전체 도구를 명시적으로 펼치는 상호작용 참고. 해당 화면이나 자산을 복제하지 않았다.
- [Google Docs 화면 표시](https://support.google.com/docs/answer/99753?hl=en-GB), [단축키](https://support.google.com/docs/answer/179738?co=GENIE.PlatformDesktop&hl=en): 편집 공간과 메뉴 접근을 함께 유지하는 참고. 문서 종이 구조를 바꾸지 않고 폭 맞춤과 서식 창으로 연결했다.
- [WAI-ARIA Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): 버튼 그룹의 방향키/Home/End 이동과 Tab 진입점 참고. 글꼴 선택/크기 입력은 일반 폼 조작으로 유지한다.
- [Lucide 공식 안내](https://lucide.dev/guide/lucide): 실제 `lucide` 패키지 1.68.0의 아이콘을 사용한다. ISC/Feather 포함 고지는 vendor/LUCIDE-LICENSE에 보존했다.

이 자료는 디자인 판단의 참고다. 사용자 인터뷰·불편 통계를 수행했다는 뜻이 아니며, 이번 화면 점검과 기능 확인은 UX_REVIEW.md와 VERIFICATION.md에 구분해 기록한다.
