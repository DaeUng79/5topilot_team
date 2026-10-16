# 팀 웹 화면

디자인 담당: 현수환 · cookiesh1. 확정 디자인은 `v2/`이며 HTML·CSS·디자인 공통 JS를 보존합니다.

## 실제 기능 실행

저장소에서 `start_simsa_v2.cmd` 실행 → http://127.0.0.1:5190/.

기본 주소는 원본 역할 선택·로그인 화면이며, 개발용 화면 목록은 `/v2/index.html`에 보존합니다. Python 서버가 원본 HTML의 기능 스크립트에 `src/screens/{역할}/{화면ID}/binding.js`를 결합해 응답합니다. `src/bindings/common.js`는 인증·API·사업 선택·중복 요청 처리를 담당합니다.

기존 Vite 사용 시 Python 서버 5190을 먼저 실행하고 `npm run dev`를 실행합니다. `/v2`, `/api/v2`, `/committee-v2`는 5190, 기존 `/api`는 8000, `/document-api`는 8001로 연결됩니다. 패키지 추가는 기관 패키지 게이트 확인 후 진행합니다.

HTML 파일을 직접 여는 방식은 정적 디자인 확인용입니다. API·DB 기능은 HTTP 주소로 접속해야 합니다.

## 소스 책임

- `v2/`: 원본 화면·기획, 수정 금지
- `src/screens/`: 화면별 기능 연결 JS; PM-01 상세는 `overview-binding.js`
- `src/bindings/`: 공통 연결 및 오대웅 영역 안내
- `../committee_Lex6won/`: 원준석 Python 기능과 SQL
- `../evaluations_u-jing/`: 공통·평가 Python 기능과 SQL, 실행 서버

SQLite 실행 파일은 화면 폴더에 두지 않습니다. Git에서는 SQL·소스·계약만 공유합니다.

[결과보고](../evaluations_u-jing/RESULT_REPORT_2026-10-16.md) · [화면별 연결 현황](../evaluations_u-jing/DESIGN_CONNECTION_STATUS.md) · [기능·DB 인계](../evaluations_u-jing/IMPLEMENTATION_V2.md)
