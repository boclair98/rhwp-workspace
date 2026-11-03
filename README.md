# 글결 · RHWP Workspace

RHWP 오픈소스를 바탕으로 만든 한국어 HWP/HWPX 문서 편집 작업 공간입니다. 파일을 브라우저에서 열고 수정하여 내려받습니다.

운영 URL: https://rhwp-workspace.coders.kr — **배포 준비 중, Coders.kr 재인증 대기. 아직 운영 검증되지 않았습니다.**

![데스크톱 문서 편집 화면](screenshots/desktop.jpg)

## 구현 기능과 사용 흐름

1. 상단 **열기**로 HWP/HWPX 파일을 선택합니다.
2. 본문, 글자/문단 서식, 표 등 RHWP 편집 기능을 사용합니다.
3. 상단 **저장**으로 편집본을 다운로드합니다. 파일 메뉴에서 다른 형식을 선택할 수 있습니다.
4. 다운로드한 파일을 다시 열어 작업을 이어갑니다.

새 문서, 파일명/저장 필요 표시, 문서에서 찾기, 편집 용지, PDF 인쇄, 자동 저장 복구 등 기존 기능을 연결했습니다. 왼쪽 문서 패널은 작은 화면에서 접을 수 있으며, 기존 메뉴와 단축키를 유지합니다. 브라우저 간 일관성을 위해 파일 입력과 다운로드 방식으로 저장합니다. 원본 파일을 자동 덮어쓰지 않습니다.

## 오픈소스 기반과 변경 범위

