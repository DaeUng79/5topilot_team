# 제안평가 · 평가위원 본인확인 모듈

담당: u-jing. 코드: `apps/api/app/modules/evaluations/`, `apps/api/app/modules/evaluator_access/`, `apps/api/app/core/{auth,session,permissions}.py`, 화면 `apps/web/src/features/evaluator/`. 기준 커밋: PR #1(658748e) 위에 추가. 이 문서는 유지보수용 설명이며 실행 방법은 [docs/QUICKSTART.md](../QUICKSTART.md)를 따른다.

## 1. 인증 주체와 권한

| 주체 | 들어오는 방법 | 범위 |
| --- | --- | --- |
| 관리자(간사) | 로컬 개발 토큰 `local-admin` (`SIMSAIMDANG_DEMO_AUTH=true`일 때만). 실제 JWT/SSO는 제공자 결정 뒤 `core/auth.py`의 `current_actor`에 추가 | 모든 사업 |
| 평가위원 | ① 본인확인 뒤 서버가 발급한 세션 토큰(`s1.<payload>.<hmac>`) ② 로컬 개발 토큰 `local-evaluator:<id>` | ①은 토큰에 적힌 사업 하나. ②는 추첨 결과로 사업마다 다시 판정 |
| 위원장 | 평가위원 중 `core/permissions.chair_id()`가 돌려주는 사람 | 위원 기능(COM-03, Lex6won)에 위원장 정보가 생기기 전까지 항상 미지정 |

사업 단위 판정은 `require_project_role(db, project_id, actor, {"admin"|"evaluator"|"chair"})` 하나로 한다. 요청 본문의 사용자 ID는 믿지 않는다. 다른 사업 세션, 예비위원, 미선정 위원은 403.

설정(`apps/api/.env`): `APP_ENV`(local/ci/preview/production), `SESSION_SECRET`(비어 있으면 세션 발급·검증 503), `SESSION_TTL_MINUTES`(기본 120), `DEMO_VERIFY_CODE`(6자리, 비어 있으면 데모 본인확인 꺼짐). `APP_ENV`가 preview/production이면 `SIMSAIMDANG_DEMO_AUTH`나 `DEMO_VERIFY_CODE`가 켜진 상태로는 서버가 기동하지 않는다.

## 2. 평가위원 본인확인 (evaluator_access)

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/evaluator-access/context?candidate_id=` | 없음(접근 링크) | 사업명·부서·위원명·기준 버전. 선정 위원이 아니면 403. 점수·기준·연락처는 주지 않는다 |
| `POST /projects/{id}/evaluator-access/request-code` | 없음 | 발송 채널 인터페이스. 데모 코드가 설정돼 있으면 202 `channel=demo`, 아니면 503. 문자·메일 발송은 `service.CodeSender` 구현으로 연결 |
| `POST /projects/{id}/evaluator-access/verify` | 없음 | 선정 위원 + 코드 일치 → 세션 토큰·만료 시각. 응답에 코드 없음. 미선정 403, 불일치 401, 같은 (사업, 위원) 10분 안 5회 실패 후 429, 데모 꺼짐 503 |
| `GET /evaluator-access/me` | 세션 또는 데모 토큰 | 현재 주체 |
| `GET /projects/{id}/evaluator-access/brief` | 선정 위원 | 채점 화면용 `ProjectRead`. criteria는 확정 스냅샷(없으면 시작용 템플릿, 재검토 중 409) |

접근 링크는 `/evaluator?project=<사업ID>&candidate=<위원ID>`다. 화면은 토큰을 `sessionStorage`에 두고 401이면 본인확인으로 돌아간다. 시도 횟수 제한은 프로세스 메모리 기준이라 다중 인스턴스에서는 저장소 기반으로 바꿔야 한다. 실제 인증(문자 발송, 링크 발급·만료 정책, 연락처 저장)은 외부 연동 대기이며 완료로 표시하지 않는다.

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

## 4. DB (migration 0002)

`evaluation_sheets`에 추가된 열: `criteria_version INTEGER NULL`(0=미확정 템플릿, NULL=0002 이전 행), `signed_at`, `sheet_hash`, `sign_method`(제출 전 NULL). 기존 열·제약은 그대로다.

## 5. 오류 코드

401 세션 위조·만료·토큰 없음(데모 모드) / 인증번호 불일치 · 403 권한·배정 위반 · 404 사업 없음 · 409 버전 충돌·제출 후 수정·기준 버전 불일치·재검토 중·봉인됨 · 422 입력 오류·미완성 제출 · 429 본인확인 시도 초과 · 503 인증 미설정·세션 키 없음·데모 본인확인 꺼짐·발송 채널 미연결.

## 6. 테스트

`apps/api/tests/test_evaluator_access.py`(세션 범위·위조·만료·설정 검증·context·brief), `test_sheet_versions.py`(버전 고정, 두 탭 충돌, PostgreSQL 병렬 저장·제출은 CI에서 실행), `test_contract_examples.py`(계약 예제·fixture 일치), `tests/e2e/evaluator-flow.spec.ts`(브라우저 흐름). PR #1 `test_integration.py`는 그대로 통과한다.

## 7. 미결·협의

- 관리자·위원장 실제 인증 제공자(DaeUng79). 연락처 저장과 발송 채널(Lex6won, committee).
- 재확정 뒤 기존 평가표 처리 규칙, 자동 저장 여부, 점수 입력 단위(디자인 5단계 버튼)(Lex6won·cookiesh1).
- `/evaluator` 경로 분기는 라우터 도입 전 임시(cookiesh1).
