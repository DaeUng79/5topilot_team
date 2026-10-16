> 이 안내는 저장소(프로젝트) 맨 위 폴더에서 명령을 실행한다고 가정합니다.

# HWPX 문서 읽기와 분석

이 프로그램은 HWPX 문서를 읽어 글·표·그림·페이지 정보를 정리합니다.
정리한 자료는 SQLite라는 파일형 데이터베이스에 저장하고, 화면에서 확인할 수 있습니다.
AI를 사용하면 제안요청서의 요구사항이나 평가기준을 정리하고 문서에 질문할 수도 있습니다.

현재 문서 기능은 **Streamlit 문서 확인 화면**과 **사업 관리 웹 화면**에서 사용합니다. Streamlit의 기본 DB는 `documents.sqlite3`이고, 웹의 제안요청서 등록·요구사항 추출 DB는 `documents_parse.sqlite3`입니다.

## 실행하기

처음 실행하거나 필요한 프로그램이 바뀌었을 때 의존성을 설치합니다.

```sh
.venv/bin/python -m pip install -r apps/documents_daeung/requirements.txt
```

아래 명령으로 문서 페이지를 엽니다.

```sh
.venv/bin/python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
```

화면 왼쪽 사이드바에서 **HWPX 파일**을 선택하고 **파싱 및 저장**을 누릅니다.
HWPX는 한글 문서 파일 형식입니다. 화면에서 등록할 수 있는 파일은 50MB 이하의 HWPX입니다.
처음 등록한 뒤에는 저장된 문서를 골라 내용을 확인합니다.

## 사업 관리 웹 화면 연동

관리자 화면의 **사업 관리 → 사업 상세 → 제안요청서 등록**에서 실제 HWPX 파일을 올리고, 추출된 제안 요구사항을 같은 화면 아래에서 확인할 수 있습니다. 저장소 루트에서 문서 API를 실행한 뒤, 별도 터미널에서 웹 앱을 실행합니다.

```sh
# 터미널 1: 저장소 루트
.venv/bin/python apps/documents_daeung/step0_documents_api.py

# 터미널 2: 저장소 루트에서 시작
cd apps/web_cookiesh1
npm install  # 처음 실행할 때만
VITE_USE_MOCK=1 VITE_RFP_API=1 npm run dev
```

브라우저 주소는 `http://127.0.0.1:5173`이고, 시연 관리자 계정은 `admin / admin`입니다. 문서 API는 `127.0.0.1:8001`에서 실행되며 Vite가 `/document-api` 요청을 전달합니다. 이 실행 방식에서 **사업·로그인은 시연 데이터**이고 **제안요청서 파일·파싱 결과·제안 요구사항은 실제 SQLite 데이터**입니다.

### 등록부터 화면 표시까지

| 순서 | 처리 | 저장·화면 결과 |
| --- | --- | --- |
| 1. 업로드 | 사용자가 50MB 이하의 HWPX 파일을 선택합니다. 웹 화면이 파일 본문, 사업 ID·사업명을 `POST /document-api/projects/:id/rfp`에 전송합니다. | 같은 사업에서 다시 올리면 등록 버전이 증가합니다. |
| 2. 파싱 | `step1_hwpx_parse_to_JSON.py`의 `parse_hwpx()`가 문단·표·그림·페이지를 읽습니다. | 화면에 쪽 수, 블록 수, 파싱 경고 수가 표시됩니다. |
| 3. SQLite 저장 | `step2_hwpx_save_to_SQLite.py`의 `save_to_sqlite()`가 원본 파일과 파싱 JSON·검색용 블록·이미지를 저장하고 사업에 연결합니다. | `documents_parse.sqlite3`의 최신 등록 파일이 제안요청서 화면과 단계 완료 표시의 기준이 됩니다. |
| 4. 요구사항 추출 | 저장 직후 `step3_ai_requirements_extract_to_SQLite.py`의 `extract_and_save_requirements()`가 작업을 시작합니다. | 작업 상태는 `queued` → `running` → `done` 또는 `failed`이며 결과는 같은 DB의 `requirement_results`에 저장됩니다. |
| 5. 결과 표시 | 웹 화면이 `GET /document-api/projects/:id/requirements`를 조회합니다. | **제안 요구사항** 영역에 사업현황, 요구사항 총괄표, 요구사항 세부 내역과 원문 쪽을 표시합니다. |
| 6. 평가기준 초안 | **평가기준 확정** 메뉴에서 사용자가 초안 생성을 누르면 `step4_ai_criteria.py`가 저장된 요구사항을 분석합니다. | `POST /document-api/projects/:id/criteria`로 생성을 시작하고, `GET`으로 상태와 결과를 읽어 평가부문·항목·기준·요소·배점·설정 이유·보완 제안을 표시합니다. |

