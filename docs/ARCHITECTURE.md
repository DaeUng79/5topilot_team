# 구현 기준과 현재 범위

## 2026-10-09 환경 결정 (계획과 구현 구분)

공동 개발 환경은 Supabase PostgreSQL + Vercel, 최종 배포 환경은 온프레미스다.
Vercel에 웹과 짧은 FastAPI 업무 요청을 배포하고 PC 제어/로컬 모델/장시간 문서 작업은
별도 실행기에 둔다. 핵심 점수·추첨·제출 로직은 클라우드 전용 함수가 아닌 Python 모듈에 둔다.
표준 PostgreSQL/Alembic과 파일 저장/인증 어댑터를 사용해 이식성을 유지한다.
이 문단은 목표 구조다. 실제 인증, 클라우드 환경변수, pooler 설정, migration 관리 연결,
Vercel 배포, Supabase Data API 노출 제한, 온프레미스 전체 패키징은 아직 구현하지 않았다.
상세 협업·이전 계획은 `TEAM_GUIDE.html`을 참고한다.

## 디렉터리

```text
computer_agent.py                  A: 기존 로컬 컴퓨터 제어 Python (그대로 유지)
services/agent/                    A: 어댑터 연결 기준
apps/web/src/
  api/schema.d.ts                  생성된 API 타입
  features/committee/              B: 위원 UI, D가 규칙/API 제공
  features/evaluations/            B: 평가 UI, C가 규칙/API 제공
apps/api/app/
  core/                           C/D: 설정, DB, 인증 의존성
  modules/ai/                     A: 문서 AI 어댑터
  modules/projects/               C: 사업/평가 기준
  modules/evaluations/            C: 점수/제출/취합
  modules/committee/              D: 위원/추첨
apps/api/migrations/               C 검토, 각 담당자가 migration 제안
apps/api/tests/                    각 담당자 단위/통합 테스트
contracts/openapi.json             API에서 생성하는 공통 계약
tests/e2e/                         D: 브라우저 통합 시나리오
references/simsaimdang/             제공된 ZIP 원본 정적 데모
infra/                            로컬 PostgreSQL
```

웹은 `/api/v1`을 사용하고 Vite가 8000번 API로 프록시한다. 개발용 인증 토큰은 명시적
opt-in 설정에서만 허용된다. 정식 인증 연결 전에는 외부로 노출하지 않고 테스트 데이터만 사용한다.
기본 설정에서는 보호 API가 503으로 닫힌다. 프로덕션 모드/배포는 이 기반 PR의 범위에 없다.

기존 `computer_agent.py`는 일반 PC 제어 에이전트이며 문서 검색 서버가 아니다.
웹 API에서 이를 import하거나 사용자 입력을 그대로 `/run`에 전달하지 않는다.
A가 문서 기능을 별도 순수 함수/서비스로 추출한 뒤 `modules/ai`에서 연결한다.
현재 `/ai/status`는 명시적으로 `not_connected`를 반환한다.

## 테이블과 경계

- `projects`: 사업명, 부서, 기준 JSON, 업체 ID 목록. 기준/업체는 시작용 고정 템플릿이다.
- `committee_candidates`: 이름·소속·분야·활성 상태. 개인정보 연락처와 실명 인증은 후속 구현이다.
- `committee_draws`: 사업당 1건. 모집단 스냅샷, 본위원/예비위원 순서, SHA-256, 실행자·시각.
- `evaluation_sheets`: 사업+위원당 1건. 점수, 의견, draft/submitted, version, 제출 시각.

위원 추첨은 `secrets.SystemRandom().sample`로 비복원 추출한다. 본위원과 예비위원이 겹치지 않는다.
PostgreSQL의 사업 행 잠금과 project_id UNIQUE가 동시에 두 추첨이 확정되는 것을 막는다.
분야별 쿼터/기피·제척/재추첨/예비위원 승격은 아직 없다. 현재는 검토된 후보 ID를 전달한다.
현재 SHA-256은 모집단 동일성 확인용이며 추첨의 공개 재현성이나 관리자 위변조 방지를 보장하지 않는다.
공식 추첨 증빙 요구가 있으면 추후 봉인된 이벤트 로그·입회·서명·재추첨 승인 정책을 설계한다.

기술점수 입력은 0점도 유효하며 각 배점 이하, 소수 2자리까지 허용한다. 모든 업체의 모든
기술항목 작성 후 제출한다. 저장/제출은 expected_version으로 낙관적 잠금을 사용한다.
저장 또는 제출 경합이 있으면 한 요청이 409를 받고 다시 불러와야 한다.
제출 후 수정 API는 없다. 인증 주체는 선정위원 ID와 일치해야 한다.

기술 평균은 선정위원 전원 제출 후 Decimal로 계산하고 ROUND_HALF_UP으로 소수 2자리 반올림한다.
가격점수, 최고·최저 제외, 동점 순위, 위원장 확정, 법적 전자서명은 아직 구현하지 않았다.
UI의 최종 제출은 **개인 평가표 제출**이다. 사업 전체 결과 확정과 구별한다.

## API 시작 계약

실제 스키마와 오류는 `contracts/openapi.json` 및 실행 서버 `/docs`를 기준으로 한다.

| API | 담당 | 권한/핵심 동작 |
|---|---|---|
| GET/POST `/projects` | C | 관리자, 사업 조회/등록 |
| GET/POST `/committee/candidates` | D | 관리자, 후보 조회/등록 |
| GET/POST `/projects/{id}/committee/draw` | D | 관리자, 추첨 조회/확정 |
| GET/PUT `/projects/{id}/evaluations/me` | C | 선정위원, 본인 평가표 조회/저장 |
| POST `/projects/{id}/evaluations/me/submit` | C | 선정위원, 누락 검증·version 확인·잠금 |
| GET `/projects/{id}/results` | C | 관리자, 제출 현황/기술 평균 |
| GET `/ai/status` | A | 관리자, 미연결 상태 표시 |

모든 경로 앞에는 `/api/v1`이 붙는다. 401 인증 누락, 403 권한/배정 위반, 404 사업 없음,
409 중복 추첨/버전 충돌/이미 제출, 422 입력 오류, 503 인증 미설정으로 구분한다.

## 원본 데모 취급

ZIP에는 빌드된 JS/CSS/HTML만 있고 package.json/TSX 원본이 없다.
`references/simsaimdang`은 원본을 비교하는 용도이며 생성 번들을 직접 고쳐 제품을 개발하지 않는다.
`npm run demo`의 4174번 서버는 절대경로 `/assets` 및 SPA 라우트 fallback을 지원한다.
새 `apps/web`는 별도의 편집 가능한 React/TypeScript 시작 앱이다. 23개 정적 화면 전체를
이식한 상태는 아니다. B가 필요 화면부터 원본과 비교하며 확장한다.

## 운영 전 남은 범위

실제 JWT/SSO 및 기관/사업별 권한, 초대·본인인증, 개인정보 관리, 실제 서명, 문서 업로드/OCR,
RAG, 자동저장, 제척과 쿼터, 재추첨/예비위원 승격, 기준 버전 확정, 가격점수·순위 정책,
위원장 승인, 보고서/PDF, 불변 감사 로그와 백업/운영 배포는 후속 작업이다.
특히 UI의 개발 계정 전환은 보안 인증으로 대체해야 한다.
