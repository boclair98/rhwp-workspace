# 글결 개발 지침

- 한국어 HWP/HWPX 편집기. 기존 TypeScript/Vite와 RHWP WASM을 보존한다.
- UI 수정 전 design.md를 갱신하고, 문서 캔버스/편집 명령 계약을 보존한다.
- 원본 및 변경 범위는 vendor/UPSTREAM.json과 README를 확인한다.
- npm run build 후 열기/편집/저장/재열기, 360/390/768/1440 화면을 확인한다.
- API 키/문서/로그를 커밋하지 않는다. 파일은 클라이언트에서 처리한다.
- Coders.kr 작업은 사용자의 publishing policy를 따른다: boclair98 canonical → coders-kr 실제 fork 동일 SHA → canonical 배포 → 운영 검증.
- 커밋/푸시/배포는 사용자 요청 범위 안에서만 진행한다.
- 현재 명시 범위(2026-11-05): 사용자 요청에 따라 Coders.kr 최신 배포 규약으로 게시한다. canonical GitHub 반영 → coders-kr 실제 fork 동기화 → 배포 → 운영 검증 순서를 지킨다. 이전 GitHub 전용 제한은 이번 배포 요청으로 변경되었다.
- 보관/백업 변경 시 npm test로 손상·중복·실패 원자성을 검사하고, 브라우저 실제 파일 왕복도 확인한다.
