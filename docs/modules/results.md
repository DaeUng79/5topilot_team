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
| `technical_mean_v1` | 예(현행) | PR #1 계산 그대로. 선정위원 전원 업체별 기술점수 합계의 단순평균, Decimal·ROUND_HALF_UP·소수 둘째 자리 |
| `trimmed_mean_draft` | 아니오 | 디자인 캔버스의 최고·최저 1건 제외 평균(위원 3명 이상). 승인 전이라 호출하면 409 |

순위는 기술 평균 내림차순, 동점은 같은 순위(1, 1, 3). 가격점수·최종 순위 산식·동점 규칙은 승인 전이며 화면에 "정책 승인 전"으로 표시한다. 손 계산 기대값은 `tests/fixtures/synthetic/expected_results.json`.

## 3. 취합·확정·리포트·완료 (results/service.py, report.py, state.py)

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /projects/{id}/results/summary` | 관리자·위원장 | 위원별 제출·서명 상태, 상태(collecting/technical_complete/confirmed/closed). 평균·순위는 **전원 제출 뒤에만**(RES-01). `confirmable`, `chair_id`, 안내문 |
| `POST /projects/{id}/results/confirm` | 위원장 | 전원 제출, 모든 평가표의 기준 버전이 같고 1 이상이며 현재 확정 버전과 일치, 평가표 해시 재검증 통과 → 스냅샷(정책·기준·평균·순위·평가표 해시)과 SHA-256을 `result_confirmations`에 봉인. 사업당 1건, 중복 409 |
| `GET /projects/{id}/results/confirmation` | 관리자·위원장 | 확정 기록 또는 null |
| `GET /projects/{id}/results/report` | 관리자·위원장 | 확정 스냅샷에서 매번 다시 만든 리포트. 위원별 합계·의견·증빙(intact/mismatch/missing), 스냅샷 해시 재검증, 문서 revision 참조(연결 전 빈 목록). 저장하지 않는다 |
| `POST /projects/{id}/results/close` | 관리자 | 확정·증빙 일치 뒤 completed(CLOSE-01). 이후 평가기준·평가표 변경 409, 조회만 가능 |

위원장 미지정 상태에서는 확정이 불가하고 화면에 "위원 기능(COM-03) 연계 대기"로 표시한다. 테스트는 `core.permissions.chair_id`를 monkeypatch한다.

테이블 `result_confirmations`: `project_id`(unique), `status`(confirmed/closed), `policy_version`, `criteria_version`, `result_sha256`, `result_snapshot`(JSON), `expected`, `submitted`, `confirmed_by/at`, `closed_by/at`.

## 4. 화면 (features/results, features/evaluator)

관리자 "결과·서명·리포트": 제출 현황 칩, 종합 결과(전원 제출 후), 위원장 확인 상태, 결과표 보기·인쇄(인쇄용 CSS)·JSON 내려받기, 사업 완료·보관. 평가위원 화면의 제출 완료 단계에서 위원장이면 결과 요약과 "결과 확인·봉인" 버튼이 보인다. HWP·Word 파일 생성과 미제출자 알림은 범위 밖이다.

## 5. 오류 코드

403 권한(위원장만/관리자만/사업 권한 없음) · 404 사업 없음 · 409 전원 제출 전, 기준 버전 0·불일치·변경, 해시 불일치, 이미 확정·완료, 미승인 정책, 확정 전 리포트·완료 · 422 입력 오류.

## 6. 테스트

`apps/api/tests/test_criteria.py`, `test_results.py`(공개 시점·권한·확정 조건·변조 감지·정책 등록·순위·초안 정책 기대값), `test_report_close.py`(리포트 재현·증빙·완료·완료 후 차단), `tests/e2e/evaluator-flow.spec.ts`(관리자 결과 화면).

## 7. 미결·협의

- 위원장 지정 출처와 결과 확정 주체(Lex6won, COM-03). 집계 정책 승인(최고·최저 제외, 가격 20점, 동점).
- 사업 상태 열의 위치(`projects.status` vs 현재의 `result_confirmations.status`)(DaeUng79·cookiesh1).
- 리포트의 문서 revision 필드명(DaeUng79). 위원별 점수 공개 범위(익명 코드 여부)(Lex6won).
