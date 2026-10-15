# 제안평가 · 평가위원 본인확인 모듈

담당: u-jing. 코드: `apps/api/app/modules/evaluations/`, `apps/api/app/modules/evaluator_access/`, `apps/api/app/core/{auth,session,permissions}.py`, 화면 `apps/web/src/features/evaluator/`. 기준 커밋: PR #1(658748e) 위에 추가. 이 문서는 유지보수용 설명이며 실행 방법은 [docs/QUICKSTART.md](../QUICKSTART.md)를 따른다.

## 1. 인증 주체와 권한

| 주체 | 들어오는 방법 | 범위 |
| --- | --- | --- |
| 관리자(간사) | ① 로그인 화면 `POST /auth/login`(아이디/비밀번호, `LOCAL_ADMIN_ID`/`LOCAL_ADMIN_PASSWORD`, `SIMSAIMDANG_DEMO_AUTH=true`인 로컬·CI에서만) → role=admin 세션 토큰 ② 로컬 개발 토큰 `local-admin`. 실제 JWT/SSO는 제공자 결정 뒤 같은 자리(세션 발급·`current_actor`)에 추가 | 모든 사업 |
| 평가위원 | ① 접근 링크 본인확인(`verify`) 뒤 세션 토큰(`s1.<payload>.<hmac>`, 사업 하나) ② 로그인 화면 본인확인(`POST /evaluator-access/login`, 이름·생년월일) 뒤 세션 토큰(project_id null = 선정된 모든 사업) ③ 로컬 개발 토큰 `local-evaluator:<id>` | ①은 토큰에 적힌 사업 하나. ②③은 추첨 결과로 사업마다 다시 판정 |
| 위원장 | 사업관리자가 추첨 결과의 본위원 중 지정한 사람(`committee_draws.chair_id`, 0006, `PUT /projects/{id}/committee/chair`). `core/permissions.chair_id()`가 읽는다 | 사업 하나. 같은 사람이 다른 사업에서는 일반 위원일 수 있다. 결과 확정 뒤 변경 불가 |

사업 단위 판정은 `require_project_role(db, project_id, actor, {"admin"|"evaluator"|"chair"})` 하나로 한다. 요청 본문의 사용자 ID는 믿지 않는다. 다른 사업 세션, 예비위원, 미선정 위원은 403.

설정(`apps/api/.env`): `APP_ENV`(local/ci/preview/production), `SESSION_SECRET`(비어 있으면 세션 발급·검증 503), `SESSION_TTL_MINUTES`(기본 120). 본인확인용 설정값은 없다. 관리자용 로컬 마스터 번호는 코드 상수(`evaluator_access/service.LOCAL_MASTER_CODE`)이며 `APP_ENV=local`에서만 모든 선정 위원에게 통한다. 값은 화면·응답·문서에 적지 않는다. `APP_ENV`가 preview/production이면 `SIMSAIMDANG_DEMO_AUTH`가 켜진 상태로는 서버가 기동하지 않는다.

