# 기능별 코드와 계정별 개발 기록

하나의 제품 저장소에서 기능별 모듈을 함께 개발한다. 사람별 폴더 아래에 앱을 각각 복제하지 않는다. 개인별 폴더는 개발 설명·실험 결과·PR 기록에 사용한다. Git은 빈 디렉터리를 저장하지 않으므로 신규 경로에는 역할을 설명하는 README를 넣었다.

## 목표 구조

```text
5topilot_team/
├── README.MD
├── .github/                       CODEOWNERS, 이슈·PR 템플릿, 향후 CI 통합
├── apps/
│   ├── web/                       React UI (PR #1과 통합 예정)
│   │   └── src/features/          documents, projects, committee, evaluations, results
│   └── api/
│       ├── app/core/              인증·DB 연결·공통 설정 (PR #1)
│       ├── app/modules/
│       │   ├── documents/         문서 등록·파싱 작업·출처 조회
│       │   ├── ai/                근거 기반 평가 지원 에이전트·챗봇
│       │   ├── projects/          사업·제안사·기준 확정
│       │   ├── committee/         후보·제척·추첨·배정
│       │   ├── evaluations/       점수·의견·개인 제출·잠금
│       │   └── results/           집계·결과 확정·보고서
│       ├── migrations/            업무 PostgreSQL 변경 (PR #1)
│       └── tests/                 업무 API·DB 테스트 (PR #1)
├── services/document-parser/      문서 작업자·기존 Python 어댑터
├── contracts/                     OpenAPI·샘플 JSON (PR #1과 통합)
├── tests/                         현재 문서 처리 회귀 테스트
│   ├── fixtures/                  앞으로 추가할 합성 문서·예상 결과
│   └── e2e/                       전체 업무 흐름 (PR #1과 통합)
├── docs/
│   ├── members/
│   │   ├── DaeUng79/README.md
│   │   ├── cookiesh1/README.md
│   │   ├── Lex6won/README.md
│   │   └── u-jing/README.md
│   ├── modules/document-parsing.md
│   ├── team/                      역할·협업·실행계획
│   ├── contracts/                 연계 설계; 기계 명세는 contracts/
│   └── testing/                   인수 조건과 결과 기록
├── step*.py, streamlit*.py         현재 실제 코드
├── requirements.txt
└── doc/ai_criteria.md              현재 프로그램이 읽는 입력 서식
```

`src/features`, `core`, `migrations`, `apps/api/tests`, `tests/e2e`, `tests/fixtures`는 목표 또는 PR #1 경로다. 실행 구현이 추가된 것으로 해석하지 않는다. 신규 API 모듈의 README는 업무 경계를 예약한다.

| 개발 내용 | 코드 위치 | 함께 기록할 문서 |
| --- | --- | --- |
| 기존 파서 개선 | 현재 루트 `step*.py`, `streamlit*.py` | DaeUng79 개인 README, 문서 파싱 상세 설명 |
| 파서 웹 연결 | `services/document-parser/`, API `documents/` | 문서 처리 계약 |
| 웹 화면 | `apps/web/src/features/<기능>/` | 담당자 개인 README, 기능 이슈 |
| 업무 서버 로직 | `apps/api/app/modules/<기능>/` | 개인 README, API/DB 변경 내역 |
| 공통 명세 | `contracts/` | 프론트·백엔드 공동 리뷰 |
| 자동 테스트 | 루트 기존 테스트, `tests/`, 향후 `apps/api/tests/` | 명령·결과·커밋 기록 |

## 적용 순서

1. 기존 루트 코드를 보존하고 팀 소개·개인 기록·계약 초안을 추가한다.
2. PR #1의 웹/API/CI를 현재 main 기준으로 검토한다. 문서 파서와 의존성·README·.gitignore 충돌을 해결한다.
3. 업무 API가 검증된 내부 요청으로 파서 작업자를 호출한다. 파일 경로·PC 제어 명령을 브라우저가 임의 지정하지 않게 한다.
4. 별도 이전 PR에서 `__file__`, sibling import, `.env`, `output`, 기준표, subprocess 경로와 실행 명령을 함께 수정한다. 기존 CLI/Streamlit 회귀를 통과시킨다.
5. 각자 첫 PR에 개인 문서의 실제 역할·코드 경로·실행법·작은 기능 하나·테스트 결과를 등록한다.

폴더 생성, 로컬 commit, GitHub push, PR 병합, 배포 완료는 각각 다른 상태다. 수행한 단계만 기록한다.
