# 웹 시작 앱 이관·mock 모드 작업 기록

기준일: 2026-10-11 · [개인 안내](README.md) · [웹 개발 공간](../../apps/web_cookiesh1/) · [PR #3](https://github.com/DaeUng79/5topilot_team/pull/3)

## 요약

미병합 PR #1(Lex6won, `feat/team-development-foundation` @ `658748e`)에 있던 React 웹 시작 앱을 현재 저장소 구조의 담당 폴더 `apps/web_cookiesh1/`로 옮겼습니다. API 서버(`apps/api/`)는 아직 main에 없기 때문에, 서버 없이 화면을 확인할 수 있는 mock 모드를 추가했습니다. PR #3으로 main에 병합되었습니다(`cf55e3e`).

화면 코드는 PR #1의 내용을 그대로 유지했습니다. 이번 작업에서 바꾼 코드는 mock 연결(`client.ts`), 상단 모드 표시와 오류 안내 문구(`App.tsx`), mock 구현(`mock.ts`)뿐입니다.

## 왜 이렇게 했나

- PR #1은 웹 코드를 `apps/web/`에 두었지만, 이후 main은 담당자별 폴더(`apps/web_cookiesh1/` 등)로 개편되어 PR #1이 main과 충돌하는 상태입니다.
- 웹 화면 작업을 PR #1 병합까지 기다리지 않고 시작하기 위해 웹 부분만 새 구조로 옮겼습니다.
- 루트 `package.json`·workspaces는 만들지 않았습니다. PR #1의 루트 설정과 충돌하지 않도록 웹 앱은 자기 폴더에서 독립적으로 설치·실행합니다.

## 파일 구조

| 파일 | 줄 수 | 역할 | 출처 |
| --- | --- | --- | --- |
| `package.json`, `package-lock.json` | 23 / 1285 | React 19.3, Vite 8, TypeScript 7, openapi-fetch | PR #1 (lock은 이번에 생성) |
| `vite.config.ts` | 11 | 개발 서버 `127.0.0.1:5173`, `/api` → `127.0.0.1:8000` 프록시 | PR #1 |
| `src/App.tsx` | 75 | 공통 레이아웃(헤더·사이드 메뉴), 사업 선택·등록, 화면 전환 | PR #1 + 모드 표시 수정 |
| `src/features/committee/CommitteePage.tsx` | 85 | 평가위원 후보 등록, 모집단 선택, 추첨 확정·기록 표시 | PR #1 |
| `src/features/evaluations/EvaluationPage.tsx` | 114 | 위원별 평가표 작성·저장·제출, 기술점수 취합 | PR #1 |
| `src/api/client.ts` | 27 | API 클라이언트, 개발용 인증 헤더, 오류 변환(`unwrap`) | PR #1 + mock 연결 |
| `src/api/schema.d.ts` | 714 | API 명세에서 생성한 타입 | PR #1 (자동 생성) |
| `src/api/mock.ts` | 112 | 메모리 mock API | 이번 작업 |
| `src/styles.css`, `main.tsx`, `index.html` 등 | - | 스타일·진입점 | PR #1 |

## 화면별 기능과 API

| 화면 | 사용자 동작 | 호출 API |
| --- | --- | --- |
| 사업 관리 | 사업 목록 조회·선택, 새 사업 등록 | `GET /api/v1/projects`, `POST /api/v1/projects` |
| 평가위원 등록·추첨 | 후보 등록, 활성 후보 선택, 본위원·예비위원 수 설정, 검토 확인 후 추첨 확정, 모집단 해시·실행 시각 확인 | `GET/POST /api/v1/committee/candidates`, `GET/POST /api/v1/projects/{id}/committee/draw` |
| 평가·제출·취합 | 개발용 위원 전환, 항목×제안사 점수 입력, 의견 작성, 명시적 저장, 확인 체크 후 최종 제출(잠금), 제출 현황·평균 조회 | `GET/PUT /api/v1/projects/{id}/evaluations/me`, `POST .../evaluations/me/submit`, `GET /api/v1/projects/{id}/results` |

공통 동작: 요청 실패 시 화면 상단에 오류를 표시하고(`role="alert"`), 평가표는 "서버 내용 다시 불러오기"로 서버 상태를 재조회합니다. 저장 시 `expected_version`을 보내 동시 편집 충돌을 서버가 판단합니다.

## mock 모드

`VITE_USE_MOCK=1`로 실행하면 `client.ts`가 실제 네트워크 대신 `mock.ts`의 `mockFetch`를 사용합니다. 응답마다 200ms 지연을 두어 로딩 상태를 볼 수 있습니다. 상단 배지가 "mock 데이터 모드"로 바뀝니다.

| 항목 | 내용 |
| --- | --- |
| 합성 데이터 | 사업 1개, 평가항목 7개(합계 80점), 제안사 3개(A·B·C), 후보 5명. 실제 인물·기관·제안서 아님 |
| 재현 규칙 | 사업당 추첨 1회(재추첨 409), 배정된 본위원만 평가표 접근(그 외 403), 버전 불일치 저장 409, 제출 후 수정 409, 본위원 전원 제출 후에만 평균 공개 |
| 한계 | 메모리 저장이라 새로고침하면 초기화. 입력값 범위 검증·권한 정책은 실제 API와 다를 수 있음. 평균 산식은 임시값 |

mock 성공은 실제 서버 통합 성공과 구분해서 기록합니다.

## 실행 방법

`apps/web_cookiesh1/`에서 실행합니다. Node 22.12 이상.

```bash
npm install
VITE_USE_MOCK=1 npm run dev   # PowerShell: $env:VITE_USE_MOCK='1'; npm run dev
npm run dev                   # 실제 API(127.0.0.1:8000)가 있을 때
npm run typecheck
npm run build
```

## 검증 결과

| 검증 | 결과 | 해석 |
| --- | --- | --- |
| 타입 검사 `npm run typecheck` | 통과 | 로컬 Windows, Node 24.13 |
| 프로덕션 빌드 `npm run build` | 통과 (JS 242 kB, gzip 76 kB) | |
| 개발 서버 응답 | mock 모드에서 `GET /` 200 | 화면 렌더링 확인은 아님 |
| mock 흐름 스크립트 | 추첨 → 재추첨 409 → 예비위원 403 → 저장 → 구버전 저장 409 → 제출 → 제출 후 수정 409 → 전원 제출 후 평균 공개, 모두 기대대로 | `mockFetch`를 Node에서 직접 호출. 화면 클릭 검증 아님 |
| 브라우저 화면 확인 | 미실행 | 자동화 브라우저 연결 불가 |
| 실제 API 연결 | 미실행 | `apps/api/`가 main에 없음 |

## 목표 대비 남은 작업

| 구분 | 현재 | 필요 |
| --- | --- | --- |
| 6단계 화면 | 사업·위원·평가 3개 | 메인, 문서(제안요청서·제안서), 결과 화면 추가 |
| 화면 상태 | 오류 메시지 표시, 빈 목록 일부 | 로딩·빈 목록·오류·권한·저장 결과를 구분 표시(PROG-01, EVAL-04) |
| 재접속 | 현재 화면·선택 사업이 새로고침 시 초기화 | URL 기반 화면 이동으로 새로고침 후 상태 유지 |
| 인증 | 개발용 헤더(`local-admin`, `local-evaluator:<id>`) | 실제 인증·역할은 API 쪽 결정 후 연결 |
| API 연결 | mock | PR #1의 `apps/api/` 병합 후 실제 서버로 검증 |

## 협의가 필요한 내용

- **DaeUng79·Lex6won**: PR #1을 병합할 때 `apps/web/`은 제외하고, 루트 `package.json`의 workspaces와 `contracts:types` 출력 경로를 `apps/web_cookiesh1`로 맞춰야 합니다.
- **각 기능 담당**: 문서(DaeUng79), 위원(Lex6won), 평가·결과(u-jing) 화면의 입력·출력·오류 응답 형식을 API 명세 기준으로 합의해야 합니다. 명세가 바뀌면 `schema.d.ts`를 다시 생성합니다.