요구사항 추출 중에는 화면이 상태를 주기적으로 다시 조회합니다. 실패해도 저장된 원본과 파싱 결과는 남으며 **추출 재시도** 버튼으로 다시 요청할 수 있습니다. 연동 전에 등록한 파일은 **요구사항 추출** 버튼으로 처리합니다. 동일한 문서·파싱 버전에 저장된 유효한 추출 결과가 있으면 이를 재사용합니다.

웹 연동 DB의 기본 경로는 `apps/documents_daeung/documents_parse.sqlite3`입니다. `project_rfp_uploads`가 사업별 파일 버전을, `requirement_jobs`가 추출 작업 상태를, `requirement_results`가 AI 결과를 기록합니다. 원본 파일은 `source_files`, 파싱 결과는 `documents`·`parse_snapshots`·`pages`·`blocks` 등에 저장됩니다. 두 SQLite 파일 모두 로컬 작업 데이터로 Git에 올라가지 않습니다.

평가기준 생성 작업은 `criteria_jobs`, 저장된 초안은 `criteria_results`에 기록됩니다. 원문에 정성적 평가표가 있으면 그 항목·배점을 반영하고, 없으면 요구사항 총괄표의 분류에서 검토용 100점 초안을 만듭니다. 현재 웹 연동에서 **사람의 최종 확정 기록은 이 DB에 저장되지 않습니다.**

요구사항 추출은 문서 원문을 OpenAI API로 보냅니다. 저장소 루트 또는 `apps/documents_daeung`의 `.env`에 `OPENAI_API_KEY`가 필요합니다. AI 호출 없이 업로드·파싱·저장만 제공하려면 문서 API에 `--no-ai`를 붙여 실행합니다.

### 연동 확인 기록 (2026-10-16)

사업 `p3-2516`의 제안요청서를 실제 등록·처리했습니다. 최신 등록 버전은 **2**, 파싱 결과는 **119쪽·3,785개 블록·경고 0건**입니다. 요구사항 추출 작업은 `done`, 저장 결과는 `complete`였으며, 웹 API에서 **사업현황 32개 항목·총괄표 1개·세부 내역 52건·추출 경고 0건**을 확인했습니다. 이 수치는 해당 파일의 결과이며 다른 문서에도 같은 건수가 나온다는 뜻은 아닙니다.

## 화면 사용법

사이드바에서 문서를 고르고, 필요하면 물리 페이지도 선택합니다.
물리 페이지는 표지부터 센 페이지 번호이며, 문서에 인쇄된 쪽번호와 다를 수 있습니다.

화면에는 다섯 개 탭이 있습니다.

| 탭 | 하는 일 |
| --- | --- |
| **원본 페이지** | 원본 문서에서 선택한 쪽을 보여 줍니다. |
| **추출 내용** | 읽어 낸 글·표·그림을 보여 줍니다. 표의 행이 실제로 어느 쪽에 있는지 불확실하면 원본 페이지에서 확인하세요. |
| **제안 요구사항** | 사업현황, 요구사항 총괄표, 세부 내역을 AI로 정리합니다. |
| **정성적 평가기준** | 요구사항을 바탕으로 평가기준표를 만듭니다. |
| **문서 챗봇** | 문서에 질문하고 답을 받습니다. 질문 입력은 중앙 화면 아래에 있고, 질문 범위와 자료 다운로드는 사이드바에 있습니다. |

### 문서 등록과 삭제

등록하면 원본 파일, 읽어 낸 내용, 그림이 기본 데이터베이스인
`apps/documents_daeung/documents.sqlite3`에 저장됩니다.
이 파일은 로컬 작업 데이터이므로 Git 저장소에는 올라가지 않습니다.

문서를 지우려면 사이드바의 **기준 자료 삭제**를 누르고 한 번 더 확인합니다.
선택한 문서와 그 문서의 파싱·AI 결과가 삭제됩니다. 삭제한 내용은 되돌릴 수 없습니다.

### 요구사항과 평가기준

1. **제안 요구사항** 탭에서 **제안 요구사항 추출**을 누릅니다.
2. 추출이 끝나면 사업현황, 요구사항 총괄표, 세부 내역을 확인합니다.
3. 요구사항 결과가 저장된 뒤 **정성적 평가기준** 탭에서 평가기준을 생성합니다.

이미 저장된 결과를 다시 열어 보는 것만으로는 AI를 다시 부르지 않습니다.
화면의 다시 추출·다시 생성 버튼을 누르면 AI를 다시 사용하며 사용량과 요금이 생길 수 있습니다.

원문에 정성적 평가표가 있으면 그 항목과 점수를 우선 사용합니다.
원문에 평가표가 없으면 요구사항을 바탕으로 100점짜리 **검토용 초안**을 만듭니다.
이 초안은 공식 평가표가 아닙니다. 원문과 대조하고 사람이 검토해야 합니다.
요구사항에서 찾은 추가 평가 제안은 점수에 더하지 않는 별도 검토 항목으로 표시합니다.

