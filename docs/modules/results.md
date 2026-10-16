# 취합·결과 확정·리포트·완료 모듈

담당: u-jing. 코드: `apps/api/app/modules/results/`, `apps/api/app/modules/projects/criteria.py`, 화면 `apps/web/src/features/results/`. 개인 평가표 제출(evaluations)과 사업 결과 확정은 별도 상태다.

## 1. 평가기준 확정 기록 (projects/criteria.py)

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/criteria/confirmation` | 관리자·선정 위원 | 현재 확정 기록 또는 null |
| `POST /projects/{id}/criteria/confirm` | 관리자 | `expected_version`(없으면 0) 일치 시 버전+1 확정. 기준 생략 시 사업의 현재 기준을 스냅샷. 이전 확정은 superseded, `projects.criteria`도 같은 값으로 동기화. 항목 ID 중복 422 |
| `POST /projects/{id}/criteria/confirmation/review` | 관리자 | 원본 revision 변경 등으로 needs_review 표시(DOC-04). 재검토 중에는 채점 409 |

테이블 `criteria_confirmations`: `project_id`, `version`(사업별 unique), `criteria`(JSON 스냅샷), `status`, `confirmed_by/at`, `source_document_id`, `source_revision`, `review_reason`. 문서 ID·revision은 DaeUng79 문서 계약 문자열을 그대로 담는다. 확정 권한자(간사 vs 위원장·기획)는 Lex6won과 협의 대상이다. 결과 확정 뒤에는 변경 409.

## 2. 집계 정책 (results/policies.py)

정책은 버전 이름으로 고정되고 승인된 정책만 `aggregate()`에 쓸 수 있다(RES-02).

| 버전 | 승인 | 내용 |
| --- | --- | --- |
| `trimmed_mean_v1` | 예(현행) | 제안사별로 위원별 총점(항목 합계) 중 최고 1개·최저 1개를 제외한 평균. 위원 2명 이하면 전체 평균. 동점 최고(최저)는 1개만 제외. Decimal·ROUND_HALF_UP·소수 둘째 자리. 2026-10-11 u-jing 지시로 승인, PM(Lex6won) 확인 대기 |
| `technical_mean_v1` | 예(기록용) | PR #1 단순평균. 비교·기록용으로 남기며 현행 집계에는 쓰지 않는다 |

순위는 기술 평균 내림차순, 동점은 같은 순위(1, 1, 3). 가격점수·최종 순위 산식·동점 규칙은 승인 전이며 화면에 "정책 승인 전"으로 표시한다. 손 계산 기대값은 `tests/fixtures/synthetic/expected_results.json`(3명 제외, 2명 미제외, 5명 제외 사례). 결과가 확정된 사업은 정책이 바뀌어도 확정 스냅샷의 평균·순위·정책을 그대로 보여준다. PR #1의 `GET /projects/{id}/results`도 같은 현행 정책을 쓴다.

## 3. 취합·확정·리포트·완료 (results/service.py, report.py, state.py)

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/results/summary` | 관리자·위원장 | 위원별 제출·서명 상태, 상태(collecting/technical_complete/confirmed/closed). 평균·순위는 **전원 제출 뒤에만**(RES-01). `confirmable`, `chair_id`, 안내문 |
| `POST /projects/{id}/results/confirm` | 위원장 | 본문 `{reviewed: true, signature_image: "data:image/png;base64,…"}`(확인 동의 + 화면에서 마우스·터치로 작성한 자필 서명 PNG, 300KB·2000px 이하. 누락·false·형식 오류 422). 전원 제출, 모든 평가표에 서명 기록(signed_at·해시·방식), 기준 버전이 같고 1 이상이며 현재 확정 버전과 일치, 평가표 해시 재검증 통과 → 스냅샷(정책·기준·위원장 ID·확인 방식 `chair-handwritten-v1`·평균·순위·평가표 해시)과 SHA-256을 `result_confirmations`에 봉인하고 서명 이미지·이미지 SHA-256·방식·서명자 이름을 같은 행에 저장(confirmed_by=위원장 ID, confirmed_at=서명 일시). 사업당 1건, 중복 409. 서버가 서명을 대신 만들지 않으며 법적 전자서명이 아니다(로컬 시연용) |
| `GET /projects/{id}/results/confirmation` | 관리자·위원장 | 확정 기록 또는 null |
| `GET /projects/{id}/results/report` | 관리자·위원장 | 확정 스냅샷에서 매번 다시 만든 리포트. 위원별 합계·의견·증빙(intact/mismatch/missing), 스냅샷 해시 재검증, 위원장 서명 이미지·이름·일시(`confirmation`)와 서명 해시 재검증(`signature_intact`, 0007 이전 기록은 null), 문서 revision 참조(연결 전 빈 목록). 저장하지 않는다 |
| `POST /projects/{id}/results/close` | 관리자 | 확정·증빙 일치·서명 해시 일치 뒤 completed(CLOSE-01). 이후 평가기준·평가표 변경 409, 조회만 가능 |

