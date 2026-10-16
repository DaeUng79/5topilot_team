# 위원 v2 웹 연결 인계서

> **과거 개발 단계 기록입니다.** 아래 독립 화면·5188 포트·시안 목록의 ‘실제 연결’ 버튼 안내는 현재 통합 앱에 적용되지 않습니다. 현재 원본 디자인 기반 실행은 [2026-10-17 보고서](../../evaluations_u-jing/COMMITTEE_FLOW_FIX_2026-10-17.md)와 저장소 루트 `start_simsa_v2.cmd`(5190)를 사용하세요. 초기 어댑터 소스는 호환성·회귀 테스트를 위해 보존합니다. 현재 `committee_roster.py`에는 원본 명단 확정 화면의 예비위원 수를 반영하는 보완이 포함되어 있습니다.

2026-10-16. 기준: v2 DB/버튼 계약, 최신 웹 구조(PR #12의 HTML 시안 목록).

## 연결 범위

기존 `candidate_pool.py`, `candidate_import.py`, `committee_selection.py`,
`committee_roster.py`는 수정하지 않았다. 추가한 HTTP 어댑터가
`v2_gateway.dispatch_action`을 호출한다. 업무 규칙·테이블·마이그레이션도 그대로다.

다른 담당 폴더의 변경은 총 3줄이다.

- `apps/web_cookiesh1/vite.config.ts`: `/committee-v2` → `127.0.0.1:5188` 프록시 1줄.
- `apps/web_cookiesh1/v2/index.html`: PM-04/PM-07 실제 연결 진입 버튼 2줄.

기존 시안과 시안 내부 동작, 문서·평가 기능 파일은 수정하지 않았다.
실제 연결 버튼은 원준석 폴더의 독립 화면을 같은 출처의 iframe으로 연다.
기존 시안의 개별 버튼을 실제 업무 처리로 바꾼 것은 아니다.
시안 목록에서 반드시 **실제 연결** 버튼을 사용한다.

## 실행

기존 설치 환경을 사용하며 새 패키지나 버전 변경은 없다.
다음 두 명령은 서로 다른 PowerShell 창에서 실행한다.

```powershell
cd C:\coding\5topilot_team\apps\committee_Lex6won
.\.venv\Scripts\python.exe run_v2_web.py --demo --web-port 5180
```

```powershell
cd C:\coding\5topilot_team\apps\web_cookiesh1
npm run dev -- --port 5180
```

접속: `http://127.0.0.1:5180/v2/index.html`

1. 사업담당자 메뉴의 **PM-07 위원 풀 · 실제 연결** 또는 **PM-04 위원 선정 · 실제 연결** 선택.
2. `apps/committee_Lex6won/data/web-v2/access-code.txt`의 로컬 연결 코드 입력.
3. 후보 등록·수정·비활성화, 엑셀 미리보기·등록, 규칙 저장·선정·연락·확정을 수행한다.

기본 5173을 사용하는 경우 API의 `--web-port`도 5173으로 맞춘다.
5188 API 포트를 바꾸면 웹 프록시 목적지도 함께 맞춰야 한다.
기존 5173 서버와 문서 서버 8001을 종료할 필요는 없다.
API만 실행하면 `http://127.0.0.1:5188/committee-v2/`로 직접 확인할 수 있다.

## 데이터와 인증 경계

- 실행기는 `--demo`를 명시해야 하며 `127.0.0.1`에만 바인딩한다.
- 시연 부서, 관리자, 사업 p1/p2, 후보 27명(인공지능 12·정보보안 9·운영 6)을 생성한다.
- p1/p2는 로컬 합성 사업이다. 다른 모듈의 동일한 문자열 ID와 실데이터가 연동됐다는 뜻은 아니다.
- 기본 DB: `data/web-v2/admin.sqlite3`. 기존 v1 DB, 문서 DB, 평가 DB에는 쓰지 않는다.
- `keys.bin`의 암호화키를 재시작 때 재사용한다. DB가 있는데 키가 없으면 시작을 거부한다.
- 연결 코드는 실행 시 무작위로 생성된다. HTTP-only/SameSite 쿠키, 세션 만료·로그아웃,
  로그인 시도 제한, Origin/Host 검사, 요청 본문 크기 제한을 적용한다.
- 관리자 ID는 서버 설정에서 결정한다. 웹 JSON의 `actor_id`로 권한을 부여하지 않는다.
- 역할·부서·계정 활성 상태는 매 요청 DB에서 다시 확인한다.
- DB·키·연결 코드·브라우저 산출물은 Git 제외 대상이다.
- 브라우저가 새 사업이나 관리자를 임의로 생성하지 않는다. 공통 원본 등록은 별도 담당이다.
- URL에 지정한 사업이 없으면 연결되지 않았다고 표시하며 다른 사업으로 대체하지 않는다.

공통 로그인·부서/사업 원본 동기화는 아직 미연결이다. 운영 로그인으로 설명하지 않는다.
공통 API가 준비되면 `v2_http.py`의 `admin` 인증 의존성을 공통 서버의 검증된 세션으로
교체하고, 공통 부모 스키마가 준비된 Runtime을 주입한다. 로컬 연결 코드를 운영 인증으로
승격하지 않는다. HTTPS 서비스의 쿠키·출처 정책은 그 서버에서 함께 설정한다.

## HTTP 계약

| 경로 | 기능 |
|---|---|
| POST `/committee-v2/api/session` | 로컬 연결 코드 확인 및 세션 발급 |
| DELETE `/committee-v2/api/session` | 세션 폐기 |
| GET `/committee-v2/api/bootstrap` | 권한 있는 부서·사업·분야 목록 |
| GET `/committee-v2/api/projects/{project_id}` | 연락·규칙·선정·명단·전달 상태 |
| POST `/committee-v2/api/actions/{button_id}` | COM/DRAW/ROS 기존 버튼 함수 호출 |
| POST `/committee-v2/api/imports/preview` | COM-03 multipart XLSX 미리보기 |

POST/DELETE 요청은 `X-Committee-Client: v2-web` 헤더가 필요하다.
모든 업무 쓰기 요청은 `Idempotency-Key`도 필요하다. 화면은 응답을 받지 못했거나
서버 오류가 나면 같은 작업의 키를 유지해 재시도한다. 저장 version은 기존 계약을 따른다.
일반 성공은 `{data,meta?}`, 실패는 `{error:{code,message,retryable},meta}`이다.
다운로드 버튼은 XLSX 파일 응답을 반환한다.

엑셀 미리보기 필드: `file`, `department_id`, `scope`, 선택 `project_id`, `password`.
행 오류가 있으면 전체 등록을 차단한다. 사업 직접 등록은 DIRECT 규칙 저장이 먼저다.

## 평가 담당자 연결

최종 확정은 실제 SQLite에 명단·배정·outbox를 함께 저장한다.
UI는 수신 확인 전 **평가 모듈 수신 대기 · 위원 로그인 준비 중**으로 표시한다.
브라우저에서 전달 완료를 강제로 만들거나 ACK를 보내는 API는 제공하지 않는다.
원본 outbox payload와 로그인 HMAC도 브라우저에 반환하지 않는다.

평가 담당자의 수신기와 신뢰할 수 있는 내부 전달 작업이
`pending_events` → 수신 DB 반영 → `acknowledge_event`를 연결해야 SENT가 된다.
이 작업, 실제 참석, 위원장 선정, 점수·서명은 이번 웹 연결 범위에 포함되지 않는다.

## 검증 재현

```powershell
cd C:\coding\5topilot_team\apps\committee_Lex6won
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy
node --check web_v2/app.js
```

브라우저 검증은 Node 내장 기능과 별도 Chrome 프로필을 사용한다. 추가 패키지는 없다.
아직 p1을 확정하지 않은 **새 합성 DB**에 대해 실행한다. 실자료 대상으로 실행하지 않는다.
API 준비 완료 후 Chrome을 `--headless=new --remote-debugging-port=9335`와 전용
`--user-data-dir`로 실행하고 `node tests/web_v2_browser.mjs`를 호출한다.
`COMMITTEE_WEB_URL` 기본값은 `http://127.0.0.1:5180`, `COMMITTEE_DATA_DIR` 기본값은
이 앱의 `data/web-v2`다. 테스트는 후보를 등록·수정·비활성화하고 p1 명단을 확정하며,
p2를 DIRECT로 설정하여 XLSX 후보 7명을 등록한다. 기존 DB를 초기화하지 않는다.

기관 게이트 `gg verify`는 저장소의 하네스 미초기화로 실패했다.
기능 검증 결과와 기관 최종 게이트 통과는 별개이며 운영 배포 완료로 표시하지 않는다.
