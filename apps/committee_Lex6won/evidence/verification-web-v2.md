# 위원 v2 웹 연결 검증

> 초기 독립 웹 어댑터의 과거 검증 기록입니다. 현재 기본 화면·실행 방식·최신 검증 결과는 [원본 화면 통합 보고](../../evaluations_u-jing/COMMITTEE_FLOW_FIX_2026-10-17.md)를 기준으로 합니다.

2026-10-16 / Windows / Python 3.11 / Node 24 / 별도 Headless Chrome.
브랜치: `feat/lex6won-committee-v2-web`. 팀 웹의 PR #12 HTML 구조를 기준으로 검증했다.

| 항목 | 이번 실행 결과 |
|---|---|
| 기존 회귀 + 신규 HTTP/시연 재시작 테스트 | **72 passed**, 기존 Starlette 경고 1개 |
| 기존 v2 + 신규 HTTP/시연 모듈 커버리지 | **92.07%** (1,047 statements, 83 missed), 기준 70% 통과 |
| 신규 HTTP 어댑터 커버리지 | 94% |
| Ruff | `python -m ruff check .` 통과 |
| mypy | `python -m mypy` 22개 소스 통과; 실행기 파일도 별도 검사 통과 |
| JavaScript 문법 | `node --check web_v2/app.js` 통과 |
| 실제 웹 진입 | v2 목록 → 실제 연결 버튼 → iframe → Vite 프록시 → Python API 확인 |
| 실제 브라우저 등록 | 후보 추가·수정·비활성화, HTML 형태 이름의 텍스트 출력 확인 |
| 실제 브라우저 선정 | 분야 3/2/2 → 21명 선정 → 연락 저장 → 정위원 7·예비 2명 확정 |
| 실제 브라우저 재조회 | 새로고침 후 확정 명단 유지, 규칙·추첨 잠금 확인 |
| 실제 브라우저 엑셀 | p2 DIRECT 설정 → XLSX 7명 미리보기·등록 → 부서 풀과 분리 확인 |
| 브라우저 오류 | 미처리 JavaScript 예외 0건 |
| 서버 재시작 | 기본 합성 DB로 재시작 후 웹 프록시에서 CONFIRMED·배정 9명·PENDING 재조회 |
| HTTP 경계 | 미인증·잘못된 코드·외부 Origin/Host·다른 부서·임의 actor_id·크기 초과 거절 |
| 중복/버전/증빙 | 기존 업무 테스트 + HTTP 재요청 중복 방지, FK, 명단 HMAC 비노출 확인 |
| 키·DB 보호 | 재시작 키 유지, 수정 후보 재생성 방지, 키 누락/오류 시 시작 거절 |
| 변경 범위 | 다른 담당 폴더는 웹 설정 1줄·목록 버튼 2줄. 주요 기능 파일 변경 없음 |
| 기관 게이트 | `node C:/coding/.vibecode-harness/bin/gg.mjs verify` exit 1: 저장소 하네스 미초기화 |
| 보안 보조 검사 | `v2_http.py` 1개 파일 발견 사항 0건. `web_v2` 폴더 검사는 120초 시간 초과로 판정 불가 |

브라우저 테스트는 `tests/web_v2_browser.mjs`다. 기존 사용자 자료 대신 새 합성 DB
`data/web-v2-check`를 사용했다. API 시작 전에 브라우저가 먼저 요청한 최초 시도는
Vite ECONNREFUSED로 실패했다. 서버 준비 로그 확인 후 전체 재실행은 통과했다.
최종 사용자 접속 서버는 기본 `data/web-v2`로 다시 실행했다.

화면 캡처는 Git 제외 대상 `artifacts/web-v2-confirmed.png`에 있다.
점검 보고서는 보안 도구가 저장하는 `.check-reports/`에서 확인하며 Git에는 포함하지 않는다.

이 결과는 로컬 웹과 실제 위원 SQLite 연결을 검증한다. 공통 운영 인증,
실제 사업 데이터 동기화, 평가 명단 수신, 참석·위원장·점수 기능의 통합 검증을 대신하지 않는다.
기관 게이트와 웹 보안 검사가 모두 통과한 상태 또는 운영 배포 완료로 표현하지 않는다.
새 패키지 설치나 의존성 버전 변경은 하지 않았다.
