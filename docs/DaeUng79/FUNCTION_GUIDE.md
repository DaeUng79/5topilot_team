# 함수 설명과 검증 기록

기준일: 2026-10-11 · [개인 안내](README.md) · [추진계획](ACTION_PLAN.md)

## 주석 범위

현재 존재하는 Python 파일 11개의 **184개 함수**(실행 코드 124개, 테스트·대역 60개)에 한국어 docstring이 있습니다. 기존 설명을 유지하면서 없는 설명 136개를 추가하고, 일부 기존 설명은 실제 동작과 한계를 드러내도록 보완했습니다. 중첩 함수도 포함하며 익명 lambda는 목록 대상이 아닙니다.

설명에는 함수의 목적·입출력 의미·파일/DB/모델 호출·수정되는 상태·검증 한계를 해당되는 범위에서 기록했습니다. 이번 변경은 설명만 반영한 것이며 최적화 로직·import 경로·DB 구조를 수정하지 않았습니다.

미리보기 캐시 키는 파서와 작업자 소스의 바이트 해시를 포함하므로 주석 변경 뒤 최초 열람에서 캐시가 새로 생성될 수 있습니다. 업무 로직이 같아도 소스 해시가 같다는 뜻은 아닙니다.

## 검증 결과

| 검증                          | 결과                                                              | 해석                                                                             |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Python 문법                   | 11개 파일을`compile(source, filename, 'exec')`로 검사, 통과     | 파일을 import하거나 외부 서비스를 실행한 검증이 아님                             |
| 함수 설명 누락                | 184/184개 docstring 존재                                          | 중첩·테스트 함수 포함                                                           |
| 설명 외 코드 변경             | 수정 직전 사본과 함수 docstring을 제거한 AST 비교, 11개 모두 일치 | 실행문·조건·인수·상수·import를 변경하지 않음                                 |
| 기존 unittest 수집·실행 시도 | 5개 모듈 import 오류, 기능 테스트 본문 미실행                     | 없는`apps.app.documents` 경로가 원인. 5개 테스트가 실제로 실행됐다는 뜻이 아님 |
| 합성 입력의 revision 검사     | `assets[].local_path`만 바꿔도 revision 변경 확인               | 경로 독립적인 의미 버전 규칙을 DAE-03에서 설계할 근거                            |
| 실DB·모델·실문서 렌더링     | 미실행                                                            | 운영 품질·성능 검증으로 해석하지 않음                                           |

현재 테스트 재현 명령은 저장소 루트에서 아래와 같습니다. 네트워크를 차단하며 import 문제를 수정하기 전에는 오류가 예상됩니다.

```sh
.venv/bin/python -B - <<'PYTEST'
import socket
import unittest
from unittest.mock import patch

with (
    patch.object(socket.socket, 'connect', side_effect=AssertionError('Network disabled for review')),
    patch.object(socket.socket, 'connect_ex', side_effect=AssertionError('Network disabled for review')),
    patch.object(socket, 'getaddrinfo', side_effect=AssertionError('Network disabled for review')),
):
    suite = unittest.defaultTestLoader.discover('apps/documents_daeung/tests', pattern='test_*.py')
    result = unittest.TextTestRunner(verbosity=1).run(suite)
raise SystemExit(not result.wasSuccessful())
PYTEST
```

작업 시작 시 `test_ai_criteria.py`, `test_ai_requirements.py`, `test_criteria_ui.py`, `test_requirements_ui.py`는 이미 삭제 상태였습니다. 해당 파일을 복원하지 않았으므로 이번 주석·검증 범위에 포함하지 않았습니다.

## 파일별 함수 목차

아래 설명은 소스의 docstring에서 가져왔습니다. 줄 번호는 이번 작성 시점 기준이며 후속 수정 시 바뀔 수 있습니다.

### step1_parser_hwpx.py — 30개

[소스 열기](../../apps/documents_daeung/step1_parser_hwpx.py)

