# 글결 — RHWP 문서 작업 공간

## 목적과 근거
HWP/HWPX 문서를 로컬 브라우저에서 편집한다. 현재 게시 범위는 사용자 GitHub이며 Coders.kr 배포는 취소되었다. 주요 사용자는 한글 파일을 빠르게 열고 수정해 다시 내려받으려는 한국어 사용자다. RHWP의 TypeScript/Vite UI와 WASM 문서 엔진을 활용한다. 원본 index.html의 밀집된 메뉴, 10~12px UI 글꼴, 회색 크롬을 개선한다. 문서 렌더링과 편집 명령은 유지한다.

## 확정 입력
- Topic: 한국어 HWP/HWPX 문서 편집
- Offer: 파일 열기, 실제 편집, 로컬 다운로드
- Audience: 한국어 문서 사용자
- Primary user action: 문서 열기 → file:open
- Deliverable: 완성된 문서 편집 화면 1개. 랜딩 페이지는 만들지 않는다.
- Style direction: 밝고 차분한 생산성 앱, 흰 종이와 청록색 포인트
- Tonal key: 명료하고 담백한 한국어
- Icon policy: 직접 작성한 24px stroke SVG, 기존 편집 명령 아이콘 보존
- Proof assets: 실제 RHWP 편집 화면, 직접 만든 기능 확인용 문서만 검증에 사용
- Motion intensity: hover/focus 120ms, reduced-motion 시 전환 제거

## Composition contract
- hero archetype: 해당 없음, editor workspace
- first viewport: 64px 제목/작업바, 좌측 216px 문서 패널, 상단 메뉴와 도구 모음, 중앙 문서 캔버스, 하단 상태바
- primary visual: 실제 편집 가능한 흰 문서 캔버스
- interaction: 열기/저장/새 문서/찾기는 기존 dispatcher로 연결. 파일명과 저장 필요 상태는 실제 편집 상태에서 표시.
- reuse boundary: 원본 src/core, src/engine, src/view, command 계약 보존. UI 셸과 CSS, 기본 테마, 제목 표시만 개선.

## 디자인 값
- Surface #ffffff; workspace #f3f5f7; text #1c2934; secondary #65717e; border #e4e9ed
- Accent #16766b; active tint #e5f3ef; focus #0b8273; danger #bc364a
- Dark: 기존 테마 선택 유지, 앱 셸도 어두운 surface와 밝은 text로 대응
- UI font: Pretendard(번들), Malgun Gothic, system-ui. 문서 본문 글꼴 설정은 보존.
- 제목 18px/700/1.4, 파일명 14px/600/1.5, 기본 13px/400/1.5, 설명 12px/1.5
- 간격 4/8/12/16/24/32px. 버튼 반경 8px, 패널 12px. 1px 경계, 낮은 그림자.
- 내용이 없는 새 문서는 빈 종이로 유지. 가상의 문서 목록·사용자·리뷰·성과는 만들지 않는다.

## 반응형과 접근성
- 900px 이하: 좌측 패널을 접어 문서 공간 확보, 메뉴와 도구는 의도적인 내부 가로 스크롤.
- 600px 이하: 제목바 2행, 주요 열기/저장 터치 영역 44px, 보조 설명 생략, 문서 캔버스만 내부 스크롤.
- 페이지 자체 가로 넘침 금지. grid/flex min-width:0, Korean keep-all, 긴 파일명 ellipsis와 title.
- 모든 새 조작은 button/link, aria-label, focus-visible. 패널 토글 aria-expanded, 모바일 상단은 안전 여백 반영.
- 대화상자는 화면 폭 안으로 제한하고 내부 스크롤, 하단 안전영역 확보.

## 경로/계약/검증
- frontend/src/ui/workspace-shell.ts, frontend/src/styles/workspace.css, frontend/index.html, frontend/src/main.ts, frontend/src/ui/document-title.ts
- pkg는 공식 Pages에서 확보한 JS/WASM을 체크섬과 출처 고정하여 재사용. Rust 엔진을 수정하거나 새로 빌드했다고 주장하지 않는다.
- Vite build, TypeScript 검사, 360×800/390×844/768×1024/1440×900 시각 확인.
- HWP/HWPX 열기 → 본문/서식/표 편집 → 다운로드 → 재파싱/재열기. 키보드, 메뉴, 콘솔 오류 확인.
- 이번 게시: canonical boclair98/rhwp-workspace에만 푸시. 조직 fork 동기화와 Coders.kr 배포는 수행하지 않는다.

