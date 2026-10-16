# 코드
- **frontend/** — 화면 담당(cookiesh1). 화면 기획 폴더와 **같은 화면 ID**로 나눈다: `src/screens/<그룹>/<화면ID>-<이름>/`
  - 그룹: `entry` · `super-admin`(SA) · `dept-admin`(PM) · `evaluator`(EV)
  - 화면카드의 "코드 위치"와 이 폴더의 README가 서로를 가리킨다.
- **백엔드는 여기 두지 않는다.** 팀 기획서 13장 구조(`backend/admin|documents|evaluation`, `shared/contracts`, `fixtures/synthetic`)를 따른다.
- 프론트엔드 최종 위치(`frontend/` 또는 `apps/web_cookiesh1`)는 팀 확인 전까지 이 폴더에서 시작한다.
- 기존 앱(`apps/web_cookiesh1`)에서 옮겨 올 부품: 디자인 토큰, 문서 읽기(목차 → 쪽), 평가·제출, 위원장 결과. 가져오지 않을 것: 메모·책갈피, 5단계 홈, 업체 발표.