### 문서 챗봇

챗봇은 화면에서 선택한 한 쪽만 보는 것이 아니라, 선택한 문서의 전체 페이지를 읽습니다.
사이드바에서 현재 문서, 여러 문서 직접 선택, 등록된 사업 중 질문 범위를 고릅니다.
현재 화면에서는 사업을 새로 만들거나 문서를 사업에 연결할 수 없습니다.
연결된 사업이 없다면 **문서 직접 선택**으로 여러 문서를 골라 질문하세요.

챗봇의 답변은 파싱한 원문을 바탕으로 합니다. 이미지 파일은 AI에게 보내지 않으며,
그림 속 글자도 읽지 않습니다. 표를 보여 달라고 하면 AI가 표를 새로 쓰지 않고 저장된 원래 표를 표시합니다.
답변이 항상 맞는 것은 아니므로 중요한 내용은 표시된 페이지와 원본을 비교하세요.

## AI 사용 시 알아둘 점

요구사항 추출, 평가기준 생성, 챗봇 질문에는 OpenAI AI 서비스가 사용됩니다.
AI 기능을 실행하면 문서 내용과 질문 등이 OpenAI로 전송될 수 있습니다.
보내도 되는 자료인지 확인하고, 비밀 정보나 개인정보는 주의해서 다루세요.

AI 기능에는 `OPENAI_API_KEY`라는 비밀 키가 필요합니다. 환경 변수나 `.env` 파일에 설정하세요.
비밀 키를 코드·README에 적거나 GitHub에 올리지 마세요.

문서가 너무 크면 한 번에 AI에게 보낼 수 있는 양을 넘을 수 있습니다.
프로그램은 원문을 임의로 자르지 않습니다. 문서 수를 줄이거나 질문을 짧게 하고 다시 시도하세요.
대화가 너무 길면 오래된 질문과 답변부터 이번 전송에서 빼고 화면에 알려 줍니다.
챗봇 대화는 데이터베이스에 저장하지 않습니다. 문서나 파싱 버전이 바뀌면 대화가 초기화됩니다.

## 터미널에서 실행하기 (선택)

문서 한 개를 파싱하고 기본 데이터베이스에 저장합니다.

아래 기본 명령은 Streamlit용 `documents.sqlite3`를 사용합니다. 웹에서 등록한 문서는 `documents_parse.sqlite3`에 있으므로 조회·재처리할 때 `--database`를 명시합니다.

```sh
.venv/bin/python apps/documents_daeung/step1_hwpx_parse_to_JSON.py "원본.hwpx"
```

요구사항이나 평가기준을 터미널에서 실행하려면 문서 ID를 사용합니다.
재실행 옵션 `--force`를 쓰면 AI를 다시 부르므로 사용량이 발생할 수 있습니다.

```sh
.venv/bin/python -m apps.documents_daeung.step3_ai_requirements_extract_to_SQLite --document-id "<문서 ID>"
.venv/bin/python -m apps.documents_daeung.step4_ai_criteria --document-id "<문서 ID>"
```

```sh
.venv/bin/python -m apps.documents_daeung.step3_ai_requirements_extract_to_SQLite \
  --database apps/documents_daeung/documents_parse.sqlite3 \
  --document-id "<웹에 등록된 문서 ID>"
```

## 파일 안내

| 파일 | 쉬운 설명 |
| --- | --- |
| [`step1_hwpx_parse_to_JSON.py`](step1_hwpx_parse_to_JSON.py) | HWPX 문서를 읽어 글·표·그림 정보를 정리합니다. |
| [`step2_hwpx_save_to_SQLite.py`](step2_hwpx_save_to_SQLite.py) | 정리한 내용과 원본 자료를 SQLite에 저장하고 불러옵니다. |
| [`step0_documents_api.py`](step0_documents_api.py) | 웹 사업 상세의 제안요청서 HWPX 업로드를 받아 파싱·저장하고 제안 요구사항 추출을 시작합니다. |
| [`step3_ai_requirements_extract_to_SQLite.py`](step3_ai_requirements_extract_to_SQLite.py) | AI로 제안요청서의 사업현황과 요구사항을 정리합니다. |
| [`step4_ai_criteria.py`](step4_ai_criteria.py) | AI로 정성적 평가기준 초안을 만듭니다. |
| [`streamlit_parser_test_page.py`](streamlit_parser_test_page.py) | 문서 등록, 페이지 확인, AI 기능을 제공하는 화면입니다. |
| [`requirements.txt`](requirements.txt) | 실행에 필요한 Python 프로그램 목록입니다. |

## 테스트하기

저장소 맨 위 폴더에서 아래 명령을 실행합니다.

```sh
.venv/bin/python -m unittest discover -s apps/documents_daeung/tests -p 'test_*.py' -v
```

더 자세한 프로젝트 설명은 [프로젝트 README](../../README.MD)를 참고하세요.
