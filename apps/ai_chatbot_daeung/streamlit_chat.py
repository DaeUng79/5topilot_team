"""기존 파서 테스트 페이지에 삽입하는 문서 챗봇 화면."""
import sqlite3

import streamlit as st

from apps.ai_chatbot_daeung.chatbot import (
    ChatbotError, MODEL, build_messages, count_tokens, get_client,
    list_projects, load_context, stream_answer, answer_parts,
)


def render_answer(answer, source_tables):
    from apps.documents_daeung.streamlit_parser_test_page import table_html

    text, tables, invalid = answer_parts(answer, source_tables)
    if text:
        st.markdown(text)
    for source in tables:
        block = source["block"]
        pages = block.get("physical_page_numbers") or [block.get("physical_page_number")]
        page_label = ", ".join(f"{page}쪽" for page in pages if isinstance(page, int) and page > 0)
        st.caption(f"{source['filename']} · 표 {block['block_id']} · "
                   f"{len(block['table'].get('cells', []))}행 · {page_label or '쪽번호 미확인'}")
        # HTML은 모델 출력이 아닌, escape 처리한 DB 원문으로만 생성한다.
        st.markdown(table_html(block["table"]), unsafe_allow_html=True)
    if invalid:
        st.warning("답변이 지정한 일부 표를 현재 문서에서 찾을 수 없습니다. 표를 다시 요청해 주세요.")


def render_chatbot(db_path, documents, selected_document_id):
    st.subheader("추출 내용 문서 챗봇")
    st.caption(f"{MODEL} · 선택한 문서의 모든 페이지에 질문합니다. 질문할 때 추출 텍스트와 대화가 OpenAI API로 전송됩니다.")
    by_id = {row["document_id"]: row for row in documents}
    try:
        projects = list_projects(db_path)
        scope = st.radio("질문 범위", ["현재 문서", "문서 직접 선택", "등록된 사업"], horizontal=True)
        if scope == "현재 문서":
            ids = [selected_document_id]
        elif scope == "문서 직접 선택":
            ids = st.multiselect("함께 질문할 문서", list(by_id), default=[selected_document_id],
                                 format_func=lambda key: by_id[key]["filename"])
        else:
            names = {row["project_id"]: row["name"] for row in projects}
            if not names:
                st.info("사업에 연결된 문서가 없습니다. ‘문서 직접 선택’으로 한 사업의 문서를 함께 선택할 수 있습니다.")
                return
            project_id = st.selectbox("사업", list(names), format_func=names.get)
            ids = [row["document_id"] for row in projects if row["project_id"] == project_id]
        context = load_context(db_path, ids)
    except (sqlite3.Error, OSError, ValueError, KeyError) as error:
        st.info(f"문서 자료를 준비하지 못했습니다: {error}")
        return

    fingerprint = context["fingerprint"]
    # 선택 문서나 활성 버전이 바뀌면 이전 자료의 답변이 섞이지 않도록 초기화한다.
    if st.session_state.get("document_chat_context") != fingerprint:
        st.session_state.document_chat_context = fingerprint
        st.session_state.document_chat_messages = []
    history = st.session_state.document_chat_messages
    tokens, method = count_tokens(context["content"])
    st.caption(f"선택 문서 {len(ids)}개 · 자료 {tokens:,} ({method}) · 답변 최대 4,096토큰 예약")
    previous_tokens = context["previous_tokens"]
    reduction = (1 - tokens / previous_tokens) * 100 if previous_tokens else 0
    st.caption(f"전송 최적화: 기존 {previous_tokens:,} → {tokens:,} ({reduction:.1f}% 절감) · 본문 요약·잘라내기 없음")
    if context["image_count"]:
        st.warning(f"그림 {context['image_count']}개는 포함하지 않습니다. 그림 속 글자와 도표에는 답할 수 없습니다.")
    empty_names = [d["filename"] for d in context["documents"] if not d["text_available"]]
    if empty_names:
        st.warning("추출 텍스트가 없는 문서: " + ", ".join(empty_names))
    with st.expander("챗봇에 전달하는 추출 자료 확인"):
        st.json(context["content"], expanded=False)
        st.download_button("전달 JSON 다운로드", context["content"], "chat_context.json", "application/json")
    if st.button("대화 초기화", key="document_chat_clear"):
        st.session_state.document_chat_messages = []
        st.rerun()
    for message in history:
        with st.chat_message(message["role"]):
            if message["role"] == "assistant":
                render_answer(message["content"], context["source_tables"])
            else:
                st.markdown(message["content"])

    blocked = False
    try:
        build_messages(context["content"], [], "문서 요약")
    except ChatbotError as error:
        st.warning(str(error))
        blocked = True
    prompt = st.chat_input("예: 사업 범위와 필수 요구사항을 근거와 함께 정리해 주세요.",
                           disabled=blocked, key="document_chat_prompt")
    if not prompt:
        return
    with st.chat_message("user"):
        st.markdown(prompt)
    try:
        messages, removed, input_tokens = build_messages(context["content"], history, prompt)
        if removed:
            st.info(f"입력 한도 때문에 오래된 대화 {removed // 2}쌍을 이번 요청에서 제외했습니다. 문서 전체는 포함합니다.")
        try:
            secret_key = st.secrets.get("OPENAI_API_KEY")
        except (FileNotFoundError, st.errors.StreamlitSecretNotFoundError):
            secret_key = None
        with get_client(secret_key) as client:
            with st.chat_message("assistant"):
                placeholder = st.empty()
                answer = ""
                for chunk in stream_answer(client, messages):
                    answer += chunk
                    text, _, _ = answer_parts(answer, context["source_tables"], streaming=True)
                    placeholder.markdown(text)
                placeholder.empty()
                render_answer(answer, context["source_tables"])
        if not isinstance(answer, str) or not answer.strip():
            raise ChatbotError("빈 답변을 받았습니다. 질문을 다시 입력해 주세요.")
    except (ChatbotError, OSError, ValueError) as error:
        st.error(str(error))
        st.caption("실패하거나 중단된 답변은 대화 기록에 저장하지 않습니다. 같은 질문을 다시 입력할 수 있습니다.")
        return
    history.extend([{"role": "user", "content": prompt}, {"role": "assistant", "content": answer}])
    st.caption(f"이번 요청 입력 추정: {input_tokens:,}토큰 · 답변의 근거는 원본 페이지와 대조해 주세요.")