위원장은 사업관리자가 추첨 결과의 본위원 중 1명을 `PUT /projects/{id}/committee/chair`(관리자, `apps/api/app/modules/committee/chair.py`, 0006 `committee_draws.chair_id`·`chair_history`)로 지정한다. 미지정 상태에서는 확정이 불가하고 화면에 "추첨 화면에서 지정하세요"로 안내한다. 예비위원·미추첨 후보 422, 추첨 전 409, 결과 확정·완료 뒤 변경 409, 변경 시 사유 필수(이력에 이전 위원장·사유·실행자·시각). 변경해도 평가표·점수·서명은 그대로이며 권한만 새 위원장으로 옮겨 간다(`core/permissions.chair_id`가 열을 읽는다). 테스트는 실제 지정 API를 쓴다(`test_committee_chair.py`).

테이블 `result_confirmations`: `project_id`(unique), `status`(confirmed/closed), `policy_version`, `criteria_version`, `result_sha256`, `result_snapshot`(JSON), `expected`, `submitted`, `confirmed_by/at`, `closed_by/at`. 0007(u-jing): `signature_image`(TEXT, PNG data URL), `signature_sha256`, `sign_method`(`chair-handwritten-v1`), `signer_name`. 확정 뒤 이 행을 바꾸는 API는 없고(완료 처리만 closed_by/at 기록) 리포트가 서명 해시를 재검증한다. 평가위원 개인 제출의 `attestation-v1`(문구 동의+평가표 해시, 이미지 없음)과 구분한다.

## 4. 화면 (features/results, features/evaluator)

관리자 "결과·서명·리포트": 제출 현황 칩(위원장 표시), 종합 결과(전원 제출 후), 위원장 확인 상태(미지정 안내·위원장 이름·확정 기록), 결과표 보기·인쇄(인쇄용 CSS)·JSON 내려받기, 사업 완료·보관. 관리자 "평가위원 등록·추첨"의 추첨 결과 패널에서 본위원 라디오·"평가위원장" 배지·변경 사유·"위원장 지정 저장"·지정 이력으로 위원장을 지정한다(`features/committee/CommitteePage.tsx`). 평가위원 화면(접근 링크·로그인 모두)의 제출 완료 단계에서 위원장이면 위원별 제출·서명 현황, 업체별 집계, "평가위원장 서명"(서명자 이름 자동 표시, 마우스·터치 서명 캔버스 `SignaturePad`, 지우기·미리보기, "평가결과를 확인하였습니다" 동의) 뒤 "최종 서명 및 평가결과 확정" 버튼이 보인다(`ChairSummaryPanel`, `features/results/ChairSignature.tsx`). 서명이 없거나 동의가 없으면 버튼이 열리지 않는다. 확정 뒤에는 위원장 화면·관리자 결과 화면·결과표(인쇄·JSON)에 위원장 이름·서명 이미지·서명 일시·해시가 `ChairSignatureRecord`로 표시된다. 일반 위원은 "위원장과 간사만 열람" 안내만 본다. HWP·Word 파일 생성과 미제출자 알림은 범위 밖이다.

## 5. 오류 코드

403 권한(위원장만/관리자만/사업 권한 없음) · 404 사업 없음 · 409 전원 제출 전, 기준 버전 0·불일치·변경, 해시 불일치, 이미 확정·완료, 미승인 정책, 확정 전 리포트·완료 · 422 입력 오류.

## 6. 테스트

`apps/api/tests/test_criteria.py`, `test_results.py`(공개 시점·권한·확정 조건·확인 동의·자필 서명 필수·PNG 형식·크기 검증·서명 해시 저장·변조 감지·정책 등록·순위·초안 정책 기대값), `test_report_close.py`(리포트 재현·증빙·서명 해시 재검증·서명 변조 시 완료 차단·완료 후 차단), `test_committee_chair.py`(본위원만 1명 지정, 예비·미추첨 422, 사업별 권한 분리, 미지정·일반 위원·관리자 확정 403, 전원 제출 전 409, 확인 동의 422, 봉인 뒤 평가표·위원장 변경 409, 변경 사유·이력·권한 이동·점수 유지), `tests/e2e/evaluator-flow.spec.ts`(관리자 결과 화면), `tests/e2e/chair-flow.spec.ts`(지정·변경·일반 위원 차단·위원장 확인·봉인·봉인 뒤 잠금).

## 7. 미결·협의

- 위원장 지정은 사업관리자가 추첨 결과에서 한다(2026-10-15 사용자 결정, 0006). Lex6won 검토 대기: `committee_draws` 열 확장·`committee/chair.py` 배치, 위원장 자격 조건(분야·소속)과 예비위원 승격 시 위원장 처리. 집계 정책 승인(최고·최저 제외, 가격 20점, 동점).
- 사업 상태 열의 위치(`projects.status` vs 현재의 `result_confirmations.status`)(DaeUng79·cookiesh1).
- 리포트의 문서 revision 필드명(DaeUng79). 위원별 점수 공개 범위(익명 코드 여부)(Lex6won).
