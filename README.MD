# 심사임당: 제안평가 업무 지원 프로젝트

심사임당은 제안요청서 준비부터 평가와 결과 정리까지 돕는 팀 프로젝트입니다..
4명이 각자 맡은 기능을 만들고, 마지막에는 기능들이 함께 잘 동작하는지 확인합니다.

## 어떤 일을 할 수 있나요? 

팀이 만들려는 전체 과정은 다음과 같습니다.

```text
제안요청서 등록 → 평가기준 확인 → 제안서 등록 → 평가위원 선정 → 평가·제출 → 결과 정리 → 결과 확정·보고
```

아직 모든 기능이 하나의 서버로 연결된 완성 서비스는 아닙니다.
화면에서 보이는 데모와 실제 서버에서 자료가 저장되는 것은 다를 수 있습니다.
기능마다 현재 상태와 확인 결과는 해당 폴더의 안내문과 [공동 인수검증표](docs/testing/ACCEPTANCE.md)에서 확인하세요.

## 팀원과 담당 기능

| 팀원                           | 주로 맡은 일                                             | 코드 폴더                                                          | 작업 기록                            |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| **원준석 PM · Lex6won** | 기획과 일정 조율, 평가위원 등록·선정·배정              | [위원 관리](apps/committee_Lex6won/)                                | [작업 기록](docs/Lex6won/README.md)   |
| **오대웅 · DaeUng79**   | HWPX 문서 읽기·저장, 요구사항·평가기준 분석, 문서 챗봇 | [문서 처리](apps/documents_daeung/), [챗봇](apps/ai_chatbot_daeung/) | [작업 기록](docs/DaeUng79/README.md)  |
| **현수환 · cookiesh1**  | 사업·위원·평가·결과를 보여 주는 웹 화면               | [웹 화면](apps/web_cookiesh1/)                                      | [작업 기록](docs/cookiesh1/README.md) |
| **김유진 · u-jing**     | 점수와 의견 저장, 평가 제출, 결과 정리·보고             | [평가·결과](apps/evaluations_u-jing/)                              | [작업 기록](docs/u-jing/README.md)    |

각 담당 폴더는 기능별 작업 공간입니다. 다른 팀원도 담당자와 상의해 함께 수정할 수 있습니다.

## 이 브랜치의 통합 기능 (2026-10-16)

**2026-10-17 후속 수정:** [평가일·일반 위원 로그인·위원 선정부터 최종 결과까지의 업무 흐름 복구](apps/evaluations_u-jing/COMMITTEE_FLOW_FIX_2026-10-17.md). 기본 주소는 원본 역할 선택·로그인 화면입니다.

> 확정된 원본 디자인을 보존하고 기존 버튼에 기능을 연결했습니다. [결과보고](apps/evaluations_u-jing/RESULT_REPORT_2026-10-16.md)와 [화면별 연결 현황](apps/evaluations_u-jing/DESIGN_CONNECTION_STATUS.md)을 확인하세요.

원준석·김유진 담당 기능을 Python API와 SQLite에 연결했습니다. 실제 저장되는 가상 데이터로 위원 등록·선정, 참석, 평가·서명, 집계·최종 결과를 시연합니다. 오대웅 담당 문서 처리·AI 기능은 기존 소스를 유지하며 승인 자료 연계 계약을 제공합니다.

- 실행: Windows에서 저장소의 `start_simsa_v2.cmd` → http://127.0.0.1:5190/
- [실행 및 개발 인계](apps/evaluations_u-jing/IMPLEMENTATION_V2.md)
- [검증 결과](apps/evaluations_u-jing/VERIFICATION_V2.md)
- [버튼별 담당·소스·화면 매핑](apps/evaluations_u-jing/IMPLEMENTATION_MAP_V2.html)
- 화면: `apps/web_cookiesh1/src/screens/` 23개 디렉터리. PM-01 목록/상세 포함 24개 화면 항목.
- 기능/DB: `apps/committee_Lex6won/`, `apps/evaluations_u-jing/`. SQLite 실행 파일은 Git에 넣지 않고 migration과 가상 seed를 공유합니다.

