# 글결 개발 지침

- 한국어 HWP/HWPX 편집기. 기존 TypeScript/Vite와 RHWP WASM을 보존한다.
- UI 수정 전 design.md를 갱신하고, 문서 캔버스/편집 명령 계약을 보존한다.
- 원본 및 변경 범위는 vendor/UPSTREAM.json과 README를 확인한다.
- npm run build 후 열기/편집/저장/재열기, 360/390/768/1440 화면을 확인한다.
- API 키/문서/로그를 커밋하지 않는다. 파일은 클라이언트에서 처리한다.
- Coders.kr 작업은 사용자의 publishing policy를 따른다: boclair98 canonical → coders-kr 실제 fork 동일 SHA → canonical 배포 → 운영 검증.
- 커밋/푸시/배포는 사용자 요청 범위 안에서만 진행한다.