## 확정 generation prompt / output target
한국어 문서 편집기 ‘글결’을 RHWP TypeScript/Vite 소스에서 완성하라. 흰색 문서 중심, 차분한 청록색 강조, 넓은 여백, 읽기 쉬운 메뉴와 도구 모음으로 작업 공간 1개를 구현하라. 제목바에 실제 파일명, 열기/저장 동작을 제공하고 좌측 패널에는 현재 문서와 오픈소스 출처를 표시하라. 가상 데이터·연동·사용자 수를 만들지 말고 기존 HWP/HWPX 편집/저장/검색/표 명령 계약을 보존하라. 모바일에서는 좌측 패널을 접고 툴바 자체의 스크롤을 허용하되 페이지 넘침을 방지하라. 기본 HTML/CSS/TypeScript와 기존 dispatcher로 구현하고 실제 브라우저로 검증하라.
Output target: frontend/ 및 Dockerfile, coders.yaml, 한국어 README.

## 서비스화 1차 개선 — 2026-11-04

현재 요청은 **사용자 GitHub에만 반영, Coders.kr 배포 금지**다. 관련 배포 파일은 기존 설정으로 보존하되 사용하지 않는다.

코드에서 확인한 불편과 이번 해결 범위:
- recent-store.ts가 메타데이터만 보관하여 최근 문서도 재선택 필요 → 명시적으로 선택한 문서를 IndexedDB 내 문서 보관함에 저장하고 재열기.
- 현재 '저장'이 다운로드인데 로컬 보관과 구분이 어려움 → '파일 저장'과 '브라우저 보관'을 구분하고 각각 실제 결과를 안내.
- 브라우저/PC를 바꾸면 작업 공간을 이동할 방법 없음 → 버전·SHA-256·파일 크기·형식 검증을 포함한 백업 내보내기/가져오기. 기존 문서와 같은 이름이어도 덮어쓰지 않음.
- 코드 구조: 라이브러리 모델/직렬화, IndexedDB 저장소, 사용자 대화상자/컨트롤러를 분리. RHWP 명령/엔진은 보존.

첫 화면 구성은 기존 편집기 유지. 사이드바에 '내 문서', 제목 영역에 '문서 이름 변경', 상단에 '보관' 동작을 추가한다. 내 문서는 검색 가능한 실제 보관 목록이며 초기에는 정직한 빈 상태를 표시한다. 이름/바이트 수/보관 시각/형식을 실제 데이터로 표시한다. 백업에는 문서 내용이 들어감을 안내한다. 서버/계정/공동 편집/AI 연동은 이번 구현 범위에 없다.

보관을 선택한 문서만 편집 후 지연 보관한다. 보관 오류를 메모리 저장 성공으로 바꾸지 않는다. 암호 문서는 평문 보관을 막고 기존 암호 파일 저장으로 안내한다. 엔진 내보내기에서 손실 보고가 있으면 보관을 거부하고 원본을 유지한다. 가져오기는 먼저 전 항목 검증한 뒤 하나의 트랜잭션에서 추가하며, 버전 불일치·손상·용량 초과 시 기존 보관함은 유지한다.

