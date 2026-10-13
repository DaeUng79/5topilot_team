"""SQLite에 저장된 원본 페이지와 파싱 결과를 물리 페이지별로 조회하는 앱.

실행: python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
"""

from __future__ import annotations

import html
import io
import json
import re
import sqlite3
import sys
import tempfile
import unicodedata
import zipfile
from contextlib import closing
from pathlib import Path

import streamlit as st


DATABASE = Path(__file__).resolve().parent / "documents.sqlite3"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def register_hwpx(db_path: Path, data: bytes, filename: str) -> dict:
    """업로드 HWPX를 임시 위치에서 파싱하고 원본·이미지와 함께 SQLite에 저장한다."""
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("비어 있지 않은 50 MB 이하의 HWPX 파일을 선택해 주세요.")
    name = unicodedata.normalize("NFC", filename.replace("\\", "/").rsplit("/", 1)[-1])
    name = "".join(character for character in name if character.isprintable()).strip()
    if not name or Path(name).suffix.lower() != ".hwpx" or len(name.encode("utf-8")) > 240:
        raise ValueError("파일명이 올바른 HWPX 파일을 선택해 주세요.")
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise ValueError("올바른 HWPX 파일이 아닙니다.")

    if __package__:
        from .step1_hwpx_parse_to_JSON import parse_hwpx
        from .step2_hwpx_save_to_SQLite import save_to_sqlite
    else:
        from step1_hwpx_parse_to_JSON import parse_hwpx
        from step2_hwpx_save_to_SQLite import save_to_sqlite

    with tempfile.TemporaryDirectory(prefix="hwpx_sqlite_upload_") as directory:
        source = Path(directory) / name
        source.write_bytes(data)
        document = parse_hwpx(source, output_dir=directory)
        return save_to_sqlite(document, db_path, source_path=source)


def render_sidebar_registration(db_path: Path) -> None:
    with st.sidebar.expander("제안요청서 HWPX 등록"):
        uploaded = st.file_uploader("HWPX 파일", type=["hwpx"], key="sqlite_hwpx_upload")
        if st.button("파싱 및 저장", disabled=uploaded is None, key="sqlite_register"):
            try:
                with st.spinner("HWPX를 파싱하고 SQLite에 저장하고 있습니다…"):
                    saved = register_hwpx(db_path, uploaded.getvalue(), uploaded.name)
            except Exception as error:
                st.error(f"등록에 실패했습니다: {error}")
            else:
                st.session_state["sqlite_selected_document"] = saved["document_id"]
                st.session_state["sqlite_upload_success"] = (
                    f"등록 완료 · {saved['pages']:,}쪽 · 블록 {saved['blocks']:,}개"
                )
                st.rerun()


def render_sidebar_delete(db_path: Path, document_id: str, filename: str) -> None:
    with st.sidebar.expander("기준 자료 삭제"):
        st.caption("선택한 문서의 원본, 파싱 결과, 요구사항 분석 결과를 함께 삭제합니다.")
        if st.session_state.get("sqlite_pending_delete") != document_id:
            st.session_state.pop("sqlite_pending_delete", None)
        if st.button("선택한 기준 자료 삭제", key="sqlite_delete_start"):
            st.session_state["sqlite_pending_delete"] = document_id
        if st.session_state.get("sqlite_pending_delete") == document_id:
            st.warning(f"‘{filename}’을(를) 삭제할까요? 되돌릴 수 없습니다.")
            confirm, cancel = st.columns(2)
            if confirm.button("삭제 확인", key="sqlite_delete_confirm"):
                if __package__:
                    from .step2_hwpx_save_to_SQLite import delete_document_from_sqlite
                else:
                    from step2_hwpx_save_to_SQLite import delete_document_from_sqlite
                try:
                    deleted = delete_document_from_sqlite(db_path, document_id)
                except (OSError, sqlite3.Error) as error:
                    st.error(f"삭제에 실패했습니다: {error}")
                else:
                    st.session_state.pop("sqlite_pending_delete", None)
                    st.session_state.pop("sqlite_selected_document", None)
                    st.session_state["sqlite_delete_success"] = (
                        f"기준 자료를 삭제했습니다: {filename}" if deleted
                        else "선택한 기준 자료가 이미 삭제되었습니다."
                    )
                    st.rerun()
            if cancel.button("취소", key="sqlite_delete_cancel"):
                st.session_state.pop("sqlite_pending_delete", None)
                st.rerun()