- 원본: [edwardkim/rhwp](https://github.com/edwardkim/rhwp), MIT. 원 저작권 및 라이선스는 [vendor/RHWP-LICENSE](vendor/RHWP-LICENSE)에 보존했습니다.
- TypeScript UI 소스 기준: `df39fb5d7a566ba6a49c2f6a04965616d2c2af73`의 `rhwp-studio`.
- UI는 실제 소스로 빌드하며 `workspace-shell.ts`와 `workspace.css`에서 화면을 수정할 수 있습니다.
- 문서 엔진 JS/WASM은 공식 Pages의 v0.8.7 배포물을 변경 없이 재사용합니다. Rust 엔진을 이 저장소에서 새로 컴파일하지 않습니다. UI 소스 커밋과 엔진 빌드 커밋이 같다고 주장하지 않습니다.
- 바이너리 출처/체크섬/수정 경계: [vendor/UPSTREAM.json](vendor/UPSTREAM.json).
- 번들 글꼴별 고지: [vendor/FONTS.md](vendor/FONTS.md), [vendor/font-licenses](vendor/font-licenses).
- 이 저장소는 별도 제품 커스터마이징 프로젝트입니다. 원본 RHWP에 변경 사항을 제출한 것은 아닙니다.

## 기술과 구조

TypeScript, Vite, RHWP Rust/WebAssembly, HTML/CSS, Node.js 정적 서버. 문서 처리용 서버/데이터베이스는 없습니다.

```text
frontend/src/core/      원본 문서 브리지와 상태
frontend/src/engine/    원본 편집/입력 처리
frontend/src/view/      문서 캔버스
frontend/src/ui/workspace-shell.ts  글결 작업 공간
frontend/src/styles/workspace.css  글결 디자인 토큰/반응형
frontend/public/fonts/  번들 글꼴
pkg/                   공식 문서 엔진 JS/WASM 및 타입
vendor/                출처와 라이선스
server.mjs             정적 서버 및 /healthz
Dockerfile             프론트 빌드 후 비루트 사용자로 서비스
coders.yaml            Coders.kr 서비스 설정
design.md              화면 설계와 검증 계획
```

## 로컬 실행

Node.js 22.12 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev
```

개발 주소: http://127.0.0.1:7720

```sh
npm run typecheck
npm run build
npm start
```

빌드 후 실행 주소도 http://127.0.0.1:7720 입니다. 상태 확인은 `/healthz`입니다. 개발 중 Vite가 변경을 반영합니다. 정적 서버에서는 빌드 후 브라우저를 새로고침합니다.

## 환경 변수와 외부 연동

| 이름 | 목적 | 필수 | 설정 위치 |
|---|---|---|---|
| PORT | 정적 서버 포트, 기본 7720 | 아니요 | 로컬 셸 또는 Coders가 서비스 포트 8080 주입 |
| HOST | 바인딩 주소, 기본 127.0.0.1 | 아니요 | Dockerfile에서 0.0.0.0 |

API 키, 외부 공공 데이터, 데이터베이스, 마이그레이션은 필요하지 않습니다. Coders 배포 토큰은 프로젝트 밖의 승인된 로컬 저장소에 보관하며 앱에 전달하지 않습니다. OAuth나 공식 한컴 서비스 연동은 구현하지 않았습니다.

## 검증

- `npm run build`: TypeScript 검사 및 Vite production build.
- 브라우저에서 HWPX 열기 → 문장 추가 → 저장 후 CLI 재파싱에서 추가 문장과 표 보존 확인.
- 360×800, 390×844, 768×1024, 1440×900에서 화면, 페이지 넘침과 주요 조작 확인.
- 전체 엔진 회귀 테스트 및 Rust 빌드는 수행하지 않았습니다.
- 검증 상세/미검증 항목은 [VERIFICATION.md](VERIFICATION.md)를 참고하세요.

## Coders.kr 배포

현재 [공식 배포 지침](https://coders.kr/llms.txt)을 다시 확인한 뒤 진행합니다. 모든 Coders API 요청에 `User-Agent: Coders-Agent/1.0`을 지정하고 인증 토큰을 출력하지 않습니다.

1. 로컬 빌드/기능/모바일 확인 및 비밀 정보 검사를 마칩니다.
2. canonical 저장소에 먼저 커밋/푸시합니다.
3. 조직 fork를 동기화하고 두 main 브랜치의 전체 SHA가 같은지 확인합니다.
4. 기존 `rhwp-workspace` 프로젝트가 있으면 재사용합니다. canonical URL로 `/v1/agent/deploys`를 요청합니다.
5. 프로젝트 상태를 10~15초 간격으로 조회하여 `ready` 또는 실패를 확인합니다.
6. 운영 URL에서 실제 문서 편집/저장과 모바일/데스크톱을 확인합니다.

```json
{"repo":"https://github.com/boclair98/rhwp-workspace","name":"rhwp-workspace"}
```

단일 `web` 서비스가 8080 포트를 노출하며 Dockerfile에서 소스 빌드를 수행합니다. 필요한 경우 같은 canonical 커밋에서 생성한 소스 tar.gz를 업로드하는 공식 경로를 사용하고 출처를 기록합니다.

## 저장소 구조와 fork 동기화

- canonical / origin: https://github.com/boclair98/rhwp-workspace
- 조직 mirror: https://github.com/coders-kr/rhwp-workspace (canonical에서 GitHub fork로 생성)
- 기본 브랜치: main
- 배포 소스: canonical 저장소

```sh
gh repo sync coders-kr/rhwp-workspace -b main
gh api repos/boclair98/rhwp-workspace/commits/main --jq .sha
gh api repos/coders-kr/rhwp-workspace/commits/main --jq .sha
```

## 보안과 한계

문서 내용을 서버에 업로드하는 API가 없습니다. 최근 문서와 복구본은 브라우저 저장소를 사용하므로 공용 PC에서는 주의하세요. 글꼴, 지원 형식, 원본 문서 구조에 따라 표시나 저장 결과가 달라질 수 있습니다. 복잡한 표/수식/개체, 실제 한국어 IME 조합, 한컴 한글과의 완전한 서식 호환성은 보장하지 않습니다. PDF 출력은 브라우저 인쇄를 사용합니다. 공동 편집, 클라우드 문서 동기화, 계정별 저장은 제공하지 않습니다.

MIT 라이선스로 사용/수정/배포할 수 있으며 포함된 원본·글꼴별 라이선스 고지를 보존해야 합니다.
