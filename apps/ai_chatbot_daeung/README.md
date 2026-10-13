# 평가 지원 에이전트·챗봇

담당: **오대웅 · DaeUng79**

파싱된 제안요청서가 저장된 데이터베이스 자료를 기반으로 사업별 챗봇과 대화합니다.

관련 프로젝트 폴더 : apps/documents_daeung

데이터 베이스 : apps/documents_daeung/documents.sqlite3

챗봇에 필요한 핵심 메인코드는 여기에서 개발하고, 테스트 페이지(apps/documents_daeung/streamlit_parser_test_page.py)에서 확인해야 합니다.

streamlit 운영 기본 챗봇 코드를 참고하세요

import streamlit as st
from openai import OpenAI

st.title("ChatGPT-like clone")

# Set OpenAI API key from Streamlit secrets

client = OpenAI(api_key=st.secrets["OPENAI_API_KEY"])

# Set a default model

if "openai_model" not in st.session_state:
    st.session_state["openai_model"] = "gpt-3.5-turbo"

# Initialize chat history

if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat messages from history on app rerun

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Accept user input

if prompt := st.chat_input("What is up?"):
    # Add user message to chat history
    st.session_state.messages.append({"role": "user", "content": prompt})
    # Display user message in chat message container
    with st.chat_message("user"):
        st.markdown(prompt)


## 구현 및 실행

핵심 로직은 `chatbot.py`, 화면은 `streamlit_chat.py`에 있습니다.
기존 테스트 페이지의 **문서 챗봇** 탭에서 확인합니다.

```bash
python -m pip install -r apps/documents_daeung/requirements.txt
python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
```

`OPENAI_API_KEY`는 환경변수 → Streamlit secrets → 프로젝트 루트 `.env` 순서로 읽습니다.
HWPX를 등록하고 문서를 선택한 후 문서 챗봇 탭에서 질문하세요.
‘현재 문서’, ‘문서 직접 선택’, ‘등록된 사업’ 범위를 지원합니다.
사업 범위는 SQLite의 `projects`와 `project_documents` 연결을 사용합니다.
현재 업로드 화면은 사업 연결을 생성하지 않으므로, 연결이 없으면 문서를 직접 복수 선택하세요.
화면의 물리 페이지 선택과 무관하게 선택 문서의 **전체 추출 내용**을 전달합니다.
제안 요구사항/정성적 평가기준의 AI 생성 결과가 아니라 파싱 원문을 근거로 사용합니다.

## JSON과 Markdown, 전체 문서 전달 방식

현재 HWPX 파싱 JSON만으로 가능합니다. Markdown 변환은 필수가 아닙니다.
DB에는 원본 JSON을 보관하고, 전송할 때 기존 `compact_blocks`를 재사용하여
스타일·좌표·바이너리와 부모 표에 이미 포함된 중복 문단을 제외합니다.
파일명, 활성 버전, 블록 ID, 물리 페이지, 표의 행/열 및 병합 정보는 유지합니다.
병합 셀이 있는 표를 일반 Markdown 표로 평탄화하면 관계가 불명확해질 수 있어
현재 구조에서는 간소화 JSON을 기본으로 선택했습니다.
실제 전달 자료는 화면에서 확인하거나 JSON으로 다운로드할 수 있습니다.
이미지는 보내지 않으며 OCR도 수행하지 않습니다.

