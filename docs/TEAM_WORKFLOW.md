# 4인 팀 개발 방법

브라우저용 통합 안내: [TEAM_GUIDE.html](TEAM_GUIDE.html). 이 파일은 내려받아 브라우저로 연다.
통합 담당은 저장소 소유자 `DaeUng79`로 정한다. 알려진 참여 계정은 `u-jing`, `Lex6won`이며
네 번째 계정과 A/B/C 기능 역할 매핑은 미정이다. 역할을 추측해서 CODEOWNERS에 넣지 않는다.

## 작업 알림과 중복 방지 (모든 사람과 AI 도구에 적용)

1. 코딩 전 열린 이슈/PR을 검색하고 기능 하나당 작업 이슈 하나를 만든다.
2. 작업자, 기능, 정확한 변경 예정 파일, 브랜치, 작업 시간(KST), API/DB 영향, 선행 PR,
   관련 담당자와 완료 기준을 적는다. 대화방을 쓰더라도 결정은 이슈에 남긴다.
3. 주 담당 영역의 독립 파일은 알림 후 진행한다. 다른 영역은 미리 알리고 리뷰를 요청한다.
   공통 파일 또는 같은 파일의 동시 작업은 상대방과 순서를 합의한 뒤 수정한다.
   응답이 없다고 동의로 간주하지 않는다. DaeUng79가 조율하고 그동안 독립 작업을 한다.
4. 작업 범위가 늘어날 때, API/DB 계약을 바꿀 때, 막힐 때, 리뷰 요청 때, 병합/배포 때 알린다.
   하루가 넘어가면 진행/다음 작업/막힘/변경 파일을 한 번 갱신한다.
5. 한 파일이 겹치면 선행 PR부터 병합하고 후행 브랜치가 main을 받아 재검증한다.
   계약부터 작은 PR로 합치거나 파일을 분리할 수 있다. Git 충돌이 없어도 의미 충돌을 테스트한다.
6. 한 브랜치는 주 작업자 한 명이 관리한다. 다른 사람이 그 브랜치에 직접 push하려면 먼저 합의한다.
   다른 작업자의 변경 덮어쓰기, 공용 계정, 공유 브랜치 force push, 공동 DB 초기화는 금지한다.

알림 양식: `[시작/변경/막힘/리뷰/병합] #이슈 | @작업자 | 브랜치 | 파일 | API·DB 영향 |
선행 PR | 다음 공유 시각(KST) | @관련담당자`.
GitHub 이슈/PR의 멘션과 구독 알림을 이용한다. 별도 채팅 봇이나 자동 파일 잠금은 설치하지 않았다.

## 권장 방식

하나의 저장소 + 하나의 웹 앱 + 모듈별 FastAPI + 하나의 PostgreSQL을 사용한다.
4명 규모에서는 서비스별 배포·인증·DB를 따로 운영하기보다 기능 모듈을 분리하는 편이
통합 부담이 작다. 개인 개발은 로컬 PostgreSQL을 권장하고 SQLite는 빠른 시작용으로만 사용한다.
공동 개발·검증은 Supabase PostgreSQL + Vercel, 최종 납품은 온프레미스다.
프론트와 업무 API는 Vercel, 기존 PC 제어/로컬 AI/장시간 작업은 별도 실행기로 분리한다.
클라우드 배포 설정과 실제 인증은 아직 구현하지 않았다.

`main`에 매일 작은 PR을 병합한다. 장기 개인 브랜치 4개에서 개발을 끝낸 후 합치지 않는다.
기능 브랜치는 가능하면 1~2일 내 리뷰 가능한 크기로 유지한다. 별도 develop 브랜치는 두지 않는다.

## 역할과 소유권

