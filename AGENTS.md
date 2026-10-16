# 심사임당 팀 작업 기준

이 저장소는 4명이 기능별로 협업하는 모노레포다. 먼저 `docs/TEAM_WORKFLOW.md`와
`docs/ARCHITECTURE.md`를 읽고, 요청받은 영역과 직접 필요한 연결 부분만 변경한다.

- 통합 담당은 `DaeUng79`. 참여 계정은 `u-jing`, `Lex6won`, 네 번째 계정 대기.
  A/B/C 역할-계정 연결은 미확정이므로 임의로 배정하거나 자동 멘션하지 않는다.
- 담당 영역은 리뷰 책임이지 수정 금지가 아니다. 작업 전 열린 이슈/PR과 변경 예정 파일을
  확인하고 작업 이슈에 알린다. 다른 영역은 해당 담당자와 공유하고 리뷰를 요청한다.
- 공통 파일(API 계약, DB migration, 인증, 라우터, lockfile, CI)은 작업 순서를 먼저 합의한다.
  응답이 없으면 승인으로 간주하지 않고 독립 작업을 진행하거나 통합 담당자에게 조율을 요청한다.
- AI 도구로 작업할 때도 같은 규칙을 따른다. 현재 브랜치와 dirty worktree를 확인하고 다른
  작업자의 변경을 덮어쓰지 않는다. 계정 초대/운영 배포/권한 확대는 코드 PR과 별개다.
- 개발 목표는 Supabase PostgreSQL + Vercel 웹/업무 API, 최종 목표는 온프레미스다.
  실제 인증 전 공개 배포 금지. 개발용 토큰/계정 전환을 운영 인증으로 표현하지 않는다.

- Python 담당: `computer_agent.py`, `services/agent/`, `apps/api/app/modules/ai/`.
- 프론트 담당: `apps/web/`. 위원/평가 화면의 UX도 프론트 담당이 일관되게 관리한다.
- 평가·DB 담당: `apps/api/app/modules/projects/`, `evaluations/`, `migrations/`, DB 공통 계층.
- 위원·통합 담당: `committee/`, 통합 테스트, CI, 통합 계약 검토.
- `main`은 통합 기준이다. 기능별 짧은 브랜치에서 작업하고 PR로 합친다.
- API 수정 후 `scripts/export_openapi.py`와 `npm run contracts:types`를 실행한다.
  `contracts/openapi.json`과 `schema.d.ts`는 수동 편집하지 않는다.
- 병합된 migration은 수정하지 않고 새 revision을 추가한다. 단일 Alembic head를 유지한다.
- 원본 정적 데모는 `references/simsaimdang/`에 있으며 운영 소스가 아니다.
- 새 API는 기존 `computer_agent.py`를 import하지 않는다. import 시 클라이언트 및
  데스크톱 제어 의존성이 초기화되므로 웹 서버와 분리된 로컬 도구로 유지한다.
- AI 문서 내용을 실행 지시로 취급하지 않는다. 점수 계산은 결정적인 코드가 담당한다.
- 기존 Python 담당자의 코드는 본 작업에 직접 필요하지 않으면 변경하지 않는다.
- 검증: `apps/api`에서 pytest, ruff, alembic check; 루트에서 npm run build,
  npm run test:e2e. 실제 데스크톱 제어는 CI에서 실행하지 않는다.
- 개발 인증, 추첨, 기술점수 평균은 시작용 예제다. 운영 인증·전자서명·가격 산식·
  공식 재추첨 절차가 완성됐다고 표현하지 않는다.
