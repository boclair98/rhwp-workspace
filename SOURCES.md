# 서비스화 참고와 적용 범위

확인일: 2026-11-04

- [ST Studio 주간 AI 스킬 글](https://ststudio.pe.kr/community/weekly-ai-skills-2026-10-27): 명세/질문, 기존 구현 재사용, 디자인 검토, 실제 결과 검증처럼 작업 목적에 맞게 스킬을 선별하는 관점 참고. 웹 검색 도구로 접근되지 않아 원문 HTML을 직접 받아 본문을 확인했다. 기사에 소개된 도구를 일괄 설치하거나 자동 실행하지 않았다.
- [Awesome Korean Agent Skills](https://github.com/J-nowcow/awesome-korean-agent-skills): 한국어 에이전트 지침을 기능별로 정리한 목록이다. [오피스/문서](https://github.com/J-nowcow/awesome-korean-agent-skills/blob/main/categories/office-docs.md), 웹 프론트엔드, 리팩토링 분류를 읽고 필요한 개선 범위를 정했다. 문서 엔진이나 서비스에 넣는 플러그인 목록으로 취급하지 않는다.

실제 제품 판단은 저장소 코드에 근거한다. 최근 문서에는 바이트가 없고, 파일 저장은 다운로드이며, 브라우저 간 보관함 이동이 없는 점을 확인했다. 수집하지 않은 사용자 후기나 불편 통계를 만들지 않는다.

이번 구현은 기존 RHWP 편집 명령을 재사용하면서 문서 보관/백업 이동/저장 안내를 보완한다. 개발 스킬과 사용자 기능을 혼동하지 않으며, AI 기능이나 외부 API를 연결했다고 표시하지 않는다.

UI 정돈에서는 [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard)와 기존 번들 파일/라이선스를 확인했다. UI의 400/500/600/700을 실제 각 굵기 파일로 연결하고, 기존 테마의 시스템 글꼴 우선순위를 수정했다. 사용자 요청의 토스 참고는 타이포그래피·간결한 위계·절제된 색과 문구에 적용했다. 자체 SVG와 기존 TypeScript/CSS로 구현했다.
