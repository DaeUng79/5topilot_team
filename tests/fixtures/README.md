# 합성 테스트 자료

업무 API·계산 검증에 쓰는 가짜 데이터다. 실명·연락처·실제 제안서·비밀키를 넣지 않는다. ID는 `apps/api/app/seed.py`의 개발용 ID와 맞춰 두어 로컬 seed와 함께 쓸 수 있다. 담당: u-jing(업무 데이터 정비), 검토: DaeUng79.

| 파일 | 내용 | 쓰는 검증 |
| --- | --- | --- |
| synthetic/project_demo.json | 사업 A(기준 7개·업체 3개), 사업 B(다른 사업 권한 거절용) | ProjectRead 모델, SEC-01 |
| synthetic/evaluators.json | 가상 위원 5명, 사업 A 추첨(본위원 3·예비 1), 위원장 후보(초안) | COM-03 연계, SEC-01 |
| synthetic/sheets.json | 완성 평가표 5건(만점·0점·소수·반올림 경계), 미완성 1건, 거절돼야 하는 입력 4건 | EVAL-01, EVAL-03 |
| synthetic/expected_results.json | 정책별 손 계산 기대값. `technical_mean_v1`은 현행 계산, `trimmed_mean_draft`는 RES-02 승인 전 초안 | RES-02 |

`apps/api/tests/test_contract_examples.py`가 이 자료를 현재 코드로 다시 계산해 기대값과 비교한다. 기대값은 사람이 손으로 계산한 값이며 코드 출력으로 갱신하지 않는다. 계산 과정은 각 case의 `working`에 적어 둔다.

문서(HWPX) fixture는 DaeUng79가 별도로 관리한다. 이 폴더에 원문 파일을 넣지 않는다.
