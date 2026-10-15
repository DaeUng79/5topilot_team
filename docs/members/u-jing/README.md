# 김유진 · u-jing

[프로젝트 소개](../../../README.MD) · [역할표](../../team/ROLES.md) · [GitHub](https://github.com/u-jing)

담당: **제안평가·취합·서명·리포트 기능 개발, 데이터 정비·테스트**. 2026-10-10 사용자 확인 기준입니다.

## 개발 내용

- 코드 등록 경로: `apps/api/app/modules/evaluations/`, `apps/api/app/modules/results/`, `apps/api/app/modules/evaluator_access/`, 업무 migration·테스트, `contracts/examples/`, `tests/fixtures/`
- 산출물: 확정 기준 기반 채점·의견·제출/잠금, 집계·순위·서명·보고서, 업무 데이터 정비
- 현재 확인 상태: 기반 PR #1(658748e)의 시작용 평가 기능(점수 저장·제출·잠금·기술평균)은 재사용하고, 그 위에 아래 21개 항목을 추가합니다. 서명·보고서·본인확인은 데모 구현과 실제 구현을 구분해 표시합니다.
- 작업 브랜치: `feat/u-jing-evaluation-results` (기준 `origin/pr/1` 658748e). PR #1이 main에 병합되면 최신 main에 rebase 후 재검증합니다.
- 첫 작업 순서: 기준/배정 계약 → 점수 저장·제출 잠금 → 승인된 계산정책 집계 → 서명/보고서 단계별 검증
- 연결 담당: DaeUng79: 기준·근거·문서 DB 연결, Lex6won: 선정/권한/기획, cookiesh1: 평가·결과 화면

화면 변경은 cookiesh1과 공동 리뷰합니다. 기획·우선순위·인수 조율은 Lex6won, 저장소 통합은 DaeUng79가 맡습니다. 다른 영역 변경도 이슈에 범위를 알리고 관련 담당자의 검토를 받습니다.

## 개발 계획 (21개 항목)

디자인 캔버스 "제안서 평가 지원 — 간소화 화면"의 기능 7(본인확인)·8(평가표 작성·서명·제출·취합)·9(위원장 서명·결과표)·10(보고서·평가 종료)을 5단계로 나눈 계획입니다. **※**는 7~10 범위 밖의 공통 기능으로, 담당자 협의 없이 범위를 넓히지 않습니다. 상태: 대기 / 진행 / 완료(로컬) / 검토 대기 / 차단 / 미구현.

| # | 단계 | 항목 | 위치 ((수정)은 기존 파일) | 인수 ID | 협의 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | API 계약 예제 JSON | contracts/examples/ | OPS-01 | 없음 | 완료(로컬) |
| 2 | 1 | 합성 테스트 데이터·손 계산 기대값 | tests/fixtures/synthetic/, apps/api/tests/test_contract_examples.py | ACCEPTANCE §2 | 없음 | 완료(로컬) |
| 3 | 2 | 사업별 권한 공통 계층 ※ | core/permissions.py, core/auth.py (수정) | SEC-01 | DaeUng79·Lex6won | 완료(로컬) · 위원장 출처는 미지정 반환 |
| 4 | 2 | 평가위원 본인확인·세션 (생년월일 6자리 대조, 관리자용 로컬 마스터 번호는 화면 미표시) | modules/evaluator_access/, core/session.py, core/config.py (수정), migration 0003, committee/models.py·router.py (수정) | SEC-01 | Lex6won (생년월일 등록 경로·테이블 확장) | 완료(로컬) · 2026-10-15 사용자 지시로 문자 인증 대신 생년월일 방식으로 전환, request-code API 제거 |
| 5 | 2 | 관리자·위원장 실제 인증 연결 ※ | core/auth.py (수정) | SEC-01 | DaeUng79 (제공자) | 외부 연동 대기 · current_actor에 끼울 자리만 확보 |
| 6 | 2 | 기준 확정 기록 ※ | modules/projects/criteria.py (projects/router.py는 수정하지 않고 main.py에 등록) | EVAL-01, DOC-03·04 | DaeUng79·Lex6won | 완료(로컬) · 확정 권한은 관리자 |
| 7 | 2 | migration 0002 | migrations/versions/0002_criteria_results_signatures.py, migrations/env.py (수정) | OPS-01 | DaeUng79 (번호) | 완료(로컬) · 공동 DB 미적용 |
| 8 | 3 | 점수 저장에 기준 버전 고정 | evaluations/router.py, service.py (수정) | EVAL-01 | 없음 | 완료(로컬) · 버전 불일치·재검토 중 409 |
| 9 | 3 | 권한 검사 공통 호출 교체 | evaluations/router.py (수정) | SEC-01 | 없음 | 완료(로컬, 2단계에서 선행) |
| 10 | 3 | PostgreSQL 동시 편집·제출 테스트 | apps/api/tests/test_sheet_versions.py | EVAL-02, EVAL-03 | 없음 | 작성 완료 · 두 탭 시나리오는 SQLite 통과, 병렬 4·3건은 CI PostgreSQL에서 실행(로컬 skip) |
| 11 | 4 | 집계 정책 v1 (버전 있는 계산) | modules/results/policies.py, service.py | RES-02 | Lex6won (정책 승인) | 완료(로컬) · 현행 trimmed_mean_v1(최고·최저 제외 평균, 2026-10-11 사용자 지시), PM 확인 대기 |
| 12 | 4 | 결과 공개 시점 규칙 | modules/results/router.py, service.py | RES-01 | Lex6won | 완료(로컬) · 전원 제출 전 평균·순위 비공개, 관리자·위원장만 조회 |
| 13 | 4 | 위원장 결과 확인 기록 | modules/results/models.py, router.py, service.py | RES-03 | Lex6won (위원장 출처) | 완료(로컬) · 위원장 미지정 상태에서는 확정 불가(COM-03 연계 대기) |
| 14 | 4 | 평가표 서명 정보 저장·검증 | evaluations/router.py, service.py, models.py (수정) | RES-03, EVAL-03 | 없음 | 완료(로컬) · attestation-v1(확인 문구 동의 + 내용 SHA-256), 전자서명 아님 |
| 15 | 4 | 평가위원 화면 (접속·본인확인·채점·제출) | apps/web/src/features/evaluator/, main.tsx·EvaluationPage.tsx·client.ts (수정), evaluator-access context·brief API | SEC-01, EVAL-01 | cookiesh1 | 완료(로컬) · 빌드 통과, 브라우저 E2E는 5단계 |
| 16 | 4 | 관리자 결과·서명·리포트 화면 | apps/web/src/features/results/, App.tsx (수정) | RES-01~03 | cookiesh1 | 완료(로컬) · 출력·보고서 버튼은 5단계 자리 |
| 17 | 5 | 리포트 데이터 API | modules/results/report.py, router.py, web ReportView.tsx | RES-03 | DaeUng79 (revision 필드) | 완료(로컬) · 문서 revision 참조는 빈 목록, HWP 생성 범위 밖 |
| 18 | 5 | 사업 완료·보관 | modules/results/report.py·state.py (상태는 result_confirmations.status) | CLOSE-01 | DaeUng79·Lex6won·cookiesh1 | 완료(로컬) · projects.status 열 여부 협의 |
| 19 | 5 | 계약·migration·CI 유지 ※ | .github/workflows/ci.yml (수정), scripts/e2e-api.mjs (수정) | OPS-01 | DaeUng79 | 완료(로컬) · CI 실행은 push 뒤 |
| 20 | 5 | 평가위원 흐름 E2E | tests/e2e/evaluator-flow.spec.ts | SEC-01, EVAL-03 | cookiesh1 | 완료(로컬 Chromium 통과) |
| 21 | 5 | 문서·검증 기록 | docs/modules/evaluations.md·results.md, 이 문서, docs/testing/ACCEPTANCE.md §6 | 전체 | 없음 | 완료(로컬) · 동료 재현 기록은 비어 있음 |
| 22 | 6 | 기술평가표 업체별 제안서 요약 비교 패널 (화면 예시 자료) | apps/web/src/features/evaluations/proposalSummaries.ts·ProposalComparePanel.tsx·proposal-compare.css, EvaluationPage.tsx (수정 4줄) | EVAL-01, DOC-03 | DaeUng79 (AI 제안서 분석 연동), cookiesh1 (화면 UX) | 완료(로컬) · 예시 자료만, DB·API 변경 없음 |
| 23 | 6 | 사업 상세 '평가 설정' 탭: 평가항목(이름·배점·순서)·평가 대상 업체(이름·순서) 등록·수정·삭제, 배점 합계, 추가·수정 모달, 평가 시작 뒤 잠금, 평가표·비교 패널 자동 구성(항목 수 × 업체 수), 업체 표시명 | apps/api/app/modules/projects/setup.py, migration 0004, apps/api/tests/test_project_setup.py, contracts/examples/project-setup/, projects/models.py·router.py·main.py·evaluator_access/router.py (수정), apps/web/src/features/projects/EvaluationSetupPage.tsx·evaluation-setup.css, App.tsx·EvaluationPage.tsx·EvaluatorApp.tsx·ResultsPage.tsx·ReportView.tsx·ProposalComparePanel.tsx·proposalSummaries.ts·client.ts (수정), tests/e2e/evaluation-setup.spec.ts | EVAL-01 | cookiesh1 (탭·모달·표 UX), C 역할·DaeUng79 (projects 모듈 수정, 0004 공동 DB 적용 순서) | 완료(로컬) · 시안 이미지는 전달되지 않아 본문 설명 기준 |
| 24 | 6 | 공통 로그인·권한별 화면: 로그인 화면(사업관리자 아이디/비밀번호, 평가위원 이름·생년월일 본인확인), 세션 유지·새로고침 확인·로그아웃, 관리자 메뉴 4개/평가위원 메뉴 2개, 평가위원은 배정 사업·본인 결과만, 관리자 API 서버 차단 | apps/api/app/modules/auth/router.py, core/session.py·config.py·.env.example (수정), evaluator_access/router.py·service.py (login·projects·me name), main.py (수정), apps/api/tests/test_auth_login.py, contracts/examples/auth/, apps/web/src/features/auth/{LoginPage.tsx,login.css,session.ts}, features/evaluator/EvaluatorPages.tsx, App.tsx·client.ts·EvaluatorApp.tsx (수정), tests/e2e/helpers.ts·login-roles.spec.ts | SEC-01 | DaeUng79·Lex6won (공통 인증 구조, 실제 인증 제공자), cookiesh1 (로그인 화면·헤더 UX) | 완료(로컬) · 관리자 계정은 로컬·CI 전용(DEMO_AUTH), 시안 이미지 미전달 |
| 25 | 6 | 평가항목 배점 합계 100점 규칙 | projects/criteria.py(REQUIRED_TOTAL_SCORE·확정 422), evaluations/router.py(미확정 템플릿 채점 시작 409), projects/models.py DEFAULT_CRITERIA 합계 100, setup.py required_total_score, 화면 경고(EvaluationSetupPage·App) | EVAL-01 | C 역할 (템플릿 배점 변경) | 완료(로컬) · 2026-10-15 사용자 결정. 이미 확정된 기준(demo-project v1=80점)은 그대로 채점 가능 |
| 26 | 6 | 평가 설정 [제안요청서 반영]: DaeUng79 documents 모듈(step4 criteria_results)의 저장 결과를 읽기 전용으로 조회해 현재 항목과 비교(신규·배점 변경·동일·제외 후보, source_ref 또는 이름 완전 일치로만 짝 맞춤)하고 미리보기에서 담당자가 수정·선택한 뒤 [검토 후 반영]으로 한 번에 저장. 공식 기준(원문 평가표)과 AI 제안(총괄표 초안·보완 항목) 구분, AI 제안은 기본 미선택 | apps/api/app/modules/ai/rfp_criteria.py·rfp_sample.json, ai/router.py (수정), apps/web/src/features/projects/rfpCriteria.ts·RfpCriteriaPreview.tsx, EvaluationSetupPage.tsx (수정), tests/e2e/rfp-criteria.spec.ts | DOC-03, EVAL-01 | DaeUng79 (파싱 결과 계약·행별 원문 페이지·사업-문서 연결), cookiesh1 (미리보기 UX) | 완료(로컬) · 문서 저장소가 없으면 테스트용 예시 자료(DEMO_AUTH 환경) |
| 27 | 6 | 사업별 기술평가 총배점(technical_total_score, 0005)과 신규 사업 시작 방식(샘플 복사/빈 평가표). 100점 고정을 사업별 설정값으로 전환 | projects/models.py·router.py·criteria.py·setup.py (수정), migration 0005, App.tsx (등록 폼) | EVAL-01 | C 역할·DaeUng79 (0005 적용 순서) | 완료(로컬) · 배점 합계 ≠ 총배점이면 채점 시작 409·확정 422, 설정 저장은 허용하고 화면 경고 |
| 28 | 6 | 평가위원장 지정(COM-03 위원장 부분): 추첨 결과의 본위원 중 1명을 사업관리자가 사업별 위원장으로 지정·변경(사유·이력), 결과 확정 뒤 잠금, 위원장만 제출·서명 현황·집계 확인 뒤 확인 동의로 봉인(`reviewed` 본문), 일반 위원·관리자 대리 서명 403 | migration 0006(`committee_draws.chair_id`·`chair_history`), committee/models.py (2열 추가), committee/chair.py (신규 라우터, main.py 등록), core/permissions.py (주석), results/router.py·service.py (ConfirmRequest·서명 기록 검사·스냅샷 chair_id), apps/web features/committee/CommitteePage.tsx·committee.css, ResultsPage.tsx·EvaluatorApp.tsx·EvaluatorPages.tsx·client.ts (수정), tests/test_committee_chair.py, tests/e2e/chair-flow.spec.ts, contracts/examples/committee/ | COM-03, RES-03, SEC-01 | Lex6won (committee 테이블 확장·위원장 자격 조건), cookiesh1 (추첨 결과 패널·위원장 패널 UX), DaeUng79 (0006 공동 DB 순서) | 완료(로컬) · 2026-10-15 사용자 승인(열 추가·신규 파일 방식), 공동 DB 미적용 |
| 29 | 6 | 평가위원장 자필 서명(기능 9): 위원장 최종 확인 화면에 서명자 이름·마우스/터치 서명 캔버스·지우기·미리보기·"평가결과를 확인하였습니다" 동의·[최종 서명 및 평가결과 확정], 서명 이미지(PNG)·해시·방식·이름을 확정 기록(result_confirmations, 0007)에 저장, 결과표·보고서 JSON·관리자 결과 화면에 이름·서명·일시 표시, 리포트 서명 해시 재검증·완료 차단 | migration 0007, results/models.py·router.py·service.py·report.py (수정), apps/web features/results/ChairSignature.tsx·signature.css (신규), EvaluatorApp.tsx·EvaluatorPages.tsx·ResultsPage.tsx·ReportView.tsx (수정), tests/test_results.py·test_report_close.py (수정), tests/e2e/chair-flow.spec.ts (수정), contracts/examples/results/ | RES-03 | cookiesh1 (서명 캔버스·결과표 UX), DaeUng79 (0007 공동 DB 순서) | 완료(로컬) · 로컬 시연용 자필 서명이며 법적 전자서명 아님. 기존 attestation-v1(평가위원 개인 제출)과 구분 |

재사용하고 다시 만들지 않는 기존 코드: 점수 저장·제출·잠금·version 충돌(`evaluations/router.py`), 기술평균(`evaluations/service.py`), 데모 토큰(`core/auth.py`), 채점표 컴포넌트(`ScoreEditor`), 공통 스타일, seed 데이터, CI 계약 차이 검사, E2E 패턴.

업무 규칙이 확정되지 않아 승인 전까지 PR #1 동작을 유지하는 것: 점수 입력 단위(디자인 5단계 버튼 vs 0.01 단위), 가격 20점·합계·최종 순위 산식, 자동 저장, 서명 저장 형식, 미제출자 알림, HWP 보고서 파일 생성. 기술점수 집계는 2026-10-11 사용자 지시로 최고·최저 제외 평균(trimmed_mean_v1)을 현행으로 적용했다(위원 2명 이하 전체 평균 가정, PM 확인 대기).

## 공통 파일 변경 기록

다른 담당 영역이나 공통 파일을 수정할 때마다 이유와 영향을 적습니다. PR 본문에도 같은 내용을 씁니다.

| 날짜 | 파일 | 변경 | 이유 | 영향 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | (없음) | 1단계는 신규 파일만 추가 | — | 기존 테스트 10개 통과 유지 |
| 2026-10-11 | apps/api/app/core/auth.py | 세션 토큰 분기 추가, Actor.project_id 필드 | 본인확인 세션을 기존 current_actor 의존성으로 받기 위해 | 데모 토큰 동작·메시지·테스트 동일. 커밋 de2f32f |
| 2026-10-11 | apps/api/app/core/config.py | APP_ENV·SESSION_SECRET·SESSION_TTL_MINUTES·DEMO_VERIFY_CODE, preview/production 데모 금지 검증 | 데모 인증 수단을 배포 환경에서 차단 | 기존 설정 기본값 변경 없음 |
| 2026-10-11 | apps/api/app/modules/evaluations/router.py | require_assigned 본문을 core/permissions 호출로 교체 | 세션 토큰의 사업 범위 강제 | 호출부·403 메시지 동일 |
| 2026-10-11 | apps/api/app/modules/evaluations/models.py | criteria_version·signed_at·sheet_hash·sign_method 열(NULL 허용) | 기준 버전 고정·서명 기록(3·4단계) | 0002 migration, 기존 행은 NULL. 커밋 002471b |
| 2026-10-11 | apps/api/migrations/env.py | criteria·results 모델 import | alembic check가 새 모델을 보도록 | 없음 |
| 2026-10-11 | apps/api/app/main.py | criteria·evaluator_access 라우터 등록 2줄 | 신규 API 노출 | 기존 라우터 순서 유지. 커밋 48ba37d |
| 2026-10-11 | apps/api/.env.example | 로컬 전용 값 3개 추가 | 설정 발견성 | setup.ps1이 복사하는 기본 .env에 포함 |
| 2026-10-11 | apps/api/app/modules/evaluations/router.py·service.py | 저장·제출이 확정 기준 스냅샷으로 검증하고 criteria_version 기록. validate_scores에 criteria 인자 | EVAL-01 기준 버전 고정 | PR #1 테스트 전부 통과. 확정 기록이 없으면 종전처럼 버전 0으로 동작. 커밋 a4553a3·47b6823 |
| 2026-10-11 | apps/api/app/modules/evaluations/router.py·service.py | 제출 시 signed_at·sheet_hash·sign_method 기록, SheetRead에 세 필드 | RES-03 서명 기록·변조 검증 | 제출 응답에 필드 추가(기존 필드 변경 없음). 커밋 ff30485 |
| 2026-10-11 | apps/api/app/main.py | results 라우터 등록 1줄 | 결과 API 노출 | 없음. 커밋 ff30485 |
| 2026-10-11 | apps/web/src/main.tsx | /evaluator 경로 분기 3줄 | 평가위원 화면 진입. 라우터 도입 전 임시 | 기존 App 렌더 동일. 커밋 a1da966 |
| 2026-10-11 | apps/web/src/App.tsx | 메뉴 항목·Page 타입·렌더 1곳씩 | 결과 화면 연결 | 기존 메뉴 순서 유지 |
| 2026-10-11 | apps/web/src/features/evaluations/EvaluationPage.tsx | ScoreEditor·vendorName export, client prop(기본값 기존 동작) | 채점표 재사용, 중복 컴포넌트 방지 | 기존 호출부 변경 없음 |
| 2026-10-11 | apps/web/src/api/client.ts | 타입 4개, sessionApi·publicApi 추가 | 세션·공개 호출 | 기존 api·evaluatorApi 유지 |
| 2026-10-11 | apps/api/app/modules/evaluations/router.py, projects/criteria.py | 저장·제출·확정·재검토 앞에 ensure_not_sealed 1줄 | 결과 확정·완료 뒤 변경 차단(CLOSE-01) | 봉인 전 동작 동일. 커밋 5cee2dc |
| 2026-10-11 | .github/workflows/ci.yml | migration 단계에 upgrade 0001→head·downgrade -1·upgrade head 추가 | OPS-01 기존 스키마 업그레이드 검증 | CI 시간 소폭 증가. push 뒤 실행 확인 필요 |
| 2026-10-11 | scripts/e2e-api.mjs | E2E 서버 환경에 APP_ENV=ci·SESSION_SECRET·DEMO_VERIFY_CODE | 평가위원 E2E 실행 | PR #1 team-flow E2E 그대로 통과 |
| 2026-10-15 | apps/api/app/modules/committee/models.py | `birth_date` 열(NULL 허용) 1줄, migration 0003 | 본인확인용 생년월일 저장(Lex6won 테이블 확장, 사용자 승인) | 기존 열·제약 동일, 기존 행 NULL. Lex6won 리뷰 요청 |
| 2026-10-15 | apps/api/app/modules/committee/router.py | CandidateBase 분리, CandidateCreate에 선택 필드 `birth_date`(실제 날짜 검증·YYYYMMDD 정규화), CandidateRead는 필드 동일 | 생년월일 등록 경로(쓰기 전용) | 기존 등록 호출·응답 동일, 목록·추첨 스냅샷에 생년월일 없음. evaluator_access.service.normalize_birth_date import 1줄 |
| 2026-10-15 | apps/api/app/seed.py | 테스트위원 1·2에 합성 생년월일 | 본인확인 시연 | 기존 행은 갱신하지 않음(로컬 데모 DB는 수동 등록) |
| 2026-10-15 | apps/api/app/core/config.py, .env.example, scripts/e2e-api.mjs | DEMO_VERIFY_CODE 제거, 검증식 단순화 | 문자 인증 폐기. 관리자용 마스터 번호는 설정이 아니라 APP_ENV=local 상수 | 기존 .env의 DEMO_VERIFY_CODE는 무시됨. E2E는 APP_ENV=ci라 마스터 번호 차단 |
| 2026-10-15 | tests/e2e/team-flow.spec.ts | 새로고침 뒤 사업 재선택 1줄 | 앱이 새로고침 때 이름순 첫 사업을 골라 다른 E2E가 만든 사업과 섞이던 잠재 결함(그동안 우연히 통과) | cookiesh1 검토 요청: App.tsx가 새로고침 뒤 선택 사업을 유지할지 |
| 2026-10-15 | apps/web/src/features/evaluations/EvaluationPage.tsx | import 1줄, ScoreEditor에 useProposalCompare 훅 1줄, 평가항목 칸을 CriterionLabel로 교체 1곳, 패널 렌더 1줄 | 평가항목 옆 ⓘ와 하단 업체별 제안서 요약 비교 패널 | 점수 입력·저장·제출 로직 변경 없음. 관리자 평가 화면과 평가위원 화면이 같은 채점표를 쓰므로 둘 다 표시. cookiesh1 리뷰 요청 |
| 2026-10-15 | apps/api/app/modules/projects/models.py | `vendors` 열(JSON, NULL 허용) 1줄, migration 0004 | 업체 표시명 저장. 업체 ID 목록 `vendor_ids`는 그대로 점수·집계의 기준 | 기존 열·행 변경 없음. demo-project 등 NULL 행은 종전 표기(A사·B사·C사)로 표시. C 역할 리뷰 요청 |
| 2026-10-15 | apps/api/app/modules/projects/router.py | `Vendor` 스키마, `ProjectRead.vendors`(vendor_ids 순서의 표시명, 없으면 종전 표기), 해석 함수 2개 | 화면이 업체명을 한 곳에서 받도록 | 기존 필드 동일, 응답에 `vendors` 추가. 계약 예제·fixture 테스트 통과 |
| 2026-10-15 | apps/api/app/main.py | setup 라우터 등록 2줄 | 평가 설정 API 노출 | 기존 라우터 순서 유지 |
| 2026-10-15 | apps/api/app/modules/evaluator_access/router.py | brief 응답에 `vendors=project.vendors` 1줄 | 평가위원 화면 업체명 | 없음 |
| 2026-10-15 | apps/api/tests/test_contract_examples.py | 모델 수집 목록에 projects.setup 2줄 | 새 계약 예제 검증 | 없음 |
| 2026-10-15 | scripts/e2e-api.mjs | migration 뒤 `python -m app.seed` 3줄 | 시작용 샘플(demo-project)을 E2E로 검증 | 기존 E2E 2개 그대로 통과(후보 목록에 테스트위원 5명이 더 보임). DaeUng79 검토 요청 |
| 2026-10-15 | apps/web/src/App.tsx | 사업 상세 패널에 탭(개요·평가 설정)과 EvaluationSetupPage 렌더, 고정 문구(제안사 3개·80점) 제거 | 평가 설정 화면 진입 | 메뉴·사업 등록·다른 페이지 렌더 동일. cookiesh1 리뷰 요청 |
| 2026-10-15 | apps/web/src/features/evaluations/EvaluationPage.tsx, evaluator/EvaluatorApp.tsx, results/ResultsPage.tsx·ReportView.tsx | `vendorName(project, id)`·`maxTotal(project)`로 업체명·만점을 사업 설정에서 계산, 고정 "/ 80" 제거, ReportView에 project prop | 업체 수·항목 수 고정 해제 | 점수 저장·제출·서명·집계 로직 변경 없음 |
| 2026-10-15 | apps/web/src/features/evaluations/proposalSummaries.ts·ProposalComparePanel.tsx | 예시 자료는 demo-project에만, 요약 없는 카드는 "제안서 요약 정보가 없습니다." | 사용자 요구(신규 사업은 실제 자료 없음 표시) | tests/e2e/evaluator-flow.spec.ts 기대값 1곳 갱신 |
| 2026-10-15 | apps/api/app/core/session.py | SessionClaims.role에 admin, project_id NULL 허용, issue_session_token(role=) | 관리자 로그인도 같은 서명 세션을 쓰기 위해 | 기존 평가위원 토큰 형식·검증 동일. core/auth.py는 수정하지 않음 |
| 2026-10-15 | apps/api/app/core/config.py, .env.example | LOCAL_ADMIN_ID·LOCAL_ADMIN_PASSWORD(기본 admin/admin) | 로컬 시연용 관리자 로그인 | DEMO_AUTH=true일 때만 유효, preview/production은 기존 검증식이 차단 |
| 2026-10-15 | apps/api/app/main.py | auth 라우터 등록 2줄 | `POST /auth/login` 노출 | 기존 라우터 순서 유지 |
| 2026-10-15 | apps/api/app/modules/projects/models.py | DEFAULT_CRITERIA 배점 15·20·20·10·10·15·10(합계 100) | 배점 합계 100점 규칙 | 새 사업 기본값만 변경, 등록된 demo-project 행은 그대로(80점, 확정 v1). test_integration·test_results·test_report_close 기대값 갱신(60→75 등). C 역할 리뷰 요청 |
| 2026-10-15 | apps/api/tests/test_integration.py | 기대 평균 60→75, 초과 점수 예 11→16 | 템플릿 합계 100점 반영 | 검증 규칙 자체는 동일. DaeUng79 검토 요청 |
| 2026-10-15 | apps/web/src/api/client.ts | 고정 `local-admin` 헤더 제거, 세션 토큰 주입 미들웨어(setSessionToken) | 로그인 세션으로 호출 | evaluatorApi(개발용 전환)·sessionApi·publicApi 유지 |
| 2026-10-15 | apps/web/src/App.tsx | 로그인 게이트(App)와 작업 화면(Workspace) 분리, 권한별 메뉴·사업 목록·평가위원 페이지, 헤더 사용자명·권한·로그아웃 | 권한별 화면 분리 | 관리자 화면 구성·메뉴 이름·하위 기능 동일. cookiesh1 리뷰 요청 |
| 2026-10-15 | apps/web/src/features/evaluator/EvaluatorApp.tsx | ScoreStep·SubmittedSheetPanel·ChairSummaryPanel·detail export, standalone prop | 로그인 화면 평가위원 메뉴에서 같은 채점·제출·서명 컴포넌트 재사용 | 접근 링크 화면 동작 동일(E2E 통과) |
| 2026-10-15 | tests/e2e/team-flow.spec.ts, evaluator-flow.spec.ts, scripts 없음 | 관리자 화면 진입을 helpers.loginAsAdmin으로 | 로그인 게이트 | DaeUng79 검토 요청 |
| 2026-10-15 | apps/api/app/modules/projects/models.py | `technical_total_score` 열(NULL 허용) 1줄, `DEFAULT_TOTAL_SCORE` 상수, migration 0005 | 사업별 총배점 | 기존 행 NULL=100점. C 역할 리뷰 요청 |
| 2026-10-15 | apps/api/app/modules/projects/router.py | `ProjectCreate`에 `technical_total_score`·`criteria_source`, `ProjectRead`에 `technical_total_score`, `Criterion`에 선택 출처 필드 6개(division·description·elements·origin·source_ref·source_label) | 총배점·빈 평가표·제안요청서 출처 정보 | 기존 필드 동일. 응답에 null 선택 필드가 추가되어 내 테스트의 비교식을 core()로 보정 |
| 2026-10-15 | apps/api/app/modules/ai/router.py | `GET /projects/{id}/rfp-criteria` 1개(읽기 전용, 관리자) | 파싱 결과 미리보기 | A/DaeUng79 모듈에 연결 지점 추가. 파싱 엔진·테이블은 만들지 않음, step 모듈 import 없음(openai 의존성 비포함). DaeUng79 리뷰 요청 |
| 2026-10-15 | apps/api/app/core/config.py, .env.example | `DOCUMENTS_DB_PATH`(기본 apps/documents_daeung/documents.sqlite3) | 저장소 위치 설정 | 없음 |
| 2026-10-15 | apps/api/app/modules/projects/criteria.py, evaluations/router.py, setup.py | 합계 검사를 사업 총배점 기준으로(`project_total`), `CriterionIn`·`CriterionDraft` 출처 필드, 빈 목록 저장 허용, `PUT /setup/total-score` | 사업별 총배점·제안요청서 반영 | 100점 고정 규칙은 기본값으로만 남음 |

## 실행과 테스트

API: `apps/api`에서 가상환경(`.venv`)으로 `python -m pytest -q`, `python -m ruff check app tests migrations ../../scripts/export_openapi.py`, `python -m alembic check`. 웹: 저장소 루트에서 `npm run typecheck`, `npm run build`. 자세한 절차는 [docs/QUICKSTART.md](../../QUICKSTART.md)를 따릅니다.

[개발 계획](../../team/DEVELOPMENT_PLAN.md)의 선행 조건과 [인수검증표](../../testing/ACCEPTANCE.md)를 사용합니다. 아래 기록의 테스트는 작성자가 로컬에서 실행한 결과이며, 동료 재현 전까지 인수검증 통과로 표시하지 않습니다.

## 개발 기록

| 날짜 | Issue / PR | 기능·파일 | 상태 | 실행 명령·결과 | 동료 리뷰 / 남은 작업 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-10 | 아직 없음 | 역할·코드 경로·문서 체계 등록 | 문서 작성 | 제품 검증 미실행 | 기능별 작은 이슈와 PR 등록 |
| 2026-10-11 | 이슈·PR 미등록 (gh CLI 없음, push 계정 확인 전) | 1단계 항목 1·2: `contracts/examples/` 24개 예제, `tests/fixtures/synthetic/` 4개 자료, `apps/api/tests/test_contract_examples.py`. 커밋 ba89080 | 완료(로컬) | 기준 PR #1 658748e: pytest 10 passed 1 skipped(PostgreSQL). 변경 후: pytest 39 passed 1 skipped, ruff check·format 통과, `npm run typecheck` 통과 | cookiesh1: 화면 mock에 예제 사용 검토. DaeUng79: fixture ID·문서 revision 필드. API·DB 변경 없음 |
| 2026-10-11 | 이슈·PR 미등록 | 2단계 항목 3·4·6·7·9: core/permissions·session, evaluator_access 모듈(request-code·verify·me), projects/criteria.py(확정·재검토·조회), results/models.py, migration 0002, 계약 재생성. 커밋 de2f32f·002471b·48ba37d·73a5019 | 완료(로컬) | pytest 58 passed 1 skipped(PostgreSQL), ruff 통과, alembic upgrade head·check·downgrade 0001·upgrade(SQLite) 통과, npm typecheck 통과. 신규 API 6개 | DaeUng79: migration 0002 번호·병합 순서, 인증 제공자. Lex6won: 위원장 지정 출처(COM-03), 기준 확정 권한자. 공동 DB 미적용 |
| 2026-10-11 | 이슈·PR 미등록 | 3단계 항목 8·10: 기준 버전 고정(저장·제출), 두 탭 구버전 충돌·제출 후 잠금 테스트, PostgreSQL 병렬 저장·제출 테스트, SheetRead.criteria_version 계약 반영. 커밋 a4553a3·47b6823 | 완료(로컬) · PostgreSQL 병렬 테스트는 CI 실행 대기 | pytest 60 passed 2 skipped(PostgreSQL 2건), ruff 통과, npm typecheck 통과 | Lex6won: 기준 재확정 후 기존 평가표 처리 규칙(현재는 보수적 409). cookiesh1: 409 메시지 화면 표시 |
| 2026-10-11 | 이슈·PR 미등록 | 4단계 항목 11~16: results 모듈(정책·요약·확정), 제출 서명 기록, evaluator-access context·brief, 평가위원 화면(EvaluatorApp), 결과 화면(ResultsPage), 공통 파일 최소 수정. 커밋 ff30485·e88ee3f·a1da966 | 완료(로컬) · 브라우저 E2E는 5단계 | pytest 71 passed 2 skipped(PostgreSQL), ruff 통과, npm typecheck·build 통과. 신규 API 5개 | Lex6won: 위원장 지정 출처·결과 확정 주체, 집계 정책(최고·최저 제외·가격) 승인. cookiesh1: /evaluator 임시 분기 → 라우터 전환, 결과·평가위원 화면 UX. DaeUng79: 세션 비밀키 주입 |
| 2026-10-11 | 이슈·PR 미등록 | 5단계 항목 17~21: 리포트·완료 API, 봉인 뒤 변경 차단, 결과표 보기·인쇄·JSON, CI 업그레이드 검사, 평가위원 E2E, 모듈 문서 2개, 인수검증 §6 기록. 커밋 5cee2dc 외 문서 커밋 | 완료(로컬) | pytest 82 passed 2 skipped, ruff 통과, npm typecheck·build 통과, npm run test:e2e 2 passed(Chromium). 스크린샷 artifacts/*.png(미추적) | 동료 재현 전부 미실행. DaeUng79: 리포트 문서 revision 필드, 병합 순서. Lex6won: 위원장·정책. cookiesh1: 인쇄 화면·결과 화면 UX |
| 2026-10-15 | 이슈·PR 미등록 | 본인확인 방식 전환(기능 7): 생년월일 6자리(YYMMDD) 대조, 관리자용 로컬 마스터 번호(APP_ENV=local 한정, 모든 선정 위원, 화면·응답·문서 미표시), request-code API·DEMO_VERIFY_CODE 제거, migration 0003(committee_candidates.birth_date), 위원 등록 API 선택 필드, 화면 본인확인 패널, 계약 예제·openapi·타입 재생성, 테스트 14건, E2E 갱신. 미커밋 | 완료(로컬) | pytest 85 passed 2 skipped, ruff check·format 통과, alembic 0003 upgrade·check·downgrade -1·upgrade 통과(SQLite), npm typecheck·build 통과, npm run test:e2e 2 passed(Chromium) | Lex6won: committee 테이블·등록 API 변경 리뷰, 위원 앱(PR #7) birth_date 연계. cookiesh1: 본인확인 패널 UX, App 새로고침 선택 유지. DaeUng79: 0003 공동 DB 적용 순서. 미실행: 동료 재현, PostgreSQL 경로 CI |
| 2026-10-15 | 이슈·PR 미등록 | 기술평가표 업체별 제안서 요약 비교 패널(항목 22): 평가항목명 옆 ⓘ, 마우스 올림·키보드 포커스로 하단 패널 표시, ⓘ 클릭 고정·X 닫기·Esc, 업체 수에 맞춘 가로 카드(항목당 최대 2개·1~2줄, 원문 페이지·문서 ID), 패널 내부 스크롤과 높이 제한. 자료 구조 ProposalSummary(사업·업체·평가항목 ID, 요약, 페이지, 원본 문서 ID·버전, is_example)와 화면 확인용 예시 자료만 있으며 DB·API 변경 없음. 미커밋 | 완료(로컬) | npm typecheck·build 통과, npm run test:e2e 2 passed(패널 표시·항목 전환·벗어나면 닫힘·고정·닫기·점수 유지 확인), 스크린샷 수동 확인 | DaeUng79: AI 제안서 분석 결과를 loadProposalSummaries에 연결. cookiesh1: 패널 UX·색상 검토. 시안 이미지는 전달되지 않아 본문 설명 기준으로 구현 |
| 2026-10-15 | 이슈·PR 미등록 | 사업 상세 '평가 설정' 탭(항목 23): 평가항목·업체 등록·수정·삭제·순서·배점 합계·모달, 사업별 저장(projects.criteria·vendor_ids·vendors), 평가표 저장 뒤 잠금·기준 확정 뒤 항목 잠금, 평가표·비교 패널 자동 구성, 예시 요약은 demo-project만. API 3개(`GET /projects/{id}/setup`, `PUT …/setup/criteria`, `PUT …/setup/vendors`), migration 0004, 계약 예제 5개, 테스트 17건, E2E 2건. 미커밋 | 완료(로컬) | pytest 109 passed 2 skipped, ruff check·format 통과, alembic upgrade 0004·check 통과(SQLite), npm typecheck·build 통과, npm run test:e2e 4 passed(Chromium), 스크린샷 artifacts/evaluation-setup*.png | C 역할·DaeUng79: projects 모듈 수정 리뷰, 0004 공동 DB 적용 순서. cookiesh1: 탭·모달·표 UX. 미결: 추첨 뒤(평가표 저장 전) 변경 허용 유지 여부, 배점 합계 100점 강제 여부, 기준 확정 버튼의 화면 배치 |
| 2026-10-15 | 이슈·PR 미등록 | 로그인·권한별 화면(항목 24)과 배점 합계 100점 규칙(항목 25): `POST /auth/login`(로컬 시연용 admin/admin, DEMO_AUTH 전용), `POST /evaluator-access/login`(이름·생년월일, 선정 사업 전체 세션), `GET /evaluator-access/projects`, `/me`에 name, 세션 role=admin, 로그인 화면·헤더 사용자 영역·권한별 메뉴·평가위원 2메뉴 화면, 100점 규칙(확정 422·미확정 채점 409·템플릿 100). 테스트 6건, E2E 1건. 미커밋 | 완료(로컬) | pytest 122 passed 2 skipped, ruff check·format 통과, npm typecheck·build 통과, npm run test:e2e 5 passed(Chromium), 스크린샷 artifacts/login-*.png·evaluator-results.png | DaeUng79·Lex6won: 공통 인증 구조(세션 role 확장)·실제 인증 제공자·위원장 지정. cookiesh1: 로그인 화면·헤더 UX. C 역할: DEFAULT_CRITERIA 배점 변경. 미결: 평가위원에게 공개할 결과 범위(현재 본인 결과·서명만), 관리자 메뉴 이름 변경 여부(사업 관리/평가 관리/평가 진행/평가 결과) |
| 2026-10-15 | 이슈·PR 미등록 | 제안요청서 반영(항목 26)·사업별 총배점·빈 평가표 시작(항목 27): 읽기 전용 어댑터 `GET /projects/{id}/rfp-criteria`(documents.sqlite3 project_documents→criteria_results 최신 결과, 없으면 status로 안내, DEMO_AUTH 환경은 `?sample=true` 예시), 미리보기 모달(현재/추출/신규/변경/제외/합계/출처, 수정 가능, AI 제안 분리·기본 미선택, 재반영 중복 없음), `PUT /setup/total-score`, 등록 폼 총배점·시작 방식, migration 0005, 테스트 4건·E2E 1건, 계약 예제 4개. 미커밋 | 완료(로컬) | pytest 129 passed 2 skipped, ruff check·format 통과, alembic upgrade 0005·check 통과(SQLite), npm typecheck·build 통과, npm run test:e2e 6 passed(Chromium), 스크린샷 artifacts/rfp-preview.png·rfp-applied.png | DaeUng79: 파싱 결과에 행별 원문 페이지·블록 ID 추가, 사업-문서 연결(project_documents.project_id=심사임당 사업 ID) 운영 방식, 0005 적용 순서. cookiesh1: 미리보기 모달 UX. 미결: 공식 기준이 아닌 AI 초안 배점(generated_from_summary)의 반영 허용 범위 |
| 2026-10-16 | 이슈·PR 미등록 | 평가위원장 지정(항목 28): `GET/PUT /projects/{id}/committee/chair`(관리자, 본위원만·사업당 1명·사유·이력·확정 뒤 409), `POST /results/confirm` 본문 `{reviewed: true}`와 서명 기록 검사, migration 0006, 추첨 결과 패널 라디오·배지·사유·이력, 위원장 패널 현황·집계·확인 동의, 계약 예제 7개. 미커밋 | 완료(로컬) | pytest 133 passed 2 skipped, ruff check·format 통과, alembic upgrade 0006·check(SQLite) 통과, scripts/export_openapi.py + npm run contracts:types, npm run typecheck·build 통과, npm run test:e2e 7 passed(Chromium, chair-flow 추가). 로컬 DB simsaimdang.db 0006 적용 | Lex6won: `committee_draws` 열 확장·`committee/chair.py` 배치·위원장 자격 조건·예비위원 승격 시 처리. cookiesh1: 라디오·배지·사유 입력·이력 UX, 위원장 패널 표. DaeUng79: 0006 공동 DB 적용 순서 |
| 2026-10-16 | 이슈·PR 미등록 | 평가위원장 자필 서명(항목 29): `POST /results/confirm` 본문에 `signature_image`(PNG data URL) 필수·서버 검증(형식·300KB·2000px), result_confirmations 0007(서명 이미지·해시·방식·이름), 리포트 `signature_intact`·완료 차단, 서명 캔버스 컴포넌트, 위원장 화면·관리자 결과 화면·결과표 서명 표시, 계약 예제 갱신. 미커밋 | 완료(로컬) | pytest·ruff·alembic 0007 check·typecheck·build·E2E는 아래 세션 기록 참고. 로컬 DB simsaimdang.db 0007 적용 | cookiesh1: 서명 캔버스·미리보기·결과표 서명 블록 UX. DaeUng79: 0007 공동 DB 적용 순서, 서명 이미지 저장 위치(TEXT 열 vs 파일 저장소) |

```text
담당 기능:
입력/출력 및 변경 파일:
API·DB·계약 변경:
선행 이슈와 관련 담당:
완료 조건:
실행 환경·커밋·테스트 명령:
실제 결과·증거:
미실행 항목·다음 작업:
```