이전 React 앱의 `VITE_USE_MOCK`, typecheck/build/test 안내는 현재 실행 절차가 아닙니다. 원본 `index.html`과 `v2/index.html`을 유지하며 Python 서버에서 기능 연결을 제공합니다. 파일 열기는 정적 시안 확인용이며 실제 기능은 HTTP 주소로 접속해야 합니다.

## 문서 처리 도구 실행하기

저장소 맨 위 폴더에서 필요한 Python 프로그램을 설치하고 문서 확인 화면을 실행합니다.

```bash
.venv/bin/python -m pip install -r apps/documents_daeung/requirements.txt
.venv/bin/python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
```

화면의 사이드바에서 HWPX를 등록하고 문서를 고릅니다. 문서는 50MB 이하여야 합니다.
페이지 내용, 제안 요구사항, 정성적 평가기준, 문서 챗봇은 화면의 각 탭에서 확인합니다.
더 자세한 사용법은 [문서 처리 README](apps/documents_daeung/README_documents.MD)를 읽어 주세요.

## 일을 나누어 저장하는 방법

| 무엇을 저장하나요?            | 어디에 저장하나요?             |
| ----------------------------- | ------------------------------ |
| 프로그램 코드와 기능별 테스트 | `apps/` 아래의 담당 폴더     |
| 실행·설정 방법               | 해당 앱 폴더의 README          |
| 개인별 계획과 작업·검증 기록 | `docs/<GitHub 계정>/`        |
| 팀 전체가 확인할 완료 조건    | `docs/testing/ACCEPTANCE.md` |
| 기획서·발표 자료 원본        | `참고자료/`                  |

문서 구조나 API처럼 여러 기능에 영향을 주는 내용을 바꾸려면 관련 담당자와 먼저 상의합니다.

## 함께 개발하기

1. GitHub에서 [팀 저장소](https://github.com/DaeUng79/5topilot_team)를 내 계정으로 Fork(복사)합니다.
2. 작업을 시작하기 전에 팀 저장소의 최신 내용을 가져와 새 작업 브랜치를 만듭니다.
3. 담당 폴더에서 작업하고 관련 테스트를 실행합니다.
4. 개별 폴더에 개인의 README에 작업 기록을 남기고 팀 저장소에 Pull Request(PR, 변경 검토 요청)를 보냅니다.
5. 다른 팀원의 검토를 받은 뒤 병합합니다.

```bash
git clone https://github.com/<내 GitHub 계정>/5topilot_team.git
cd 5topilot_team
git remote add upstream https://github.com/DaeUng79/5topilot_team.git
git fetch upstream
git switch -c feat/<작업 이름> upstream/main
```

코드가 내 컴퓨터에서 동작함, PR을 보냄, 팀 저장소에 병합됨, 전체 인수검증을 통과함은 서로 다른 상태입니다.
각 상태와 확인 결과를 [공동 인수검증표](docs/testing/ACCEPTANCE.md)에 맞게 기록합니다.

## 꼭 지켜 주세요

- `.env` 파일, API 키, DB 비밀번호, 실제 제안서, 개인 정보는 GitHub에 올리지 않습니다.
- 테스트에는 실제 사람이나 회사 자료 대신 공개된 자료 또는 사용 허가를 받은 자료를 씁니다.
- AI 결과는 초안일 수 있으니 원문을 확인합니다.

팀 저장소: [https://github.com/DaeUng79/5topilot_team](https://github.com/DaeUng79/5topilot_team) ·
[목표 화면 예시](https://simsa-ai.lovable.app/admin/projects/p1?tab=progress)

## 이전 기반 문서

`docs/QUICKSTART.md`, `docs/ARCHITECTURE.md`에는 삭제된 `apps/api`, `apps/web` 기반 안내가 남아 있을 수 있습니다. 현재 통합 실행은 위의 2026-10-16 인계 문서를 기준으로 합니다.