| 담당 | 주 수정 경로 | 책임 | 다른 담당자에게 제공할 것 |
|---|---|---|---|
| A: 핵심 Python | `computer_agent.py`, `services/agent`, `apps/api/app/modules/ai` | 기존 Python 발전, 문서 AI 연결 | 상태/결과/오류 스키마, 실제 연결 가능한 API |
| B: 프론트엔드 | `apps/web` | 전체 UI, 공통 컴포넌트, 접근성, API 연결 | 위원 화면과 평가 화면 모두 일관된 UI |
| C: 평가·DB | `apps/api/app/modules/projects`, `evaluations`, `migrations`, `core/db.py` | 사업·기준·점수·제출·결과, 스키마/마이그레이션 관리 | 평가 API, 버전 충돌 규칙, 데이터 무결성 |
| D: DaeUng79 (통합 담당) | `apps/api/app/modules/committee`, `tests`, `.github`, 통합 검토 | 위원 등록·자격/제척·추첨·배정, 전 구간 검증 | 선정위원 ID 목록, 추첨 기록, E2E 기준 |

D는 위원 기능의 업무 규칙과 API를 개발한다. 위원 화면도 B가 담당하되, 빠른 실험을 위해
D가 화면을 수정할 수 있다. 이때 B와 변경 파일을 사전에 공유하고 B의 리뷰를 받는다.
C는 모든 테이블을 직접 코딩하는 사람이 아니라 DB 변경의 일관성을 검토하는 사람이다.
D도 위원 모델과 migration 초안을 작성하고 C의 리뷰로 합친다.

공통 인증, main.py의 라우터 연결, 공통 의존성, API 계약은 C/D가 조율한다.
모든 사소한 PR에 4명 승인을 요구하지 않고 작성자 외 1명 리뷰를 기본으로 한다.
API 변경에는 소비자, DB 변경에는 C, 전체 흐름 변경에는 D가 검토에 참여한다.

## 저장소 소유자가 최초 한 번 할 일

1. 저장소 Settings → Collaborators에서 소유자 외 `u-jing`, `Lex6won`을 초대하고 수락을 확인한다.
   네 번째 계정은 도착 후 초대한다. 소유자 자신을 초대할 필요는 없다.
2. `.github/CODEOWNERS`의 주석 예시를 실제 GitHub 아이디로 바꾼다.
   지금 유효한 기본 리뷰어는 저장소 소유자 `@DaeUng79`다. 경로별 자동 배정은 아직 미설정이다.
3. main에 Ruleset/branch protection을 설정한다: PR 필수, 승인 1개, 최신 변경 시 승인 재검토,
   대화 해결 필수, 상태 검사 `verify` 필수, force push/deletion 차단, 가능하면 관리자 우회도 차단.
4. `team-ci`가 한 번 실행된 뒤 실제 표시되는 체크 이름 `verify`를 선택한다.
5. Squash merge와 병합 후 브랜치 자동 삭제를 설정한다. GitHub Project는 담당자/상태/영역만 먼저 쓴다.

개인 저장소를 유지할 때 `docs/github-rulesets/`의 두 JSON을 Rulesets → Import로 가져올 수 있다.
두 파일은 안전하게 Disabled 상태이며, 실제 체크와 리뷰어 확인 후 소유자가 Active로 바꾼다.
`main-quality`는 PR/타인 승인/검증을 강제하고 예외를 두지 않는다. `main-integrator`는 main
업데이트를 제한하고 관리자 역할에 PR을 통한 예외만 허용한다. 현재 개인 저장소의 소유자는
DaeUng79이므로 통합 담당과 일치한다. 이 구조에서 승인·CI를 우회하는 권한은 부여하지 않는다.
관리자 자신은 설정을 바꿀 수 있으므로 관리자 권한 남용까지 방지하는 절대적인 보안 경계는 아니다.
Organization으로 이전하면 관리자 역할 대신 통합 담당 팀을 지정하는 것으로 재검토한다.
현재 CODEOWNERS는 DaeUng79 한 명이므로 code owner 승인 강제는 켜지 않는다.
DaeUng79 자신의 PR은 쓰기 권한을 수락한 다른 팀원이 승인한다. A/B/C 계정이 정해진 후 경로별
소유자를 등록한다. 권한/규칙의 실제 적용 여부는 GitHub 설정에서 별도로 확인해야 한다.