def connect_readonly(db_path: Path) -> sqlite3.Connection:
    """조회 화면에서 DB 파일을 만들거나 수정하지 않도록 읽기 전용으로 연다."""
    connection = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def list_documents(db_path: Path) -> list[dict]:
    with closing(connect_readonly(db_path)) as connection:
        rows = connection.execute(
            "SELECT d.document_id, d.filename, d.source_sha256, d.active_revision, "
            "COUNT(p.physical_page_number) AS page_count "
            "FROM documents d LEFT JOIN pages p ON p.document_id=d.document_id "
            "AND p.revision=d.active_revision "
            "GROUP BY d.document_id ORDER BY d.updated_at DESC, d.filename"
        ).fetchall()
    return [dict(row) for row in rows]


def list_pages(db_path: Path, document_id: str, revision: str) -> list[dict]:
    with closing(connect_readonly(db_path)) as connection:
        rows = connection.execute(
            "SELECT physical_page_number, page_number, metadata_json FROM pages "
            "WHERE document_id=? AND revision=? ORDER BY physical_page_number",
            (document_id, revision),
        ).fetchall()
    return [dict(row) for row in rows]


def load_page_blocks(db_path: Path, document_id: str, revision: str, page: int) -> list[dict]:
    """페이지에 연결된 최상위 블록만 가져와 셀 안의 중복 문단을 제외한다."""
    with closing(connect_readonly(db_path)) as connection:
        rows = connection.execute(
            "SELECT b.block_json FROM blocks b WHERE b.document_id=? AND b.revision=? "
            "AND b.parent_block_id IS NULL "
            "AND EXISTS (SELECT 1 FROM json_each(b.physical_page_numbers_json) "
            "WHERE json_each.value=?) ORDER BY b.order_index",
            (document_id, revision, page),
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def load_nested_images(db_path: Path, document_id: str, revision: str, page: int) -> list[dict]:
    """표 셀 안의 그림은 최상위 블록 목록에 없으므로 따로 조회한다."""
    with closing(connect_readonly(db_path)) as connection:
        rows = connection.execute(
            "SELECT b.block_json FROM blocks b WHERE b.document_id=? AND b.revision=? "
            "AND b.type='image' AND b.parent_block_id IS NOT NULL "
            "AND EXISTS (SELECT 1 FROM json_each(b.physical_page_numbers_json) "
            "WHERE json_each.value=?) ORDER BY b.order_index",
            (document_id, revision, page),
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def load_asset(db_path: Path, document_id: str, revision: str, asset_id: str) -> bytes | None:
    with closing(connect_readonly(db_path)) as connection:
        row = connection.execute(
            "SELECT a.data FROM snapshot_assets sa JOIN assets a ON a.sha256=sa.sha256 "
            "WHERE sa.document_id=? AND sa.revision=? AND sa.asset_id=?",
            (document_id, revision, asset_id),
        ).fetchone()
    return row[0] if row else None


def load_source(db_path: Path, source_sha256: str) -> bytes | None:
    """선택한 문서의 원본 파일 BLOB을 읽는다."""
    with closing(connect_readonly(db_path)) as connection:
        row = connection.execute(
            "SELECT data FROM source_files WHERE sha256=?", (source_sha256,)
        ).fetchone()
    return row[0] if row else None


@st.cache_data(max_entries=12, show_spinner=False)
def render_page_svg(db_path_str: str, db_signature: tuple[int, int],
                    source_sha256: str, filename: str, page: int) -> str | None:
    """SQLite의 원본 파일에서 선택한 한 쪽을 SVG로 렌더링한다."""
    del db_signature  # DB 파일이 바뀌면 캐시를 갱신한다.
    source = load_source(Path(db_path_str), source_sha256)
    if source is None:
        return None
    from pyhwpxlib.rhwp_bridge import RhwpEngine

    suffix = Path(filename).suffix.lower()
    if suffix not in {".hwpx", ".hwp"}:
        raise ValueError("저장된 원본 파일 형식을 확인할 수 없습니다.")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / ("source" + suffix)
        path.write_bytes(source)
        renderer = RhwpEngine().load(str(path))
        try:
            if page < 1 or page > renderer.page_count:
                raise ValueError(f"원본의 페이지 범위를 벗어났습니다: {page}")
            return renderer.render_page_svg(page - 1)
        finally:
            renderer.close()


def table_html(table: dict, max_rows: int | None = None) -> str:
    """병합 셀을 보존하되 셀의 원문은 HTML escape 처리한다."""
    rows = table.get("cells", [])
    if max_rows is not None:
        rows = rows[:max_rows]
    # 셀 너비가 있는 원본 JSON에서는 행 전체 너비 대비 비율을 반영한다.
    total_width = max((sum(max(0, cell.get("width") or 0) for cell in row)
                       for row in rows), default=0)
    rendered = []
    for row in rows:
        cells = []
        for cell in sorted(row, key=lambda item: item.get("col", 0)):
            color = str(cell.get("background_color") or "")
            style = "border:1px solid #aeb8c2;padding:6px 9px;vertical-align:top;white-space:pre-wrap"
            width = max(0, cell.get("width") or 0)
            if total_width and width:
                style += f";width:{width / total_width * 100:.3f}%"
            if re.fullmatch(r"#[0-9a-fA-F]{3,8}", color):
                style += f";background-color:{color}"
            row_span = max(1, int(cell.get("row_span", 1)))
            col_span = max(1, int(cell.get("col_span", 1)))
            value = html.escape(str(cell.get("text") or "")).replace("\n", "<br>")
            cells.append(f'<td rowspan="{row_span}" colspan="{col_span}" style="{style}">{value}</td>')
        rendered.append("<tr>" + "".join(cells) + "</tr>")
    return (
        '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">'
        + "".join(rendered) + "</table></div>"
    )


def render_image(db_path: Path, document_id: str, revision: str, block: dict) -> None:
    picture = block.get("image") or {}
    asset_id = picture.get("asset_id")
    description = picture.get("description") or block.get("text") or "추출 이미지"
    if not asset_id:
        st.caption(description)
        st.info("이 그림의 바이너리는 파싱 결과에 없습니다.")
        return
    data = load_asset(db_path, document_id, revision, asset_id)
    if data is None:
        st.warning("SQLite에서 이미지 BLOB을 찾지 못했습니다.")
        return
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            st.image(image, caption=description, width="stretch")
    except (OSError, ValueError):
        st.info("이 이미지 형식은 화면 미리보기를 지원하지 않습니다.")
    suffix = Path(picture.get("source_path") or "image.bin").suffix or ".bin"
    st.download_button("이미지 다운로드", data, file_name=f"{asset_id[:12]}{suffix}",
                       key=f"asset_{block['block_id']}_{asset_id}")


def render_extracted(db_path: Path, document_id: str, revision: str, page: int) -> None:
    blocks = load_page_blocks(db_path, document_id, revision, page)
    nested_images = load_nested_images(db_path, document_id, revision, page)
    st.caption(f"연결된 최상위 블록 {len(blocks):,}개 · 표 안의 그림 {len(nested_images):,}개")
    if not blocks and not nested_images:
        st.info("이 쪽에 연결된 추출 블록이 없습니다. 원본 페이지 탭에서 실제 화면을 확인하세요.")
        return
    show_full_tables = st.checkbox("표의 모든 행 표시", value=False,
                                   help="여러 쪽에 걸친 표는 어느 행이 이 쪽에 있는지 파싱 JSON만으로 확정할 수 없습니다.")
    for block in blocks:
        kind = block.get("type")
        linked_pages = block.get("physical_page_numbers") or []
        if kind == "paragraph":
            value = block.get("text") or ""
            if value.strip():
                st.text(value)
        elif kind == "table":
            rows = block.get("table", {}).get("cells", [])
            st.markdown(f"**표 {html.escape(block['block_id'])}** · {len(rows):,}행")
            if len(linked_pages) > 1:
                st.caption("여러 쪽에 연결된 표입니다. 아래 행은 선택한 쪽에만 속하는 행으로 확정되지 않았습니다.")
            max_rows = None if show_full_tables else 20
            st.markdown(table_html(block.get("table", {}), max_rows), unsafe_allow_html=True)
            if not show_full_tables and len(rows) > 20:
                st.caption(f"처음 20행 표시 · 전체 {len(rows):,}행은 위 옵션에서 볼 수 있습니다.")
        elif kind == "image":
            render_image(db_path, document_id, revision, block)
    if nested_images:
        st.divider()
        st.markdown("#### 표 안의 그림")
        for block in nested_images:
            render_image(db_path, document_id, revision, block)


def render_requirement_blocks(db_path: Path, document_id: str, revision: str,
                              blocks: list[dict], *, show_full_tables: bool,
                              show_table_pages: bool = False) -> None:
    """선택된 원문 블록을 중복 없이 문단·표·이미지 순서로 표시한다."""
    included = {block["block_id"] for block in blocks}
    for block in blocks:
        if block.get("parent_block_id") in included:
            continue
        kind = block.get("type")
        if kind == "paragraph":
            if (block.get("text") or "").strip():
                st.text(block["text"])
        elif kind == "table":
            rows = block.get("table", {}).get("cells", [])
            source_pages = block.get("physical_page_numbers") or [block.get("physical_page_number")]
            pages = list(dict.fromkeys(
                page for page in source_pages if isinstance(page, int) and page > 0
            )) if show_table_pages else []
            page_label = " · " + ", ".join(f"{page}쪽" for page in pages) if pages else ""
            st.markdown(f"**표 {html.escape(block['block_id'])}** · {len(rows):,}행{page_label}")
            st.markdown(table_html(block["table"], None if show_full_tables else 20),
                        unsafe_allow_html=True)
            if len(rows) > 20 and not show_full_tables:
                st.caption(f"처음 20행 표시 · 전체 {len(rows):,}행")
        elif kind == "image":
            render_image(db_path, document_id, revision, block)


def render_requirements(db_path: Path, document_id: str, revision: str,
                        filename: str) -> None:
    """현재 문서의 SQLite 저장 결과를 표시하고 버튼 클릭 시에만 AI를 호출한다."""
    if __package__:
        from .step3_ai_requirements_extract_to_SQLite import (
            BUSINESS_CATEGORIES, RequirementsError, extract_and_save_requirements,
            group_detail_items, load_saved_requirements, read_source,
        )
    else:
        from step3_ai_requirements_extract_to_SQLite import (
            BUSINESS_CATEGORIES, RequirementsError, extract_and_save_requirements,
            group_detail_items, load_saved_requirements, read_source,
        )

    st.subheader("제안 요구사항")
    st.caption("사업현황, 표 형식의 요구사항 총괄표, 요구사항 세부 내역을 표시합니다. 추출 버튼을 누를 때만 API를 호출합니다.")
    try:
        result = load_saved_requirements(db_path, document_id)
    except (RequirementsError, sqlite3.Error, OSError, ValueError) as error:
        st.warning(f"저장된 요구사항 결과를 확인하지 못했습니다: {error}")
        result = None

    button_label = "제안 요구사항 다시 추출" if result else "제안 요구사항 추출"
    if st.button(button_label, type="primary", key=f"requirements_{document_id}"):
        try:
            with st.status("제안 요구사항을 추출하고 있습니다…", expanded=True) as status:
                result = extract_and_save_requirements(
                    db_path, document_id, force=result is not None, progress=st.write,
                )
                status.update(label="추출 결과를 SQLite에 저장했습니다", state="complete", expanded=False)
        except (RequirementsError, sqlite3.Error, OSError, ValueError) as error:
            st.error(f"요구사항 추출에 실패했습니다: {error}")
            result = None

    if result is None:
        st.info("현재 문서에 저장된 제안 요구사항 결과가 없습니다.")
        return
    if result.get("source_revision") != revision:
        st.warning("현재 파싱 버전과 다른 추출 결과는 표시하지 않습니다.")
        return

    usage = result.get("usage") or {}
    st.caption(f"추출 시각 {result.get('created_at', '—')} · 모델 {result.get('model', '—')}"
               + (f" · 사용 토큰 {usage['total_tokens']:,}" if usage.get("total_tokens") is not None else ""))
    for warning in result.get("warnings", []):
        st.warning(warning)
    st.download_button(
        "제안 요구사항 JSON 다운로드",
        json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
        file_name=Path(filename).stem + "_제안요구사항.json", mime="application/json",
        key=f"requirements_download_{document_id}",
    )

    try:
        document = read_source(db_path, document_id)
    except (RequirementsError, sqlite3.Error, OSError, ValueError) as error:
        st.error(f"요구사항 원문을 불러오지 못했습니다: {error}")
        return
    st.markdown("### 1. 사업현황")
    source_by_id = {block["block_id"]: block for block in document.get("blocks", [])}
    business_status = result.get("business_status") or {}
    for key, label in BUSINESS_CATEGORIES.items():
        st.markdown(f"#### {label}")
        points = business_status.get(key) or []
        if not points:
            st.info("원문에서 확인된 내용이 없습니다.")
            continue
        for point in points:
            pages = sorted({page for block_id in point["source_block_ids"]
                            for page in (source_by_id.get(block_id, {}).get("physical_page_numbers")
                                         or [source_by_id.get(block_id, {}).get("physical_page_number")])
                            if isinstance(page, int) and page > 0})
            page_text = ", ".join(str(page) for page in pages)
            st.markdown(f"- {point['text']}" + (f"  *(원문 {page_text}쪽)*" if pages else ""))

    st.markdown("### 2. 요구사항 총괄표")
    requirement_list = result.get("requirement_list", {}).get("blocks", [])
    if requirement_list:
        render_requirement_blocks(db_path, document_id, revision, requirement_list,
                                  show_full_tables=True)
    else:
        st.info("추출된 요구사항 총괄표가 없습니다.")

    st.markdown("### 3. 요구사항 세부 내역")
    groups = group_detail_items(document, result.get("details", {}))
    if not groups:
        st.info("추출된 요구사항 세부내역이 없습니다.")
        return
    full_tables = st.checkbox("세부내역 표의 모든 행 표시", value=False,
                              key=f"requirements_full_tables_{document_id}")
    if st.checkbox("세부내역 전체 펼치기", value=False,
                   key=f"requirements_all_details_{document_id}"):
        for index, item in enumerate(groups, 1):
            st.markdown(f"#### {index}. {item['label']}")
            render_requirement_blocks(db_path, document_id, revision, item["blocks"],
                                      show_full_tables=full_tables, show_table_pages=True)
        return
    choice = st.selectbox(
        "요구사항 항목 선택", range(len(groups)),
        format_func=lambda index: f"{index + 1}. {groups[index]['label']}",
        key=f"requirements_item_{document_id}",
    )
    selected = groups[choice]
    page_label = " · ".join(f"{page}쪽" for page in selected["pages"]) or "페이지 미확인"
    st.caption(f"원문 페이지 {page_label}")
    render_requirement_blocks(db_path, document_id, revision, selected["blocks"],
                              show_full_tables=full_tables, show_table_pages=True)


def criteria_table_html(result: dict) -> str:
    """저장된 표 JSON을 그룹 병합 셀이 있는 HTML 표로 표시한다."""
    table = result["table"]
    groups = table["groups"]
    row_count = sum(len(group["items"]) for group in groups)
    parts = [
        '<style>.criteria-table-wrap{overflow-x:auto;margin:1rem 0 1.5rem}'
        '.criteria-table{border-collapse:collapse;width:100%;min-width:760px;table-layout:fixed;'
        'font-size:.94rem;line-height:1.45;color:#1f2937}'
        '.criteria-table th,.criteria-table td{border:1px solid #75808c;padding:.55rem .65rem;'
        'vertical-align:middle;overflow-wrap:anywhere}'
        '.criteria-table th{background:#f0f3f7;text-align:center;font-weight:700}'
        '.criteria-table .criteria-center{text-align:center}'
        '.criteria-table .criteria-section{background:#f7f9fc;font-weight:700}'
        '.criteria-table .criteria-division{background:#fafbfc;font-weight:650}'
        '.criteria-table ul{margin:0;padding-left:1.2rem}'
        '.criteria-table li{margin:.08rem 0}'
        '</style>',
        '<div class="criteria-table-wrap"><table class="criteria-table">',
        '<colgroup><col style="width:11%"><col style="width:17%">'
        '<col style="width:22%"><col style="width:42%"><col style="width:8%"></colgroup>',
        '<thead><tr>' + ''.join(f'<th>{html.escape(label)}</th>' for label in table["columns"])
        + '</tr></thead><tbody>',
    ]
    first_row = True
    for group in groups:
        for item_index, item in enumerate(group["items"]):
            parts.append('<tr>')
            if first_row:
                label = f'{table["evaluation_type"]} ({table["total_score"]})'
                parts.append(f'<td class="criteria-center criteria-section" rowspan="{row_count}">'
                             f'{html.escape(label)}</td>')
                first_row = False
            if item_index == 0:
                label = f'{group["evaluation_division"]} ({group["division_score"]})'
                parts.append(f'<td class="criteria-center criteria-division" '
                             f'rowspan="{len(group["items"])}">{html.escape(label)}</td>')
            parts.append(f'<td class="criteria-center">{html.escape(item["evaluation_item"])}</td>')
            elements = ''.join(f'<li>{html.escape(element)}</li>'
                               for element in item["evaluation_elements"])
            parts.append(f'<td><ul>{elements}</ul></td>')
            parts.append(f'<td class="criteria-center">{item["score"]}</td></tr>')
    parts.append('</tbody></table></div>')
    return ''.join(parts)


def render_criteria(db_path: Path, document_id: str, revision: str,
                    filename: str) -> None:
    """SQLite에 저장된 정성적 평가기준을 조회하거나 명시적으로 생성한다."""
    if __package__:
        from .step4_ai_criteria import (
            CriteriaError, extract_and_save_criteria, load_saved_criteria,
        )
    else:
        from step4_ai_criteria import (
            CriteriaError, extract_and_save_criteria, load_saved_criteria,
        )
    st.subheader("정성적 평가기준")
    try:
        result = load_saved_criteria(db_path, document_id)
        ready = True
    except (CriteriaError, sqlite3.Error, OSError, ValueError) as error:
        st.info(str(error))
        result, ready = None, False
    label = "정성적 평가기준 다시 생성" if result else "정성적 평가기준 생성"
    if st.button(label, type="primary", disabled=not ready,
                 key=f"criteria_{document_id}"):
        try:
            with st.status("평가기준을 생성하고 있습니다…", expanded=True) as status:
                result = extract_and_save_criteria(
                    document_id, db_path=db_path, force=result is not None,
                    progress=st.write,
                )
                status.update(label="평가기준을 SQLite에 저장했습니다", state="complete",
                              expanded=False)
        except (CriteriaError, sqlite3.Error, OSError, ValueError) as error:
            st.error(f"평가기준 생성에 실패했습니다: {error}")
            result = None
    if result is None:
        return
    if result.get("source_revision") != revision:
        st.warning("현재 파싱 버전과 다른 평가기준은 표시하지 않습니다.")
        return
    st.caption(f"총 배점 {result['total_score']}점 · {len(result['rows'])}개 항목")
    if result.get("template_source") == "generated_from_summary":
        st.info("원문 정성적 평가표가 없어 요구사항 총괄표의 그룹별로 생성한 초안입니다. "
                "그룹 배점은 균등 배분한 100점 초안이며 세부 평가항목과 항목별 배점은 AI가 작성했습니다.")
    else:
        st.caption("원문 정성적 평가표의 항목과 배점을 반영했습니다.")
    rationale = result["selection_rationale"]
    st.markdown("### 평가기준 설정 이유")
    for key, label in (
        ("current_status", "사업 관련 현황"),
        ("background_and_need", "추진 배경 및 필요성"),
        ("scope", "사업 범위"),
    ):
        st.markdown(f"**{label}**")
        st.write(rationale[key])
    st.markdown("**평가부문과의 연결**")
    for link in rationale["evaluation_links"]:
        st.write(f"• {link['evaluation_division']}: {link['reason']}")
    st.download_button(
        "정성적 평가기준 JSON 다운로드",
        json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
        file_name=Path(filename).stem + "_정성적평가기준.json", mime="application/json",
        key=f"criteria_download_{document_id}",
    )
    st.markdown(criteria_table_html(result), unsafe_allow_html=True)
    supplemental = result.get("supplemental_items", [])
    st.markdown("### 요구사항 기반 보완 평가항목")
    st.caption("원문 요구사항과 소프트웨어 기술성 평가기준 지침의 평가 관점을 대조한 검토 초안입니다. "
               "원문 평가표의 항목·배점과 총점에는 포함되지 않습니다.")
    if supplemental:
        for item in supplemental:
            st.markdown(f"**{item['guideline_area']} · {item['evaluation_item']}**")
            st.write(item["evaluation_criteria"])
            for element in item["evaluation_elements"]:
                st.write(f"• {element}")
            st.caption(f"원문 근거 ({item['source_id']}): {item['source_quote']}")
    else:
        st.info("추가로 제안된 보완 평가항목이 없습니다.")
    with st.expander("평가기준 설명 보기"):
        for row in result["rows"]:
            st.markdown(f"**{row['evaluation_division']} · {row['evaluation_item']}**")
            st.write(row["evaluation_criteria"])


def main() -> None:
    st.set_page_config(page_title="SQLite 문서 페이지 조회", page_icon="📄", layout="wide")
    st.title("SQLite 문서 페이지 조회")
    st.caption("저장된 문서를 물리 페이지별로 선택해 원본 화면과 추출 내용을 확인합니다.")
    render_sidebar_registration(DATABASE)
    if st.session_state.get("sqlite_upload_success"):
        st.success(st.session_state.pop("sqlite_upload_success"))
    if st.session_state.get("sqlite_delete_success"):
        st.success(st.session_state.pop("sqlite_delete_success"))
    if not DATABASE.is_file():
        st.info("저장된 SQLite 데이터베이스가 없습니다. 사이드바에서 HWPX 파일을 등록해 주세요.")
        return
    try:
        documents = list_documents(DATABASE)
    except sqlite3.Error as error:
        st.error(f"SQLite 조회에 실패했습니다: {error}")
        return
    if not documents:
        st.info("저장된 문서가 없습니다. 사이드바에서 HWPX 파일을 등록해 주세요.")
        return

    by_id = {row["document_id"]: row for row in documents}
    with st.sidebar:
        st.markdown("### 저장 문서")
        ids = list(by_id)
        selected_id = st.session_state.get("sqlite_selected_document")
        if selected_id not in by_id:
            st.session_state["sqlite_selected_document"] = ids[0]
        document_id = st.selectbox(
            "문서 선택", ids, key="sqlite_selected_document",
            format_func=lambda key: by_id[key]["filename"] or key[:12],
        )
        document = by_id[document_id]
        st.caption(f"총 {document['page_count']:,}쪽 · 문서 ID {document_id[:12]}…")
    render_sidebar_delete(DATABASE, document_id, document["filename"] or document_id)
    revision = document["active_revision"]
    try:
        pages = list_pages(DATABASE, document_id, revision)
    except sqlite3.Error as error:
        st.error(f"페이지 조회에 실패했습니다: {error}")
        return
    if not pages:
        st.info("이 문서에는 페이지 메타데이터가 없습니다.")
        return
    by_number = {row["physical_page_number"]: row for row in pages}
    with st.sidebar:
        page = st.selectbox(
            "물리 페이지", list(by_number),
            format_func=lambda number: (
                f"{number}쪽 · 인쇄 {by_number[number]['page_number']}쪽"
                if by_number[number]["page_number"] is not None else f"{number}쪽"
            ),
        )

    st.subheader(document["filename"] or document_id)
    printed = by_number[page]["page_number"]
    st.caption(f"물리 {page}쪽" + (f" · 인쇄 {printed}쪽" if printed is not None else " · 인쇄 쪽번호 없음"))
    tab_labels = ["원본 페이지", "추출 내용", "제안 요구사항", "정성적 평가기준", "문서 챗봇"]
    preview, extracted, requirements, criteria, chatbot = st.tabs(
        tab_labels, key="document_page_tabs", on_change="rerun",
    )
    # streamlit run의 실행 위치와 무관하게 형제 앱 패키지를 찾는다.
    root = str(Path(__file__).resolve().parents[2])
    if root not in sys.path:
        sys.path.insert(0, root)
    from apps.ai_chatbot_daeung.streamlit_chat import prepare_chatbot, render_chatbot

    chat_state = prepare_chatbot(DATABASE, documents, document_id)
    chat_prompt = None
    if (st.session_state.get("document_page_tabs") == "문서 챗봇"
            and chat_state is not None):
        chat_prompt = st.chat_input(
            "예: 사업 범위와 필수 요구사항을 근거와 함께 정리해 주세요.",
            disabled=bool(chat_state[2]), key="document_chat_prompt",
        )

    with preview:
        signature = (DATABASE.stat().st_mtime_ns, DATABASE.stat().st_size)
        try:
            with st.spinner("선택한 페이지를 렌더링하는 중입니다…"):
                svg = render_page_svg(str(DATABASE), signature, document["source_sha256"],
                                      document["filename"], page)
        except (OSError, ValueError, RuntimeError, ImportError, sqlite3.Error) as error:
            st.warning(f"원본 페이지를 표시하지 못했습니다: {error}")
        else:
            if svg is None:
                st.info("이 문서의 원본 파일 BLOB이 없습니다. 추출 내용 탭을 확인하세요.")
            else:
                st.image(svg, width="stretch")
    with extracted:
        try:
            render_extracted(DATABASE, document_id, revision, page)
        except (sqlite3.Error, ValueError, KeyError) as error:
            st.error(f"추출 내용 조회에 실패했습니다: {error}")
        st.caption("여러 쪽에 걸친 표는 파싱 JSON의 블록 연결만으로 행별 위치를 확정할 수 없습니다. 원본 페이지 탭에서 실제 배치를 확인하세요.")
    with requirements:
        render_requirements(DATABASE, document_id, revision, document["filename"] or document_id)
    with criteria:
        render_criteria(DATABASE, document_id, revision, document["filename"] or document_id)

    with chatbot:
        st.subheader("추출 내용 문서 챗봇")
        st.caption(
            "질문 입력과 대화 내용은 중앙 화면에, 질문 범위와 전달 자료 관련 기능은 사이드바에 표시됩니다."
        )
        render_chatbot(chat_state, chat_prompt)


if __name__ == "__main__":
    main()
