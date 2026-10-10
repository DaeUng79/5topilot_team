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
| 4 | 2 | 평가위원 본인확인·세션 (데모 코드 로컬 전용) | modules/evaluator_access/, core/session.py, core/config.py (수정) | SEC-01 | 없음 | 완료(로컬) · 발송 채널은 인터페이스만 |
| 5 | 2 | 관리자·위원장 실제 인증 연결 ※ | core/auth.py (수정) | SEC-01 | DaeUng79 (제공자) | 외부 연동 대기 · current_actor에 끼울 자리만 확보 |
| 6 | 2 | 기준 확정 기록 ※ | modules/projects/criteria.py (projects/router.py는 수정하지 않고 main.py에 등록) | EVAL-01, DOC-03·04 | DaeUng79·Lex6won | 완료(로컬) · 확정 권한은 관리자 |
| 7 | 2 | migration 0002 | migrations/versions/0002_criteria_results_signatures.py, migrations/env.py (수정) | OPS-01 | DaeUng79 (번호) | 완료(로컬) · 공동 DB 미적용 |
| 8 | 3 | 점수 저장에 기준 버전 고정 | evaluations/router.py, service.py (수정) | EVAL-01 | 없음 | 완료(로컬) · 버전 불일치·재검토 중 409 |
| 9 | 3 | 권한 검사 공통 호출 교체 | evaluations/router.py (수정) | SEC-01 | 없음 | 완료(로컬, 2단계에서 선행) |
| 10 | 3 | PostgreSQL 동시 편집·제출 테스트 | apps/api/tests/test_sheet_versions.py | EVAL-02, EVAL-03 | 없음 | 작성 완료 · 두 탭 시나리오는 SQLite 통과, 병렬 4·3건은 CI PostgreSQL에서 실행(로컬 skip) |
| 11 | 4 | 집계 정책 v1 (버전 있는 계산) | modules/results/policies.py, service.py | RES-02 | Lex6won (정책 승인) | 완료(로컬) · trimmed_mean은 미승인 초안으로 등록만 |
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

재사용하고 다시 만들지 않는 기존 코드: 점수 저장·제출·잠금·version 충돌(`evaluations/router.py`), 기술평균(`evaluations/service.py`), 데모 토큰(`core/auth.py`), 채점표 컴포넌트(`ScoreEditor`), 공통 스타일, seed 데이터, CI 계약 차이 검사, E2E 패턴.

업무 규칙이 확정되지 않아 승인 전까지 PR #1 동작을 유지하는 것: 점수 입력 단위(디자인 5단계 버튼 vs 0.01 단위), 집계 산식(최고·최저 제외·가격 20점), 자동 저장, 서명 저장 형식, 미제출자 알림, HWP 보고서 파일 생성.

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