변경 경로: frontend/src/workspace/*, ui/workspace-shell.ts, styles/workspace.css, tests/*, README/VERIFICATION/SOURCES. 검증: 정상 왕복·변조·동일 이름 충돌·중복 가져오기·IndexedDB 실패·전체 원자성 테스트, 브라우저 보관→재열기→파일 저장→백업 이동, 모바일/키보드/오류/빈 상태 확인.

사용자가 확정한 마이그레이션은 기존 HWP 문서와 작업 내역 이전이다. 여러 HWP/HWPX 파일을 선택해 가져오며, 기존 RHWP의 복구본과 IR/구형 HWP 이력을 실제 바이트와 함께 백업한다. 메모·원본 파일명·저장 시각·문단 식별자를 보존한다. Ctrl+Z 세션이나 다른 웹사이트 저장소에 대한 자동 접근을 약속하지 않는다. 새 문서/이력 저장소는 같은 IndexedDB 트랜잭션으로 변경한다.

내 문서 대화상자는 native dialog, 760px 최대 폭, 720px 최대 높이, 본문 스크롤과 하단 조작을 사용한다. 모바일에서는 목록을 2행으로 배치하고 버튼은 44px 이상이다. 제목바는 모바일 136px로 파일명·보관 상태·44px 이름 변경을 확보한다. Tab/Shift+Tab 순환, Escape 닫기와 이전 조작으로 포커스 복귀를 제공한다.

## 서비스 화면 정돈 — 2026-11-04

사용자 요청: 글꼴과 화면을 토스의 명료하고 담백한 서비스 인상에 맞춰 수정한다. 글결의 자체 워드마크, 기존 스택과 문서 편집/보관/이전 계약을 유지한다. 사각 글자 로고, 작은 설명의 반복, 촘촘한 테두리와 다색 툴바 아이콘을 정리한다. AI 기능·배너·장식·홍보 문구를 추가하지 않는다. 문서 본문의 글꼴·크기·내용은 바꾸지 않는다.

- Topic: 한국어 문서 편집 서비스 글결
- Offer: HWP/HWPX 편집, 내 문서 보관과 백업 이전
- Audience: 기존 한글 문서를 가져와 계속 편집하는 사용자
- Primary user action: 파일 열기 → file:open, 보관본 재열기 → 기존 loadBytes
- Deliverable: 실제 편집기와 보관함 디자인 1개
- Style direction: 한국어 서비스 앱의 명료한 타이포그래피, 무채색 면, 절제된 파란색
- Tonal key: 짧고 구체적인 한국어
- Icon policy: 자체 단색 SVG, 원본 버튼과 data-cmd/id 유지, 토스 자산 사용 없음
- Proof assets: 기존 기능 확인용 문서와 보관함 실제 화면
- Motion intensity: 버튼 배경/포커스 120ms, reduced-motion 존중

Composition contract: hero 해당 없음. 첫 화면은 80px 헤더, 232px 사이드바, 메뉴/편집 도구/서식, 실제 종이 캔버스로 구성한다. 워드마크와 문서 제목을 명확히 나누고 주 행동인 파일 저장만 파란색으로 강조한다. 툴바의 모든 명령과 내부 가로 스크롤을 보존한다. 라이선스와 로컬 저장 안내는 하단 정보/보관함 설명에서 읽을 수 있다.

확정 토큰: text #191f28, secondary #4e5968, muted #6b7684, surface #ffffff, sidebar #f9fafb, canvas #f2f4f6, border #e5e8eb, primary #3182f6, primary-hover #1b64da, selected #e8f3ff, danger #d92d45. 어두운 테마는 기존 의미 토큰을 유지한다. UI 글꼴은 번들 Pretendard 400/500/600/700을 실제 각 파일로 연결한다. 워드마크 24px/700, 문서 제목 16px/600, 메뉴/사이드바/버튼 14~15px/500~600, 설명 13px/400, 상태 12px/400. 기본 줄 높이 1.5, 자간 -0.02em. 간격 4/8/12/16/24/32, 버튼 10px/44px, 모달 20px 반경과 28px 패딩. 반복 카드 대신 구분선 목록을 쓴다.

모바일: 160px 헤더에서 문서명·보관·파일 저장 필요 상태를 모두 확보한다. 패널 접기, 44px 주요 조작, 서식 도구 내부 스크롤과 메뉴 줄바꿈을 사용한다. 긴 파일명은 말줄임과 title, 본문 안내는 keep-all과 overflow-wrap으로 처리한다. Tab/Shift+Tab, Escape와 포커스 복귀를 유지한다. 주 버튼은 흰색 작은 글자 대비를 위해 #1b64da, hover #1555be를 사용하고 브랜드/포커스 색은 #3182f6을 유지한다.

변경: workspace.css를 일관된 토큰/컴포넌트/반응형 순서로 정리, workspace-shell.ts와 단색 SVG 아이콘, document-library.ts의 아이콘·목록·문구, README와 검증 화면. pkg/core/engine/view와 문서 서식 데이터는 변경하지 않는다. 검증: build, 기존 저장소 테스트, HWP 편집/보관/다운로드 확인, 360/390/768/1440 화면 직접 관찰, 키보드와 콘솔 확인.

확정 prompt: 글결의 실제 편집기를 읽기 편한 한국어 문서 서비스로 정돈하라. 번들 Pretendard의 실제 굵기 400/500/600/700, 흰색과 회색, 주 행동에만 파란색, 명확한 제목/본문/설명 위계를 사용하라. 작은 장식 타일과 반복 설명을 줄이고 단색 SVG 및 구분선 목록을 사용하라. 기존 메뉴와 편집/저장/이전 기능, 문서 본문의 서식, 모든 명령 id와 이벤트 연결을 유지하라. 실제 화면과 키보드 조작을 검증하라.
Output target: frontend/src/ui/workspace-shell.ts, frontend/src/ui/workspace-icons.ts, frontend/src/styles/workspace.css, frontend/src/workspace/document-library.ts.

## 배포 범위 변경 — 2026-11-05

사용자가 Coders.kr 배포와 README 갱신을 요청했다. 현재 제품 UI와 문서 엔진을 유지하고 canonical GitHub → 실제 조직 fork 동기화 → 최신 API 배포 → 운영 화면/기능 검증을 수행한다. 앞선 GitHub 전용 제한은 해당 요청 시점의 기록이며 이번 배포 요청에는 적용하지 않는다. 로컬 보관함과 운영 주소의 저장소는 출처가 다르므로 백업으로 이전한다.

## 편집 공간과 작업 흐름 재구성 — 2026-11-05

이번 목표는 기존 제품을 더 편하게 편집·보관하는 것이다. 현재 코드와 운영 화면을 동일한 Chrome 프로필(기존 보관함/코더스 로그인)에서 새로 캡처했다. 1440×900에서 편집 영역 604px, 360×800에서 제목 160px+도구 258.5px로 편집 영역 345.5px였다. 원본 종이는 100%에서 모바일 폭 밖으로 나간다. 보관함은 자주 쓰지 않는 백업/이전 작업까지 5개 버튼으로 항상 노출한다. 캡처/근거는 UX_REVIEW.md에 남긴다.

확정 방향: **문서 중심의 간편 편집 + 펼쳐 쓰는 전체 도구** 1개. 새 홈/랜딩/라우트나 AI 기능은 만들지 않는다. 기존 편집기/디스패처/저장소/파일 입력과 다운로드, 모든 원본 메뉴를 보존한다.

Resolved inputs: Topic=HWP/HWPX 문서 작업, Offer=편집·저장·브라우저 보관·이전, Audience=기존 한글 문서 사용자, Primary action=파일 열기/보관 문서 재열기, Deliverable=편집기+내 문서 UX 개선, Style=기존 Pretendard/흰색·회색/절제된 파랑, Tone=짧고 구체적, Icon policy=Lucide ISC의 실제 아이콘 재사용, Proof=이번 점검의 실제 화면과 직접 만든 시험 문서, Motion=120ms 조작 피드백/reduced-motion.

Composition contract: hero 없음. 데스크톱 제목 64px, 메뉴 36px, 간편 도구 약 52px, 접을 수 있는 208px 탐색 패널과 종이 캔버스. 간편 도구는 되돌리기/다시 실행, 글꼴·크기·굵게/기울임/밑줄·정렬·표·찾기를 기존 컨트롤/명령에 연결한다. 전체 도구 버튼은 원본 메뉴/리본/서식을 펼치며 기존 사용자 설정을 삭제하지 않는다. 모바일은 제목 약108px+간편 도구 약52px, 서식 전용 창과 폭 맞춤, 전체 도구로 필수 기능에 접근한다. 모바일 패널은 배경 가림·Escape·포커스 순환/복귀를 지원한다.

색/글꼴은 기존 의미 토큰 유지. text #191f28, secondary #4e5968, muted #6b7684, surface #fff, workspace #f2f4f6, border #e5e8eb, primary button #1b64da, focus #3182f6. Pretendard 실제 400/500/600/700. 제목16/600, 기본14/400~500, 보조12~13/400, 주요 조작44px 이상(데스크톱 편집 도구36px). 8/12/16/24px 간격과 8~12px 반경. 현재 문서의 글꼴/서식/종이 크기는 변경하지 않는다.

내 문서: 파일 영역 전체를 버튼으로 만들어 한 번에 재열기. 이름 검색+형식 필터+최근 수정/이름 정렬. 가져오기와 이력은 바로 접근하고 백업/이전은 명시적 펼침 아래 배치한다. 보관/다운로드 상태와 로컬 저장 경계를 정확히 안내한다. 기존 백업 버전/체크섬/원자성 정책은 그대로 유지한다.

참고: Microsoft의 간소화 리본/전체 도구 전환, Google Docs의 compact mode/fit, WAI-ARIA toolbar의 버튼 방향키 이동, SEED의 의미 토큰/상태 일관성. 해당 제품의 자산이나 화면은 복제하지 않는다. Sources.md에 공식 원문 링크와 채택 범위를 기록한다.

실제 경로: workspace-shell.ts, 신규 workspace-editor-tools.ts, workspace-icons.ts, workspace.css, document-library.ts, package/lock, README/VERIFICATION/UX_REVIEW/SOURCES. 문서 엔진/core/view와 저장 모델은 보존한다. 추가 도구는 native 필드의 이벤트와 dispatcher를 통해 적용하며 직접 문서 모델을 변경하지 않는다.

검증: 새 간편 도구의 실행/반영/비활성/단축키·포커스·전체 도구 전환, 모바일 서식 창, 보관함 검색/필터/정렬/백업 오류. HWP/HWPX 편집→저장→재파싱, 기존 저장소11테스트와 build. 360/390/768/1440 스크린샷과 편집 공간 높이를 같은 조건에서 비교. canonical→fork 동일 SHA→기존 프로젝트 재배포→운영 기능/화면 확인.

확정 prompt: 현재 글결을 문서 중심의 차분한 편집기로 재구성하라. 간편 도구를 기본으로 제공하고 전체 명령은 펼쳐 접근하게 하라. 모바일에서 제목·도구가 문서 공간을 과도하게 차지하지 않게 하고 별도 서식 창과 명확한 배율 조작을 제공하라. 내 문서는 큰 파일 열기 영역·검색·필터·정렬로 구성하고 백업은 펼쳐 쓰게 하라. 기존 기능과 데이터·명령 계약을 보존하고 실제 파일 왕복과 키보드/반응형을 검증하라.
Output target: 기존 frontend TypeScript/CSS 및 제품 문서, Coders.kr 기존 프로젝트.
## 임시 제품명과 재배포 — 2026-11-05

사용자 요청에 따라 표시 이름을 **오픈소스 한글**로 변경한다. RHWP 기반 독립 오픈소스 편집기임을 이용 안내와 README에 표시한다. 한컴 공식 제품·공식 연동이라고 표시하지 않는다. 저장소/배포 slug와 IndexedDB/백업 format 식별자는 유지해 기존 문서·이력·백업을 계속 읽는다. 상단 브랜드와 브라우저 제목, 백업 파일명, 화면 설명을 일관되게 수정한다.

이름이 길어지는 모바일에서는 워드마크를 15px/700으로 표시하고 기존 44px 주요 조작을 유지한다. 제목바 120px, 간편 도구 53px 구성을 확인한다. 변경 파일: frontend/index.html, ui/workspace-shell.ts, ui/document-title.ts, workspace/document-library.ts, library-model.ts, library-store.ts, workspace.css와 README/검증 문서. 기존에 미게시된 v0.3 개선을 함께 검증·게시한다. 기본 밝은 테마의 네 뷰포트, HWP/HWPX 편집·저장·보관과 문서 이전, 운영 JS/CSS 일치를 확인한다.
