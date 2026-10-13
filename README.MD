# 심사임당: 제안평가 업무 지원 프로젝트

심사임당은 제안요청서 준비부터 평가와 결과 정리까지 돕는 팀 프로젝트입니다.
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

## 지금 저장소에서 확인할 수 있는 것

- **웹 화면**: React로 만든 화면입니다. API 서버 없이 합성 자료로 둘러보는 mock 모드를 사용할 수 있습니다. mock은 화면 시험용 가짜 자료이며 실제 문서를 저장하지 않습니다.
- **문서 처리**: HWPX를 읽고 SQLite 파일에 저장하며, 페이지별 내용과 AI 분석 화면을 제공합니다.
- **위원 관리와 평가·결과**: 담당 폴더와 설계 안내가 있습니다. 실제 동작 여부는 각 폴더의 README와 인수검증표에서 확인하세요.
- **공동 API 서버**: 현재 저장소에 서버 코드가 준비되어 있지 않습니다. 따라서 웹 화면의 mock 동작을 실제 서버 연동 완료로 생각하면 안 됩니다.

AI가 만든 요구사항이나 평가기준은 초안입니다. 사람이 원문과 비교하고 확인한 뒤 사용해야 합니다.
문서에 개인 정보나 비밀 정보가 있으면 AI 서비스에 보내도 되는지 먼저 확인하세요.

## 웹 화면 실행하기

준비물은 Git과 Node.js 22.12 이상입니다. 저장소 맨 위에서 실행합니다.

```bash
cd apps/web_cookiesh1
npm install
```

API 서버 없이 화면을 보려면 mock 모드로 실행합니다.

| 컴퓨터 환경            | 실행 명령                               |
| ---------------------- | --------------------------------------- |
| macOS·Linux·Git Bash | `VITE_USE_MOCK=1 npm run dev`         |
| Windows PowerShell     | `$env:VITE_USE_MOCK='1'; npm run dev` |

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173)을 엽니다.
화면에 **MOCK · 실제 서버 아님** 표시가 있으면 합성 자료로 실행 중입니다.
새로고침하면 mock 자료가 처음 상태로 돌아갑니다.

코드를 확인할 때는 `apps/web_cookiesh1` 폴더에서 다음 명령을 사용할 수 있습니다.

```bash
npm run typecheck
npm run build
```

현재 `package.json`에는 `npm test` 명령이 없습니다.
화면 실행 방법과 mock 자료 설명은 [웹 화면 README](apps/web_cookiesh1/README.md)를 참고하세요.

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