CODEOWNERS 파일만 추가해도 브랜치 보호가 켜지는 것은 아니다. 위 설정은 관리자 권한이 필요하다.
한 줄에 여러 소유자를 쓰면 모두의 승인을 강제하는 것이 아니라 그중 한 명으로 충족된다.

## 팀원 매일 작업 순서

권한 초대를 수락한 후 처음 한 번:

```bash
git clone https://github.com/DaeUng79/5topilot_team.git
cd 5topilot_team
```

새 작업마다 (작업 중 변경을 먼저 커밋한 상태에서):

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/committee-exclusions
# 개발 및 담당 테스트
git add apps/api/app/modules/committee apps/api/tests
git commit -m "feat(committee): add conflict exclusion rules"
git push -u origin feat/committee-exclusions
gh pr create --base main
```

브랜치 예시: `feat/ai-document-search`, `feat/web-proposal-viewer`,
`feat/evaluation-submission`, `feat/committee-draw`. 사람 이름보다 기능명을 쓴다.
`git add .` 대신 변경 파일을 확인해 지정한다. DB/원문/키/환경 파일은 커밋하지 않는다.

개발 중 main이 갱신되면 자신의 작업을 커밋하고 다음을 실행한다:

```bash
git fetch origin
git merge origin/main
# 충돌 해결, 테스트, commit, push
```

팀의 기본은 merge 업데이트다. 이미 공유한 브랜치를 rebase하고 force push하지 않는다.
동일 파일에서 충돌하면 두 기능의 의도를 확인해 합치고 한쪽 전체를 무조건 덮어쓰지 않는다.

## API를 먼저 합의하는 순서

1. 이슈에 요청/응답 예시와 실패 조건을 적는다. 예: 후보 부족 → 422, 이미 추첨 → 409.
2. 해당 담당자가 Pydantic 스키마/라우터를 추가한다. 미완성 기능은 명시적으로 미연결을 반환한다.
3. `apps/api`에서 `python ../../scripts/export_openapi.py` 실행.
4. 루트에서 `npm run contracts:types` 실행. 프론트는 `src/api/client.ts`로 호출한다.
5. 명세/타입 변경과 소비자 변경을 같은 PR 또는 의존성이 명확한 작은 PR로 묶는다.
6. 응답 필드 제거/이름 변경은 소비자와 함께 변경하고 통합 테스트를 통과시킨다.

CI가 생성 결과 차이를 검사하므로 백엔드와 프론트 타입이 어긋난 PR은 실패한다.
다만 타입 검사만으로 업무 규칙은 검증되지 않으므로 E2E도 필요하다.

## DB 공동 개발

- 프론트는 업무 API를 사용하고 핵심 쓰기 규칙을 우회하여 DB를 직접 변경하지 않는다.
- 개인 DB와 공동 Supabase 통합 DB를 분리한다. PR 미리보기마다 공동 DB의 migration/seed를
  자동 실행하지 않는다. 별도 DB/스키마 또는 승인된 공유 테스트 데이터 범위를 사용한다.
- 공동 DB 변경은 C 검토 + D 병합/적용 순서 조율 후 지정 실행자가 한 번만 적용한다.
  실행자·revision·시각·결과를 이슈/배포 기록에 남긴다. 대시보드 수동 DDL은 기본 금지다.
- 런타임 transaction pooler, 마이그레이션 관리 연결을 분리하고 TLS/연결 수/prepared statement를
  조정해야 한다. 현재 코드는 이 클라우드 연결 구성을 아직 구현하지 않았다.
- Supabase 전용 인증/저장 기능을 채택하면 온프레미스 이전 계획도 함께 정의한다.

- 테이블 소유권: projects/evaluation_sheets → C, committee_candidates/committee_draws → D.
- 문서/AI 작업 테이블은 A가 설계하고 C가 관계·인덱스·보존 정책을 검토한다.
- 다른 모듈의 테이블을 임의 수정하지 말고 서비스 함수/API를 통해 연결한다.
- 병합된 migration은 불변. 새 변경은 `alembic revision --autogenerate -m "..."`으로 만들고 SQL을 검토한다.
- PR 전 main을 반영하고 `alembic heads`가 하나인지 확인한다. 다른 PR 때문에 head가 갈라지면
  C가 순서를 정해 아직 미병합/미배포인 revision의 down_revision을 조정하거나 merge revision을 만든다.
- 직접 운영 DB를 수정하거나 공유 개발 DB를 초기화하지 않는다. 개인 DB는 각자 분리한다.
- SQLite는 빠른 개인 개발용이다. 동시성/마이그레이션 최종 판단은 PostgreSQL CI를 기준으로 한다.

## 본인의 통합 검증 루틴

매일 오전 최신 main을 받고 `npm ci`, API lock 설치, migration을 적용한다.
오후에는 아래 시나리오를 확인하고 작은 PR을 바로 통합한다.

1. 후보 등록 → 허용 후보 선택 → 본위원/예비위원 추첨.
2. 예비위원·다른 사업 위원·관리자는 해당 평가표에 점수를 쓸 수 없어야 한다.
3. 선정위원은 임시저장 후 새로고침해도 점수가 유지되어야 한다.
4. 누락/범위 초과/중복 항목과 오래된 version은 거절되어야 한다.
5. 제출 후 점수가 잠겨야 하고 재제출·동시 저장이 우회할 수 없어야 한다.
6. 전원 제출 후 기술 평균이 정확해야 한다. 미제출 상태에서는 평균이 공개되지 않아야 한다.
7. 마지막으로 PDF/서명/가격점수/위원장 확정이 추가되면 동일 흐름 끝에 붙인다.

현재 `pytest`와 `tests/e2e/team-flow.spec.ts`가 1~6의 시작 버전을 검증한다.
CI는 SQLite, PostgreSQL, DB 모델 불일치, API 계약, 프론트 빌드, 브라우저 전체 흐름을 확인한다.

## 각자의 첫 작업

| 담당 | 첫 PR | 완료 기준 |
|---|---|---|
| A | 문서 처리 어댑터의 입력/출력 계약 | 문서 ID·페이지·인용문·실패 상태를 정의하고 실제 응답 테스트 |
| B | 원본 데모의 레이아웃/화면을 React 소스로 재구현 | 관리자와 평가위원 공통 컴포넌트, 실제 API 연결, 반응형 검증 |
| C | 사업별 평가기준·제안사 관리 | 고정 7항목/3사를 DB에서 편집, 추첨/평가 시작 후 기준 버전 잠금 |
| D | 제척·자격·분야별 할당 | 제외 사유·검토자·시각 기록, 제외자가 추첨되지 않음, 부적격 후보 테스트 |

다음 공동 이정표는 실제 인증·프로젝트 권한, 가격 산식 합의, 위원장 승인,
서명/보고서, 문서 AI 순으로 잡는다. 기간은 팀의 주당 가용시간을 확인한 뒤 정한다.

## 권한이 없는 상태에서 기여하기

현재 작업 계정이 `Lex6won`, 대상 저장소가 `DaeUng79/5topilot_team`이라면
쓰기 권한이 없을 때 fork에서 기능 브랜치를 push하고 원본 main으로 PR을 보낸다.
이 경우 원본은 upstream, 본인 fork는 origin으로 두는 것이 편하다.
초기 협업 기반 PR은 이 흐름으로 검토할 수 있다. 원본 소유자가 병합해야 main에 반영된다.

참고: [FastAPI 모듈 구조](https://fastapi.tiangolo.com/tutorial/bigger-applications/),
[GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners),
[브랜치 보호](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches).