| 함수                                            | 줄  | 설명                                                                                                                                                                                               |
| ----------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text_content`                                | 29  | 혼합 XML의 text/tail과 탭·줄바꿈을 보존한다.                                                                                                                                                      |
| `text_from_cell`                              | 47  | 셀 내부의 텍스트를 추출한다. 줄바꿈도 최대한 보존한다.                                                                                                                                             |
| `find_binary_path`                            | 64  | binaryItemIDRef에 대응하는 HWPX BinData 경로를 찾는다.                                                                                                                                             |
| `parse_image`                                 | 79  | HWPX 그림 하나를 JSON에서 참조할 수 있는 형태로 구조화한다.                                                                                                                                        |
| `parse_image.size_of`                         | 96  | 그림 크기 태그를 정수 너비·높이로 읽고 없거나 변환할 수 없으면 None을 반환한다.                                                                                                                   |
| `parse_border_fill_colors`                    | 126 | HWPX borderFill의 단색 채우기 정보를 셀 배경색으로 변환한다.                                                                                                                                       |
| `parse_table`                                 | 141 | HWPX <hp:tbl> 하나를 구조화한다. 병합 셀의 rowSpan / colSpan을 유지한다.                                                                                                                           |
| `add_table_context`                           | 228 | 각 표에 같은 섹션의 앞뒤 문단을 LLM용 문맥으로 연결한다.                                                                                                                                           |
| `render_node_text`                            | 262 | pyhwpxlib 렌더 트리 노드의 TextRun 텍스트를 순서대로 결합한다.                                                                                                                                     |
| `page_number_metadata_from_render_tree`       | 270 | 머리말·바닥글에 실제 표시되는 쪽번호와 출처를 읽는다.                                                                                                                                             |
| `page_number_metadata_from_render_tree.visit` | 273 | 지정한 유형의 렌더 노드를 순회하며 해당 노드 아래는 중복 탐색하지 않는다.                                                                                                                          |
| `page_number_from_render_tree`                | 292 | 기존 호출자를 위해 인쇄된 쪽번호만 반환한다.                                                                                                                                                       |
| `section_files_in_order`                      | 297 | ZIP 내부의 구역 XML 경로만 골라 section 번호의 숫자 순서로 반환한다.                                                                                                                               |
| `rendered_section_index`                      | 305 | Python bridge에 아직 없는 getPageInfo WASM API를 좁게 감싼다.                                                                                                                                      |
| `read_rendered_pagination`                    | 324 | 전역 문단 인덱스→실제 페이지 목록과 하단에 표시된 쪽번호를 읽는다.                                                                                                                                |
| `read_rendered_pagination.collect`            | 358 | 머리말·꼬리말을 제외한 문단 인덱스를 현재 물리 페이지에 연결한다.                                                                                                                                 |
| `correct_page_numbers`                        | 380 | 사용자가 확인한 번호 기준을 동일한 원본 해시에만 적용한다. 물리 페이지 경계는 수정하지 않는다. XML의 명시적 번호 재시작 이후에는 이전 기준을 전파하지 않으며 숨겨진 쪽번호는 계속 null로 보존한다. |
| `apply_rendered_pagination`                   | 433 | 단일 번호는 시작 페이지, 여러 쪽에 걸친 요소는 페이지 목록도 저장한다.                                                                                                                             |
| `parse_rendered_table`                        | 457 | pyhwpxlib이 제공하는 HWP 표 셀 구조를 파싱한다.                                                                                                                                                    |
| `parse_hwp`                                   | 509 | pyhwpxlib의 실제 렌더 트리에서 HWP 5.x 문단과 표를 추출한다.                                                                                                                                       |
| `parse_hwp.collect_columns`                   | 533 | 렌더 트리에서 본문 Column 노드를 찾아 바깥 columns 목록에 추가한다.                                                                                                                                |
| `parse_hwp.append_image`                      | 550 | HWP 이미지의 위치와 미추출 안내를 블록·이미지 목록에 추가한다. 바이너리는 추출하지 않는다.                                                                                                        |
| `parse_hwp.flush_paragraph`                   | 584 | 누적한 HWP 텍스트와 이미지 위치를 문서에 추가하고 문단 버퍼를 비운다.                                                                                                                              |
| `parse_hwpx`                                  | 653 | 원본 계층을 유지하면서 문단, 표, 셀 내부 그림을 한 번씩 추출한다.                                                                                                                                  |
| `parse_hwpx.warn`                             | 671 | 오류 코드와 부가 정보를 문서의 warnings 목록에 누적한다.                                                                                                                                           |
| `parse_hwpx.locate`                           | 714 | XML 노드별로 같은 이름의 형제 순번을 포함한 원본 경로를 기록한다.                                                                                                                                  |
| `parse_hwpx.base`                             | 725 | 유형별 블록 ID·문서 순서·부모 관계·XML 출처를 가진 공통 레코드를 만든다.                                                                                                                        |
| `parse_hwpx.parse_paragraph`                  | 741 | 문단과 셀 내부의 표·그림을 재귀 추출해 문서에 추가하고 생성된 블록 ID를 반환한다.                                                                                                                 |
| `parse_hwpx.parse_paragraph.flush`            | 747 | 누적한 텍스트와 문자 스타일을 문단 블록으로 등록한 뒤 버퍼를 비운다.                                                                                                                               |
| `parse_hwpx.parse_paragraph.visit`            | 760 | XML 내용 순서대로 텍스트·표·그림을 처리하고 이미지 파일을 출력 폴더에 저장한다.                                                                                                                  |

### step2_hwpx_storage.py — 5개

[소스 열기](../../apps/documents_daeung/step2_hwpx_storage.py)

| 함수                | 줄  | 설명                                                                                                                                                                                                                                                                                        |
| ------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mongo_settings`  | 22  | 환경변수와 지정한 .env에서 MongoDB URI·DB명을 읽는다. 환경변수를 우선하며 옛 설정 표현식은 실행하지 않는다.                                                                                                                                                                                |
| `split_text`      | 49  | 문단/행 단위 구성 후 긴 내용만 상한에 맞게 분리한다. 원문 범위를 반환한다.                                                                                                                                                                                                                  |
| `make_chunks`     | 63  | 문단·표 행을 검색 청크로 만들고 셀·블록·페이지 참조를 붙인다. 표의 char_start/char_end는 좌표 설명을 붙인 행 텍스트의 범위다. 원본 XML이나 셀 문자열의 오프셋이 아니며, 임베딩·OCR은 수행하지 않는다.                                                                                   |
| `prepare_records` | 107 | 파싱 결과를 메타데이터·블록·자산·청크로 구성하고 BSON 크기를 검사한다. 입력 JSON 전체로 revision을 계산하므로 로컬 경로 변경도 해시에 반영된다. 호환용 tables/images는 제외하지만 메타데이터의 blocks/assets 복제는 유지한다. 입력은 수정하지 않으며 이 함수에서는 DB에 접근하지 않는다. |
| `save_to_mongodb` | 150 | 파일 해시를 검증하고 버전별 레코드를 저장한 뒤 활성 revision을 바꾼다. 원본 파일은 store_source=True일 때만 GridFS에 저장한다. 중간 실패는 MongoStorageError로 알리며, 전체 작업은 다중 문서 트랜잭션이 아니다.                                                                             |