임베딩, 벡터 DB, 검색, 청킹 없이 전체 자료를 문맥에 넣는 방식입니다.
엄밀히는 검색 단계가 있는 RAG보다 전체 문맥 기반 문서 질의응답에 가깝습니다.
[GPT-4o-mini 공식 문서](https://developers.openai.com/api/docs/models/gpt-4o-mini)에 따르면
컨텍스트 한도는 128,000토큰이며 최대 출력은 16,384토큰입니다.
이 앱은 답변 4,096토큰과 안전 여유 2,048토큰을 예약하고 시스템 지침·자료·대화·질문을 함께 검사합니다.
문서 전체와 질문만으로 초과하면 호출을 막습니다. 원문을 자동으로 잘라 보내지 않습니다.
대화 때문에 초과하면 오래된 질문/답변 쌍부터 이번 요청에서 제외하고 안내합니다.
문서 선택이나 파싱 버전이 바뀌면 대화를 초기화합니다. 대화는 현재 Streamlit 세션에만 보관합니다.

API는 문서를 한 번 전송했다고 이후 호출에서도 자동으로 기억하지 않습니다.
따라서 **매 질문마다 자료 전체와 필요한 대화를 다시 전송**하며 입력 사용량이 발생합니다.
자료가 한도 안에 들어가는 것과 모든 답변이 정확한 것은 다르므로 표시된 근거를 원문과 대조하세요.

토큰 계산용 `tiktoken`은 requirements.txt에 포함되어 있습니다. 별도 설치 시:

```bash
python -m pip install 'tiktoken>=0.8,<1'
```

설치되면 모델 토크나이저로 추정합니다. 미설치 또는 토크나이저 로딩 실패 시
UTF-8 바이트 수를 보수적 상한으로 사용하며 화면에 계산 방식을 표시합니다.
이 대체 계산은 실제로 들어갈 수 있는 문서도 한도 초과로 판단할 수 있습니다.

## 검증

```bash
python -m unittest discover -s apps/ai_chatbot_daeung/tests -v
```

임시 SQLite 자료 및 Streamlit AppTest로 문서 범위, 활성 버전, 표 구조,
중복 제거, 문맥 초과, 대화 축소, 키 오류 화면과 스트리밍 중단을 검증합니다.
실제 유료 API 호출은 테스트에서 수행하지 않습니다.


## 채팅 답변의 원본 표 표시

“CNR-004 요구사항을 표로 보여줘”처럼 질문하면 모델이 전달 JSON의 `table_ref`를
`[[TABLE:T1]]` 형식으로 지정하고, 화면은 선택 문서의 동일 파싱 스냅샷에 있는 원본 표를 표시합니다.
표 내용은 모델이 재작성하지 않습니다. 병합 셀, 줄바꿈, 저장된 배경색 및 셀 너비 비율을 반영하고
파일명·블록 ID·물리 페이지를 함께 표시합니다. 파싱 JSON에 없는 서식은 복원하지 않습니다.
모델의 표 마커는 화면에서 숨기고, 존재하지 않는 표 참조는 안내합니다.
대화 기록에서도 표를 다시 표시하며, 문서/버전 변경 시 기존 정책대로 대화를 초기화합니다.
원본 표 JSON은 로컬 렌더링에만 사용하고 API에는 기존 간소화 JSON과 `table_ref`만 전달합니다.

## 전송 JSON 용량 최적화 (compact-v1)

표의 셀마다 반복되던 속성명을 제거하고 `[row,col,text,row_span,col_span]` 배열로 전달합니다.
병합값이 모두 1이면 마지막 두 값을 생략합니다. 해석 규칙은 JSON의 `schema`에 한 번만 포함합니다.
문서 ID·파싱 버전·빈 부모 ID·반복 type 값은 전송에서 제외합니다.
블록 ID·물리 페이지·부모 블록 연결·표 참조는 유지하며, 본문과 셀 텍스트는 요약하거나 자르지 않습니다.
빈 셀도 위치 관계를 보존하기 위해 유지합니다. 원본 표 표시와 버전 변경 감지는 로컬 자료로 처리합니다.
화면의 JSON 미리보기/다운로드는 실제 API에 전달하는 최적화 결과입니다.

등록된 5개 문서에 대한 2026-10-13 측정 결과(각 문서 개별 선택, 자료 토큰만):

| 문서 순번 | 최적화 전 | 최적화 후 | 절감률 |
| --- | ---: | ---: | ---: |
| 1 | 97,146 | 54,768 | 43.6% |
| 2 | 71,600 | 46,249 | 35.4% |
| 3 | 131,073 | 75,209 | 42.6% |
| 4 | 188,543 | 108,919 | 42.2% |
| 5 | 94,158 | 47,630 | 49.4% |

5개 모두 개별 문서와 짧은 질문 기준으로 지침·답변 예약분을 포함한 입력 검사를 통과했습니다.
문서 여러 개를 함께 선택하거나 긴 질문/대화를 추가하면 여전히 한도를 초과할 수 있습니다.
최적화된 형식에 대한 실제 API 답변 품질은 별도 확인이 필요합니다.
