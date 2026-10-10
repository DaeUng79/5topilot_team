# API 계약 예제

`contracts/openapi.json`(생성물)이 스키마의 기준이고, 이 폴더는 그 스키마를 따르는 **읽기용 예제**다. 화면 mock과 서버 응답이 같은 모양인지 확인할 때 쓴다. 담당: u-jing(평가·결과), 공동 검토: cookiesh1(화면 소비자), DaeUng79·Lex6won.

## 규칙

- 파일명은 `<대상>.<상황>.<request|response>.json`. 상황은 `ok`(정상), `empty`(빈 결과), `forbidden`(권한 거절), `review`(검토 필요), `conflict`(충돌), `invalid`·`invalid-*`(입력 오류), `unavailable`(연결 전), `collecting`(수집 중).
- `index.json`이 각 파일의 스키마 이름·HTTP 상태·요청/응답 구분·operationId를 적는다. `apps/api/tests/test_contract_examples.py`가 index를 읽어 현재 pydantic 모델과 `openapi.json`으로 검증한다.
- `draft: true`인 예제는 아직 구현되지 않은 API의 초안이다. `stage`는 구현 예정 단계다. 구현 PR에서 draft를 지우고 operationId를 연결하면 테스트가 실제 모델로 검증한다.
- `must_not_contain`은 응답에 절대 들어가면 안 되는 키다. 예: 본인확인 응답에 인증번호.
- 값은 전부 합성 데이터다. 실명·연락처·실제 제안서 내용·토큰 값을 넣지 않는다.
- `openapi.json`과 `apps/web/src/api/schema.d.ts`는 수작업으로 고치지 않는다. API 변경 후 `scripts/export_openapi.py`와 `npm run contracts:types`로 다시 만든다.

## 폴더

| 폴더 | 대상 API | 상태 |
| --- | --- | --- |
| evaluations/ | 평가표 조회·저장·제출 (`/projects/{id}/evaluations/me`) | PR #1 현행 |
| results/ | 취합 조회 (`/projects/{id}/results`), 결과 확인·리포트 | 취합은 현행, 확인·리포트는 draft |
| evaluator-access/ | 평가위원 본인확인·세션 발급 | draft (2단계) |
| criteria/ | 평가기준 확정 기록 | draft (2단계, DaeUng79·Lex6won 협의) |