### step3_ai_requirements.py — 25개

[소스 열기](../../apps/documents_daeung/step3_ai_requirements.py)

| 함수                               | 줄  | 설명                                                                                                                                                                                                                           |
| ---------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_json`                          | 67  | 한글을 유지하고 키를 정렬한 공백 없는 JSON 문자열을 반환한다.                                                                                                                                                                  |
| `source_fingerprint`             | 72  | 전달된 blocks 전체의 JSON 해시를 반환한다. 호출 전에 운송용 필드를 제거해야 동일성을 유지할 수 있다.                                                                                                                           |
| `_identity`                      | 78  | 문서 ID와 활성 revision의 존재·일치를 검사하고 두 값을 반환한다.                                                                                                                                                              |
| `_result_id`                     | 89  | 문서 ID·활성 revision·추출기 버전·모델을 조합해 재사용 가능한 결과 ID를 만든다.                                                                                                                                             |
| `_lookup`                        | 95  | 비어 있거나 중복된 블록 ID를 거절하고 ID로 원문 블록을 찾는 사전을 만든다.                                                                                                                                                     |
| `compact_blocks`                 | 109 | 전체 텍스트를 보내되 중복 셀 문단·스타일·바이너리는 보내지 않는다.                                                                                                                                                           |
| `make_batches`                   | 140 | 긴 표도 잘라 전부 검사한다. 원문 복사는 이후 원본 블록 전체에서 수행한다.                                                                                                                                                      |
| `get_client`                     | 168 | 환경변수 우선으로 API 키를 읽어 제한시간·재시도가 설정된 클라이언트를 만든다. 호출자가 닫아야 한다.                                                                                                                           |
| `_select`                        | 182 | 한 배치의 요구사항 블록 ID를 모델로 선택·검증한다. 중복 분류는 한 번 교정 요청하며 사용량도 반환한다.                                                                                                                         |
| `_section`                       | 243 | 선택 블록과 모든 하위 요소를 원문 순서대로 깊은 복사한다. 없는 참조는 오류로 처리한다.                                                                                                                                         |
| `_disjoint_sections`             | 279 | 겹치는 원문 범위는 summary 우선으로 한 번만 포함하고 제거 사실을 알린다.                                                                                                                                                       |
| `requirement_codes`              | 319 | 번호 부여 예시와 실제 목록 ID, 상세 ID와 본문의 관련 ID를 구분한다. 익숙하지 않은 양식은 전체 텍스트 검사로 되돌린다. 이 함수는 검증용이며 복사할 원문이나 LLM의 양식 판단에는 영향을 주지 않는다.                             |
| `_is_complete_inventory`         | 367 | 모든 선택된 분할 블록이 처리된 뒤에만 총괄 번호 완성을 인정한다.                                                                                                                                                               |
| `_detail_id_columns`             | 398 | 표 머리글과 코드 열 반복을 이용해 요구사항 고유번호 열을 찾는다.                                                                                                                                                               |
| `group_detail_items`             | 432 | 상세 요구사항을 번호별 표 행 또는 개별 원문 블록으로 묶고 페이지를 붙인다. 번호 열을 확실히 찾은 표만 행 단위로 분리한다. 다른 서식은 원문 블록 전체를 하나의 항목으로 유지해 셀 병합·문단·중첩 표를 임의로 잘라내지 않는다. |
| `group_detail_items.add_item`    | 443 | 상세 항목의 블록과 원문에서 물리 페이지를 모아 표시용 items 목록에 추가한다.                                                                                                                                                   |
| `group_detail_items.flush_group` | 484 | 현재 요구사항의 표 행·머리글·하위 블록을 묶고 병합 범위를 보정한 표시용 항목을 추가한다.                                                                                                                                     |
| `validate_result`                | 557 | 출처 연결, 원문 동일성, 소속/중복 참조를 저장 전과 재조회 시 검사한다.                                                                                                                                                         |
| `extract_requirements`           | 577 | 모델이 고른 블록을 원문에서 복사하고 출처 검증 결과·사용량을 반환한다. 발견한 목록 번호가 상세에 모두 있으면 뒤 배치를 생략하는 휴리스틱을 쓴다. 문서 전체 검사가 보장되는 것은 아니며, DB 저장은 호출자가 따로 수행한다.     |
| `requirements_database`          | 645 | 요구사항용 DB 연결을 열어 제공하고 종료 시 닫는다. 접속 상세를 숨긴 오류로 변환한다.                                                                                                                                           |
| `read_source`                    | 660 | 문서와 활성 버전의 본문을 조회해 식별자를 검증한다. 분리된 블록에서는 DB 운송 필드를 제외한다.                                                                                                                                 |
| `load_saved_requirements`        | 674 | 현재 문서 버전과 원문 동일성을 확인해 저장된 결과를 반환한다. 모델을 호출하지 않는다.                                                                                                                                          |
| `save_requirements`              | 689 | 원문·버전·BSON 크기를 검증해 결과를 upsert하고 저장 후 버전을 재확인한다. 다중 문서 트랜잭션은 아니다.                                                                                                                       |
| `extract_and_save_requirements`  | 707 | 검증된 캐시를 재사용하거나 요구사항을 추출해 저장한다. force=True이면 모델을 다시 호출한다.                                                                                                                                    |
| `main`                           | 728 | CLI에서 문서 ID 또는 유일한 파일명으로 대상을 고르고 추출·선택적 DB 저장·JSON 출력을 수행한다.                                                                                                                               |

### step4_ai_criteria.py — 21개

[소스 열기](../../apps/documents_daeung/step4_ai_criteria.py)

| 함수                          | 줄  | 설명                                                                                                                                                                                |
| ----------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_json`                     | 41  | 키 순서를 고정한 JSON 문자열로 해시와 모델 입력을 일관되게 만든다.                                                                                                                  |
| `_criteria_id`              | 46  | 문서·요구사항 내용·기준 서식·생성기·모델 버전을 묶어 평가기준 캐시 ID를 만든다.                                                                                                 |
| `_block_text`               | 60  | 문단 본문 또는 표의 셀 텍스트를 행 단위 문자열로 반환한다. 다른 블록 유형은 제외한다.                                                                                               |
| `requirements_text`         | 75  | 추출 결과의 총괄표와 상세 원문을 요약 없이 텍스트로 전달한다.                                                                                                                       |
| `_find_document_table`      | 92  | 대상 제안요청서 자체의 붙임/본문 정성적 평가기준표를 우선 찾는다.                                                                                                                   |
| `_split_reference_elements` | 115 | 참고 평가요소를 줄 단위로 나누고 앞뒤 공백·글머리 기호를 제거한다.                                                                                                                 |
| `_parse_markdown_template`  | 120 | doc/ai_criteria.md 표를 대체 기준 서식의 구조화 JSON으로 읽는다.                                                                                                                    |
| `_resolve_template`         | 155 | 원문 평가표를 우선 선택하고 없으면 Markdown 서식을 읽어 출처·버전·행 목록을 반환한다.                                                                                             |
| `_normalize_template_rows`  | 170 | DB에 저장된 표 병합 셀을 평가 행 목록으로 정규화한다.                                                                                                                               |
| `_generated_schema`         | 206 | 허용된 row_id와 평가기준·평가요소 필드를 갖는 모델 응답 JSON 스키마를 만든다.                                                                                                      |
| `_reference_prompt_rows`    | 226 | 기준표의 필요한 항목·배점만 골라 모델에 전달할 행 목록을 만든다.                                                                                                                   |
| `_call_model`               | 234 | 모델 응답의 항목·문자열을 검사하고 한 번 교정 요청한다. 배점은 기준표 값을 유지하며 사용량도 반환한다.                                                                             |
| `generate_criteria`         | 324 | 검증된 요구사항에서 모델로 평가기준 초안을 만들고 출처 버전·사용량을 반환한다. 항목과 배점은 참조 서식을 유지한다. 행별 근거 블록 연결이나 사람의 승인, DB 저장은 수행하지 않는다. |
| `criteria_database`         | 364 | 평가기준용 DB 연결을 제공하고 종료 시 닫는다. 연결 상세가 없는 업무 오류로 변환한다.                                                                                                |
| `_read_source`              | 379 | 요구사항 모듈로 원문을 조회하고 실패를 평가기준용 오류로 변환한다.                                                                                                                  |
| `_load_requirements`        | 387 | 현재 원문·모델에 연결된 요구사항 결과를 조회해 검증하고 없으면 선행 추출을 요구한다.                                                                                               |
| `load_saved_criteria`       | 401 | 현재 문서·요구사항·서식에 맞는 저장 평가기준을 조회·검증한다. 모델은 호출하지 않는다.                                                                                            |
| `_validate_saved`           | 417 | 저장 결과의 출처·버전·항목 구성·배점·내용 유무를 검증하고 불일치하면 오류를 낸다.                                                                                               |
| `save_criteria`             | 451 | 현재 원문과 서식을 다시 검증해 결과를 저장하고 문서 버전을 재확인한다. 승인 처리는 수행하지 않는다.                                                                                 |
| `extract_and_save_criteria` | 469 | 유효한 기존 결과를 반환하거나 모델로 평가기준을 생성해 DB에 저장한다.                                                                                                               |
| `main`                      | 491 | 문서 ID와 CLI 옵션으로 기준을 생성하고 선택적으로 DB·JSON 파일에 저장한다.                                                                                                         |