## 2. 평가위원 본인확인 (evaluator_access)

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/evaluator-access/context?candidate_id=` | 없음(접근 링크) | 사업명·부서·위원명·기준 버전. 선정 위원이 아니면 403. 점수·기준·연락처·생년월일·생년월일 등록 여부는 주지 않는다 |
| `POST /projects/{id}/evaluator-access/verify` | 없음 | 본문 `{candidate_id, birth_date}`(등록된 생년월일의 뒤 6자리 YYMMDD). 선정 위원 + 일치 → 세션 토큰·만료 시각·`method`(`birth_date` 또는 `local_master_code`). 미선정·추첨 전 403, 불일치 401 "생년월일이 일치하지 않습니다.", 생년월일 미등록 위원 401 "등록된 생년월일이 없어 본인확인을 할 수 없습니다.", 같은 (사업, 위원) 10분 안 5회 실패 후 429. `APP_ENV=local`에서는 관리자용 마스터 번호가 모든 선정 위원에게 통하고 그 외 환경에서는 통하지 않는다. 응답·로그·화면에 생년월일·마스터 번호 없음 |
| `POST /evaluator-access/login` | 없음(로그인 화면) | 본문 `{name, birth_date}`. 등록된 이름·생년월일이 맞고 선정된 사업이 하나라도 있으면 모든 선정 사업에 유효한 세션. 불일치 401, 미선정 403, 동명이인이 모두 선정 409, 같은 이름 10분 안 5회 실패 429. 마스터 번호 규칙은 verify와 같다 |
| `GET /evaluator-access/projects` | 평가위원 세션 | 본위원으로 선정된 사업 목록(채점용 ProjectRead). 사업별 세션은 그 사업만. 관리자 세션은 403 |
| `GET /evaluator-access/me` | 세션 또는 데모 토큰 | 현재 주체(role·id·project_id·표시명 name). 화면은 새로고침 때 이 응답으로 로그인 상태를 확인한다 |
| `POST /auth/login` (modules/auth) | 없음(로그인 화면) | 본문 `{username, password}`. 로컬 시연용 관리자 계정이 맞으면 role=admin 세션. DEMO_AUTH가 꺼진 환경 503, 불일치 401, 5회 실패 429 |
| `GET /projects/{id}/evaluator-access/brief` | 선정 위원 | 채점 화면용 `ProjectRead`. criteria는 확정 스냅샷(없으면 시작용 템플릿, 재검토 중 409) |

접근 링크는 `/evaluator?project=<사업ID>&candidate=<위원ID>`다. 화면은 토큰을 `sessionStorage`에 두고 401이면 본인확인으로 돌아간다. 시도 횟수 제한은 프로세스 메모리 기준이라 다중 인스턴스에서는 저장소 기반으로 바꿔야 한다. 생년월일은 위원 등록 API(`POST /committee/candidates`, 선택 필드 `birth_date`, `YYYYMMDD` 또는 `YYYY-MM-DD`, 실제 날짜 검증)로 받아 `committee_candidates.birth_date`에 `YYYYMMDD`로 저장하며, 위원 목록(`CandidateRead`)·추첨 스냅샷·context·세션 응답에는 넣지 않는다. 생년월일 대조는 문자(SMS) 발송을 쓸 수 없는 동안의 본인 확인 수단이며, 실제 본인인증(휴대폰 본인확인 등)·링크 발급·만료 정책은 외부 연동 대기로 완료로 표시하지 않는다.

로그인 화면(`apps/web/src/features/auth/LoginPage.tsx`)은 사업관리자 탭과 평가위원 탭을 두고, 세션(`sessionStorage` `simsa.session`)을 저장한 뒤 `App`이 `/evaluator-access/me`로 권한을 다시 확인해 메뉴를 나눈다(관리자 4개, 평가위원 2개: 평가·제출·취합, 결과·서명·리포트). 평가위원 메뉴는 `features/evaluator/EvaluatorPages.tsx`가 접근 링크 화면의 `ScoreStep`·`SubmittedSheetPanel`·`ChairSummaryPanel`을 재사용한다. 메뉴 숨김은 편의이고 실제 차단은 `require_admin`·`require_project_role`이 한다(평가위원 세션으로 `/projects`, `/committee/*`, `/projects/{id}/setup`, `/results/summary|report` 호출 시 403). 로그아웃은 토큰 폐기(클라이언트)이며 서버 폐기 목록은 없다.

## 3. 평가표 (evaluations)

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/evaluations/me` | 선정 위원 | 본인 평가표 또는 null |
| `PUT /projects/{id}/evaluations/me` | 선정 위원 | `expected_version`(처음은 0) 일치 시 저장, 아니면 409. 제출 후 409 |
| `POST /projects/{id}/evaluations/me/submit` | 선정 위원 | 전 항목 작성·`attested=true`·버전 일치 시 제출·잠금 |
| `GET /projects/{id}/results` | 관리자 | PR #1 시작용 취합. 유지하되 신규 화면은 `results/summary`를 쓴다 |

점수 규칙(PR #1 유지): 0 이상 배점 이하, 소수 둘째 자리까지, 업체·항목 조합 중복 금지. 제출은 모든 업체 × 모든 항목이 있어야 한다.

평가기준 버전(EVAL-01): 저장·제출은 `projects/criteria.effective_criteria()`가 돌려주는 확정 스냅샷으로 검증하고 `criteria_version`을 기록한다. 확정 기록이 없으면 사업의 현재 기준과 버전 0(시작용)으로 동작한다. 평가표의 버전이 현재 확정 버전과 다르면 저장·제출 409, 기준이 재검토 중(needs_review)이면 409. 재확정 뒤 기존 평가표를 어떻게 처리할지는 규칙 미합의라 보수적으로 거절한다.

제출 기록(RES-03): `signed_at`(= `submitted_at`), `sheet_hash`, `sign_method="attestation-v1"`. 해시는 `{project_id, evaluator_id, criteria_version, opinion, scores(정렬)}`의 정규 JSON SHA-256(`evaluations/service.sheet_hash`). 본인 확인 문구 동의와 내용 해시이며 **법적 전자서명이 아니다**. 손글씨 서명 이미지 저장은 형식 미결.

봉인 뒤 변경(CLOSE-01): 결과가 확정(`result_confirmations` 존재)되거나 완료되면 저장·제출은 409(`results/state.ensure_not_sealed`).

제안서 요약 비교 패널(화면): 기술평가표(`ScoreEditor`)의 평가항목명 옆 ⓘ에 마우스를 올리거나 포커스하면 화면 하단에 업체별 제안서 요약 비교 패널이 뜬다(`features/evaluations/ProposalComparePanel.tsx`). ⓘ 클릭은 고정, X·Esc는 닫기. 자료는 `proposalSummaries.ts`의 `ProposalSummary`(project_id, vendor_id, criterion_id, items[{text, page}], source_document_id, source_revision, is_example) 구조이며 지금은 시작용 샘플 사업(`demo-project`)에만 `is_example=true`인 화면 확인용 예시를 만들고, 다른 사업은 빈 목록이라 업체 카드마다 "제안서 요약 정보가 없습니다."를 표시한다. 실제 AI 제안서 분석(DaeUng79)이 생기면 `loadProposalSummaries()`만 바꾼다. 카드 수는 사업의 업체 수를 따른다. 점수 입력 상태와 분리된 읽기 전용 자료이고 DB·API는 바꾸지 않았다.

## 3-1. 평가 설정 (projects/setup, 관리자)

사업 상세의 '평가 설정' 탭(`apps/web/src/features/projects/EvaluationSetupPage.tsx`)이 쓴다. 저장 위치는 기존 `projects.criteria`(항목 ID·이름·배점, 목록 순서 = 표시 순서)와 `projects.vendor_ids`(업체 ID 순서)이고, 업체 표시명만 0004의 `projects.vendors`(`[{id, name}]`)에 둔다. 평가표(`ScoreEditor`)·검증(`validate_scores`)·집계는 이 값을 그대로 읽으므로 항목 수·업체 수가 바뀌면 자동으로 따라간다. 업체명은 `ProjectRead.vendors`로 내려가며 화면은 `vendorName(project, id)`·`maxTotal(project)`로 업체명과 만점을 계산한다.

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/setup` | 관리자 | 평가항목·업체(표시명)·배점 합계·기준 버전·영역별 편집 가능 여부와 잠금 사유 |
| `PUT /projects/{id}/setup/criteria` | 관리자 | 전체 목록 교체(표시 순서대로). `id` 생략 시 서버가 `crit-xxxxxxxx` 발급. 이름 1~100자, 배점 1~100 정수, ID·이름 중복 422 |
| `PUT /projects/{id}/setup/vendors` | 관리자 | 전체 목록 교체. `id` 생략 시 `vendor-xxxxxxxx` 발급, `vendor_ids`도 같은 순서로 갱신. ID·이름 중복 422 |

배점 합계 규칙(2026-10-15 결정): 평가항목 배점 합계는 사업의 기술평가 총배점(`projects.technical_total_score`, 0005, NULL=100, `PUT /projects/{id}/setup/total-score`로 변경, 평가항목과 같은 잠금)과 같아야 한다. 설정 저장은 중간 상태를 허용하고 화면이 경고하며, 평가기준 확정은 422, 미확정 템플릿(버전 0)으로 채점 시작(저장·제출)은 409로 거절한다(`projects/criteria.project_total`). 이미 확정된 기준(예: 로컬 demo-project v1=80점)은 그대로 채점된다. 새 사업은 `POST /projects`의 `criteria_source`(template: 샘플 7항목 합계 100점 복사, empty: 빈 평가표)와 `technical_total_score`로 시작한다.

[제안요청서 반영]: `GET /projects/{id}/rfp-criteria`(관리자, `modules/ai/rfp_criteria.py`)가 DaeUng79 documents 모듈의 SQLite(`DOCUMENTS_DB_PATH`, 기본 `apps/documents_daeung/documents.sqlite3`)에서 `project_documents(project_id=사업 ID)`로 연결된 문서의 최신 `criteria_results.result_json`(step4)을 읽기 전용으로 변환해 돌려준다(status ready / not_found / not_connected, DEMO_AUTH 환경에서 `?sample=true`면 테스트용 예시 sample). 원문 평가표 행(template_source=request_document)만 공식 기준(origin=rfp)이고 총괄표 AI 초안·보완 항목(supplemental_items)은 AI 제안(origin=ai)이다. 화면(`features/projects/RfpCriteriaPreview.tsx`, `rfpCriteria.ts`)은 현재 항목과 비교해 신규·배점 변경·동일·제외 후보를 보여 주고(짝 맞춤은 `source_ref` 또는 이름 완전 일치만), 담당자가 수정·선택한 뒤 [검토 후 반영]을 누를 때만 `PUT /setup/criteria`로 저장한다. 평가항목 dict에는 선택 출처 필드(division, description, elements, origin, source_ref, source_label)가 함께 저장되며 채점·집계에는 쓰지 않는다. 저장 결과에 행별 원문 페이지가 없어 출처는 문서명·행 ID로 표시한다.

잠금: 결과 확정·완료(CLOSE-01) → 둘 다 409. 평가표가 하나라도 저장됨(`evaluation_sheets` 행 존재) → 둘 다 409 "평가위원이 평가표 작성을 시작해…". 평가기준 확정 기록이 있음 → 평가항목만 409(재검토 → 재확정 흐름을 우회하지 않기 위해), 업체는 가능. 추첨 완료만으로는 잠그지 않는다. 시작용 샘플(`demo-project`, seed)과 `DEFAULT_CRITERIA`는 바꾸지 않았고, `vendors`가 NULL인 행은 종전 표기(A사·B사·C사)로 보인다. 새 사업은 등록 직후 시작용 템플릿(7항목·3사)으로 시작하며 탭에서 바꾼다. 배점 합계는 표시만 하고 100점을 강제하지 않는다(미합의).

## 4. DB (migration 0002)

`evaluation_sheets`에 추가된 열: `criteria_version INTEGER NULL`(0=미확정 템플릿, NULL=0002 이전 행), `signed_at`, `sheet_hash`, `sign_method`(제출 전 NULL). 기존 열·제약은 그대로다.

migration 0003(u-jing): `committee_candidates.birth_date VARCHAR(8) NULL`(`YYYYMMDD`, NULL=미등록). 0001(Lex6won) 테이블을 확장한 것이며 Lex6won 위원 앱(PR #7)의 `birth_date` 필드명과 맞춘다. 0001·0002는 수정하지 않았고 공동 DB 적용은 DaeUng79·Lex6won과 순서를 정한 뒤 수행한다.

migration 0004(u-jing): `projects.vendors JSON NULL`(`[{id, name}]` 업체 표시명). 기존 행은 NULL이며 ID 목록 `vendor_ids`와 점수의 `vendor_id`는 그대로 쓴다. 0001~0003은 수정하지 않았다.

migration 0005(u-jing): `projects.technical_total_score INTEGER NULL`(사업별 기술평가 총배점, NULL=100). 기존 행은 NULL이다. 0001~0004는 수정하지 않았다.

## 5. 오류 코드

401 세션 위조·만료·토큰 없음(데모 모드) / 생년월일 불일치 / 생년월일 미등록(local 외) · 403 권한·배정 위반 · 404 사업 없음 · 409 버전 충돌·제출 후 수정·기준 버전 불일치·재검토 중·봉인됨 · 422 입력 오류·미완성 제출·생년월일 형식 오류(등록) · 429 본인확인 시도 초과 · 503 인증 미설정·세션 키 없음.

## 6. 테스트

`apps/api/tests/test_rfp_criteria.py`(예시 자료·관리자 전용, 테스트용 documents.sqlite3에서 최신 결과·공식/AI 구분, 사업별 총배점·빈 평가표·채점 시작 409·확정 422·잠금, 출처 정보 왕복·재반영 ID 유지), `tests/e2e/rfp-criteria.spec.ts`(빈 평가표+총배점 등록, 미리보기 비교·수정·반영, 재반영 중복 없음, 총배점 불일치 저장 거절, 잠금), `apps/api/tests/test_auth_login.py`(관리자 로컬 로그인·잠금·배포 차단, 평가위원 이름·생년월일 로그인과 배정 사업 범위·관리자 API 403, 동명이인·마스터 번호·잠금, 100점 규칙), `tests/e2e/login-roles.spec.ts`(미로그인 화면, 관리자 4메뉴, 새로고침 유지, 로그아웃, 평가위원 2메뉴·배정 사업만·관리자 API 403·채점·제출·서명·결과 열람 제한), `apps/api/tests/test_project_setup.py`(평가 설정: 관리자 권한, 순서·ID·표시명 저장, 입력 검증 11건, 평가표 저장 뒤 잠금과 5항목×4업체 평가표 제출·집계, 기준 확정 뒤 항목만 잠금), `tests/e2e/evaluation-setup.spec.ts`(탭·모달·순서·삭제·새로고침 유지·24칸 평가표·업체 4개 카드와 요약 없음 문구·잠금, 샘플 사업 7항목·3사·예시 패널), `apps/api/tests/test_evaluator_access.py`(생년월일 일치·불일치·잠금, 로컬 마스터 번호(모든 선정 위원)와 ci/preview/production 차단, 미등록 위원 차단, 예비·미등록·추첨 전 차단, 마스터 번호가 접근 안내·OpenAPI·계약 예제·화면 소스에 없음, 생년월일 쓰기 전용·정규화·응답 미노출, 세션 범위·위조·만료, 설정 검증, context·brief), `test_sheet_versions.py`(버전 고정, 두 탭 충돌, PostgreSQL 병렬 저장·제출은 CI에서 실행), `test_contract_examples.py`(계약 예제·fixture 일치), `tests/e2e/evaluator-flow.spec.ts`(브라우저 흐름: 잘못된 생년월일 거절, ci에서 마스터 번호 거절, 정상 입력 세션 발급, 미등록 위원 차단). PR #1 `test_integration.py`는 그대로 통과한다.

## 7. 미결·협의

- 관리자·위원장 실제 인증 제공자(DaeUng79). 생년월일 등록 경로는 Lex6won 위원 앱(PR #7)의 `birth_date`와 연결하며, 그 전까지는 위원 등록 API의 선택 필드로 입력한다. 실제 본인인증 수단(휴대폰 본인확인 등)은 미결.
- 재확정 뒤 기존 평가표 처리 규칙, 자동 저장 여부, 점수 입력 단위(디자인 5단계 버튼)(Lex6won·cookiesh1).
- `/evaluator` 경로 분기는 라우터 도입 전 임시(cookiesh1).