### streamlit_main.py — 40개

[소스 열기](../../apps/documents_daeung/streamlit_main.py)

| 함수                                        | 줄   | 설명                                                                                                |
| ------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `worker_python`                           | 39   | 모듈 폴더의 가상환경 Python을 우선 선택하고 없으면 현재 인터프리터를 사용한다.                      |
| `load_page_previews`                      | 47   | 보관된 원본으로 페이지별 화면을 만들고 파일 해시별로 재사용한다.                                    |
| `parse_in_worker`                         | 105  | 렌더러를 새 프로세스에서 로드해 Streamlit의 import 캐시와 분리한다.                                 |
| `database_connection`                     | 135  | 화면용 MongoDB 연결을 생성·확인해 제공하고 종료 시 닫는다. 상세 접속정보는 오류에서 숨긴다.        |
| `history_query`                           | 148  | 조회 가능한 문서 상태와 NFC/NFD 파일명 검색 조건을 만든다. 검색어는 정규식 문자로 실행하지 않는다.  |
| `load_history`                            | 159  | 문서 총수와 최근 저장순 목록을 조회하고 유효 범위로 보정한 페이지 번호도 반환한다.                  |
| `recover_page_metadata`                   | 177  | 동일 본문의 이전 버전에서 페이지 정보만 복원한다. DB는 변경하지 않는다.                             |
| `recover_page_metadata.content`           | 179  | 페이지·DB 운송 필드와 중복 표 문맥을 제외해 이전 버전과 비교할 본문 구조를 만든다.                 |
| `load_document`                           | 220  | 활성 문서를 조회하고 필요하면 블록을 조립하거나 동일 본문의 과거 페이지 정보를 메모리에서 복원한다. |
| `delete_document`                         | 246  | 선택 문서와 모든 버전의 보조 데이터를 삭제한다. 공유 파일은 보존한다.                               |
| `load_image`                              | 273  | GridFS에서 지정한 파일을 읽어 바이트로 반환한다. 미리보기 용량 제한을 넘으면 오류를 낸다.           |
| `clean_filename`                          | 282  | 경로 성분·제어문자를 제거하고 한글을 정규화한다. 허용 확장자와 파일명 길이를 확인한다.             |
| `parse_upload`                            | 293  | 업로드를 문서 해시별로 보관하고 기존 파서로 처리한다. DB 쓰기는 별도 수행.                          |
| `json_bytes`                              | 315  | BSON 날짜 등도 표현할 수 있는 UTF-8 JSON 다운로드 바이트를 만든다.                                  |
| `display_name`                            | 320  | 표시할 이름을 NFC로 정규화하고 비어 있으면 기본 문서명을 반환한다.                                  |
| `display_time`                            | 325  | 저장 시각을 한국 시간 문자열로 표시한다. 시간대 없는 datetime은 UTC로 간주한다.                     |
| `page_label`                              | 334  | 블록의 물리 페이지를 표시용 문자열로 만들고 정보가 없으면 미확인 문구를 반환한다.                   |
| `table_html`                              | 342  | 좌표와 rowspan/colspan을 유지하고 모든 원문 문자열을 이스케이프한다.                                |
| `build_document_html`                     | 357  | 페이지별 렌더링을 우선 표시하며 원본이 없을 때만 저장 블록을 사용한다.                              |
| `build_document_html.pages_of`            | 367  | 블록에 연결된 양의 정수 물리 페이지를 중복 없이 정렬해 반환한다.                                    |
| `build_document_html.printed_label`       | 384  | 물리 페이지에 대응하는 인쇄 쪽번호를 이스케이프해 표시하고 없으면 빈 문자열을 반환한다.             |
| `build_document_html.render`              | 389  | 문단·표·이미지를 HTML로 재귀 렌더링한다. 참조 순환과 이미지 누락은 안내 문구로 표시한다.          |
| `document_view`                           | 534  | 원본 미리보기 또는 저장 블록 기반 HTML을 표시하고 미리보기 실패는 경고로 알린다.                    |
| `render_proposal_document`                | 545  | 문서 정보·JSON 다운로드·원문·표·이미지 선택 화면을 구성한다.                                    |
| `load_requirements_result`                | 618  | 저장 결과 조회는 API를 호출하지 않는다. 화면에서 쉽게 대체 가능한 경계.                             |
| `extract_requirements_result`             | 629  | 문서 요구사항의 추출·저장을 호출하고 기능 오류를 화면용 AppError로 변환한다.                       |
| `load_criteria_result`                    | 641  | 현재 문서의 저장 평가기준을 조회하고 기능 오류를 화면용 AppError로 변환한다.                        |
| `extract_criteria_result`                 | 651  | 문서 평가기준의 생성·저장을 호출하고 기능 오류를 화면용 AppError로 변환한다.                       |
| `requirements_state_key`                  | 663  | 같은 이름의 다른 파일과 재등록된 버전의 결과를 섞지 않는다.                                         |
| `requirements_match_document`             | 669  | 요구사항 결과의 문서 ID와 source_revision이 현재 문서 상태와 일치하는지 반환한다.                   |
| `build_requirements_html`                 | 676  | 총괄표를 먼저 보여주고 상세 원문은 요구사항별 페이지 정보와 함께 접어 둔다.                         |
| `build_requirements_html.reader_fragment` | 680  | 선택한 블록을 추출 문서로 렌더링하고 공통 스타일과 본문 HTML을 분리해 반환한다.                     |
| `build_criteria_html`                     | 731  | 생성한 JSON 기준표를 제안요구사항 화면과 같은 문서형 표로 표시한다.                                 |
| `render_requirements`                     | 765  | 요구사항 조회·재추출·다운로드 화면을 표시하고 버전별 세션 캐시를 관리한다.                        |
| `render_criteria`                         | 829  | 요구사항이 준비되면 평가기준 조회·생성·다운로드 화면과 결과 캐시를 관리한다.                      |
| `render_document`                         | 899  | 선택 문서의 원문·요구사항·평가기준 탭을 구성하고 각 화면 함수를 호출한다.                         |
| `clear_upload_feedback`                   | 914  | 새 파일 선택 시 이전 업로드의 저장 대기·성공 상태를 세션에서 제거한다.                             |
| `register_view`                           | 920  | HWPX 업로드·파싱·DB 저장을 처리하고 저장 실패 시 결과 다운로드와 저장 재시도를 제공한다.          |
| `history_view`                            | 977  | 사이드바에서 최근 문서 목록·열기·삭제를 제공하고 최초 접속 시 최신 문서를 선택한다.               |
| `main`                                    | 1032 | Streamlit 페이지·사이드바를 구성하고 선택된 문서 또는 초기·연결 오류 안내를 표시한다.             |

### streamlit_main.py 미리보기 작업자 함수 — 4개

[소스 열기](../../apps/documents_daeung/streamlit_main.py)

| 함수                           | 줄 | 설명                                                                                    |
| ------------------------------ | -- | --------------------------------------------------------------------------------------- |
| `remove_rendered_page_label` | 55 | 본문 밖의 쪽번호만 제거한다. 화면 바깥쪽에 교정된 쪽번호를 표시한다.                    |
| `build_page_previews`        | 73 | 원본을 렌더러로 열어 해시·페이지 정보·쪽번호를 제거한 SVG를 반환하고 렌더러를 닫는다. |
| `source_parser_path`         | 99 | 현재 작업자와 같은 폴더에 있는 파서 소스의 절대 경로를 반환한다.                        |
| `page_preview_main` | 1122 | 별도 프로세스에서 미리보기를 생성하고 지정한 JSON 파일에 저장한다. |
