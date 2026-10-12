> 아래 실행 명령은 저장소 루트를 기준으로 합니다. 제품 전체 소개는 [프로젝트 README](../../README.MD), 담당·진행 기록은 [DaeUng79](../../docs/DaeUng79/README.md)를 참고하세요.

# HWPX 문서 파싱 및 저장

이 프로젝트는 HWPX를 중심으로 한글 문서를 파싱해 문단·표·이미지·페이지 정보를 구조화합니다. HWP는 CLI에서 제한적으로 지원합니다.

**최종 파싱 결과는 JSON으로 확정**하고 **데이터베이스는 SQLite로 결정**했습니다. 현재 실행 안내는 아래 본문을 따르며, 이전 MongoDB 구현 설명은 문서 끝에 기록으로 보존합니다.

## 파일별 역할

| 파일                                                              | 역할                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [step1_parser_hwpx.py](step1_parser_hwpx.py)                       | HWPX 중심 파싱 JSON 생성 및 CLI 실행 시 SQLite 저장                                 |
| [step2_hwpx_save_to_SQLite.py](step2_hwpx_save_to_SQLite.py)       | 파싱 JSON·이미지를 SQLite에 저장하고 원본 JSON·이미지를 읽는 독립 실행 모듈         |
| [step3_ai_requirements_SQLite.py](step3_ai_requirements_SQLite.py) | 원문 블록 처리, 사업 주요 정리·요구사항 전체 목록·세부내역 추출 및 SQLite 저장/조회 |
| [step4_ai_criteria.py](step4_ai_criteria.py)                       | 추출 요구사항 및 요청서 평가기준표 또는 Markdown 기본 서식으로 JSON 기준표 생성·저장 |
| [streamlit_parser_test_page.py](streamlit_parser_test_page.py)     | SQLite 문서 등록·삭제, 페이지 조회, 요구사항·평가기준 생성                          |
| [requirements.txt](requirements.txt)                               | 앱·파서 실행에 필요한 Python 의존성                                                  |

## 1. 파싱 구조 — `step1_parser_hwpx.py`

### 처리 흐름

```text
HWPX 원본
  ├─ ZIP 내부 Contents/header.xml, Contents/section*.xml, content.hpf 분석
  ├─ 문단 텍스트·스타일, 표·셀·병합·배경, 그림 참조 추출
  ├─ BinData 이미지 바이트를 SHA256 파일명으로 저장
  ├─ 렌더 트리로 문단과 물리 페이지를 연결하고 인쇄 쪽번호 추출
  └─ 구조화 JSON 생성
```

HWPX는 ZIP 안의 XML을 직접 읽기 때문에 표 셀 좌표와 병합 정보, 셀 안의 문단·중첩 표·그림 관계를 보존합니다. 렌더 트리의 문단 위치를 XML 문단과 연결해 페이지 정보를 추가합니다.

### JSON의 주요 구조

- `document_id`, `source_sha256`: 원본 파일의 SHA256. 같은 원본을 식별하는 키입니다.
- `blocks`: 문서 순서대로 저장되는 기본 단위입니다. `paragraph`, `table`, `image` 타입을 사용하며 `block_id`, `order`, `section`, 원본 XML 위치, 부모 블록·셀 참조 등을 가집니다.
- `table.cells`: 행별 셀 배열입니다. 각 셀은 좌표(`row`, `col`), 병합 범위(`row_span`, `col_span`), 텍스트, 배경색, 내부 자식 블록 ID를 담습니다. 중첩 표와 셀 내부 그림은 별도 블록으로 연결되어 중복 추출을 피합니다.
- `assets`: 추출된 이미지의 SHA256, MIME 유형, 크기, 로컬 저장 경로 등 바이너리 메타데이터입니다.
- `pages`: 물리 페이지 번호와 인쇄 쪽번호를 분리해 기록합니다. 표지처럼 번호가 보이지 않는 페이지의 `page_number`는 `null`일 수 있습니다.
- `warnings`: 누락된 이미지, 페이지 매핑 실패 등 주의 사항입니다.
- `tables`, `images`: 호환 목적의 파서 결과 목록입니다. SQLite에는 원본 JSON으로 함께 보존됩니다.
- `physical_page_number`는 표지부터 센 물리 페이지 번호입니다.
- `page_number`/`page_numbers`는 문서에 표시된 인쇄 쪽번호입니다.

### Markdown 파싱 검토 결과 (이전 실험 기록)

| 비교 항목 | JSON 방식                                                                                                                                 | 페이지별 Markdown                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 장점      | 문단·표·셀·그림을 구조화하고 문서 ID, 파서 버전,블록 ID, XML 위치, 부모 관계, 셀 병합, 이미지 자산, 페이지 출처 등 메타데이터를 보존함 | 페이지 순서대로 읽고 검토하기 쉬움. 원본 HWPX가 있으면 렌더 트리에서 각 쪽에 실제 보이는 문장과 표 행을 표시함                                                              |
| 한계      | 메타데이터와 중첩 구조로 크기가 커지고 사람이 원문처럼 읽기 어려움. 여러 쪽에 걸친 블록은 문단 단위 페이지 연결만 제공함                  | 전체 블록·셀 ID와 원본 XML 경로, 스타일·병합·자산 메타데이터를 완전히 보존하지 않음. 병합 표는 HTML, 넓은 표는 행 내용 표로 변환되므로 원본 구조를 역으로 복원할 수 없음 |
| 용도      | **최종 파싱 원본**, DB 저장, 출처 검증, AI 결과의 재현·재분석                                                                      | 사람의 확인, 페이지별 검토·공유용 출력                                                                                                                                     |

## 2. 현재 저장 구조와 확장 목표 — SQLite

SQLite는 **파싱이 완료된 JSON과 후속 AI 분석 결과를 저장·조회**하는 데 사용합니다. 한 프로젝트에 3~5개 문서를 연결하고 프로젝트 통합 결과를 관리하는 방향으로 설계했습니다. 현재는 문서와 프로젝트의 연결, 파싱 결과와 문서별 AI 결과를 저장하며, 프로젝트 통합 결과 저장은 향후 목표입니다. 파싱과 AI 처리는 DB 바깥에서 수행하며 SQLite는 그 결과와 출처를 관리합니다. 별도 DB 서버 없이 파일 중심으로 배포·백업할 수 있어 로컬 실행과 이식에 적합하다는 판단입니다.

| 테이블                                            | 저장 내용                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `projects`, `project_documents`               | 프로젝트와 원본 문서 연결. 문서 역할·순서 및 3~5개 제한은 아직 구현되지 않음         |
| `documents`, `parse_snapshots`                | 파일 해시·활성 revision·파서 버전 및 최종 JSON 원본. 같은 파싱 결과는 한 번만 보존 |
| `pages`, `blocks`, `table_cells`            | 물리/인쇄 쪽번호, 문서 순서의 블록, 여러 쪽에 걸친 블록의 연결, 셀 좌표·병합·텍스트 |
| `assets`, `snapshot_assets`, `source_files` | 그림 BLOB과 파싱 버전별 자산 연결, 선택적으로 저장한 원본 파일 BLOB                   |
| `requirement_results`, `criteria_results`     | 문서별 요구사항·정성적 평가기준과 출처 revision·모델 정보                           |

요구사항과 평가기준 결과는 각각 `requirement_results`, `criteria_results`에 저장합니다. 두 결과 모두 문서의 파싱 revision과 연결됩니다. 평가기준 테이블은 첫 결과를 저장할 때 생성합니다.

초기 검토 샘플은 문서당 이미지가 0~5개였으며, 큰 이미지는 약 1.5MB였습니다. 이 규모에서는 파일 하나로 옮기고 백업하기 쉽도록 이미지를 SHA256 기준 SQLite BLOB으로 저장합니다. 원본 HWPX/HWP도 `--source`를 주면 BLOB으로 저장합니다. 저장 전에 이미지와 원본의 SHA256을 확인합니다.

`step2_hwpx_save_to_SQLite.py`는 파싱 JSON 원본, 페이지, 블록, 표 셀, 이미지 BLOB, 선택한 원본 파일을 저장하고 문서를 프로젝트에 연결할 수 있습니다. 같은 JSON을 다시 저장해도 중복 revision을 만들지 않습니다. 원본 JSON 안의 과거 `local_path`는 그대로 보존되므로, 다른 컴퓨터에서는 `load_asset()`으로 이미지 BLOB을 읽습니다.

이미 파싱한 JSON을 별도로 저장할 때는 다음처럼 실행합니다. 원본 페이지 미리보기가 필요하면 같은 문서의 `--source "원본.hwpx"`를 추가합니다. 파서 CLI와 Streamlit 등록은 SQLite 저장까지 수행하므로 이 명령을 다시 실행할 필요가 없습니다.

```sh
.venv/bin/python apps/documents_daeung/step2_hwpx_save_to_SQLite.py \
  apps/documents_daeung/output/json/parsed.json \
  --database apps/documents_daeung/documents.sqlite3
```

원본 파일 보관은 `--source "원본.hwpx"`, 프로젝트 연결은 `--project-id ID --project-name "프로젝트 이름"`으로 선택할 수 있습니다. 저장된 JSON의 이미지 경로가 현재 위치와 다르면 `--asset-root apps/documents_daeung/output/images`를 지정합니다. 실행 중인 DB의 백업에는 SQLite 백업 API를 사용합니다.

기본 DB 경로는 `apps/documents_daeung/documents.sqlite3`입니다. **초기 재처리 기록:** 기존 산출물과 DB를 비운 뒤 `doc/`의 HWPX 원본 5개를 파서 v2.1.1로 다시 처리했습니다. 당시 DB에는 파싱 JSON 5건, 페이지 387건, 블록 11,518건, 이미지 BLOB 10개, 원본 파일 BLOB 5개가 있었으며 파싱 경고는 0건이었습니다. 바이너리가 포함된 DB는 `.gitignore`로 Git 추적에서 제외합니다.

페이지별 SQLite 조회 앱은 다음과 같이 실행합니다. 사이드바에서 제안요청서 HWPX를 등록하면 파싱 JSON·이미지·원본 파일이 SQLite에 저장됩니다. **기준 자료 삭제** 메뉴에서 선택한 문서와 파싱·요구사항·평가기준 결과를 삭제할 수 있습니다. 저장된 원본은 선택한 쪽을 SVG로 렌더링하고, 별도 탭에서 JSON의 문단·표·이미지를 확인합니다. **제안 요구사항** 탭은 사업의 주요 정리, 요구사항 목록 전체, 세부내역을 나누어 보여줍니다. 추출 시 문서의 모든 배치를 검사하며 목록·세부내역은 파싱 원문을 보존합니다. 독립된 짧은 제목·구절만 제외하고 한 줄 요구사항 문장과 표의 셀은 유지합니다. 여러 쪽에 걸친 표의 행별 위치는 추출 JSON만으로 확정할 수 없으므로 원본 페이지에서 확인합니다.

```sh
.venv/bin/python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
```

CLI로 요구사항을 추출할 때는 문서 ID 또는 유일한 파일명 일부를 지정합니다. `.env` 또는 환경변수의 `OPENAI_API_KEY`를 사용하며, 저장된 결과가 있으면 API를 다시 호출하지 않습니다. `--force`를 주면 재추출합니다.

```sh
.venv/bin/python -m apps.documents_daeung.step3_ai_requirements_SQLite --filename '특허 빅데이터'
```

**구현 상태:** 파싱 JSON·이미지·원본 HWPX, 요구사항, 정성적 평가기준의 저장·조회·삭제는 SQLite로 연결했습니다. 기존 외부 DB 데이터의 자동 이전 기능은 포함하지 않습니다.

## 3. 실행

파서 CLI는 JSON을 출력하고 기본 SQLite 파일에 원본 HWPX와 파싱 결과를 저장합니다. `--no-save`를 주면 JSON만 생성합니다.

```sh
.venv/bin/python apps/documents_daeung/step1_parser_hwpx.py "원본.hwpx"
.venv/bin/python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
```

앱의 사이드바에서 HWPX를 등록하고 저장 문서를 선택합니다. **기준 자료 삭제**는 선택 문서의 원본·파싱·AI 결과를 지우며 다른 문서가 참조하는 이미지 BLOB은 유지합니다. **제안 요구사항** 탭에서 요구사항을 추출한 뒤 **정성적 평가기준** 탭에서 기준표를 생성합니다. AI 호출에는 `.env` 또는 환경변수의 `OPENAI_API_KEY`가 필요합니다. 저장된 결과를 다시 열 때는 API를 호출하지 않습니다.

CLI에서도 문서 ID를 지정해 요구사항·평가기준을 생성할 수 있습니다.

```sh
.venv/bin/python -m apps.documents_daeung.step3_ai_requirements_SQLite --document-id '<문서 ID>'
.venv/bin/python -m apps.documents_daeung.step4_ai_criteria --document-id '<문서 ID>'
```

## 4. 확인

```sh
.venv/bin/python -m unittest discover -s apps/documents_daeung/tests -p 'test_*.py'
```

## 5. 현행 구현 추가 기록 (2026-10-12)

- 현재 Streamlit 실행 파일은 [streamlit_parser_test_page.py](streamlit_parser_test_page.py)입니다. 이전 `streamlit_parser_test.py`, `streamlit_parser_test2.py` 실행 경로는 현재 작업 트리에 없습니다. 앱의 탭은 **원본 페이지**, **추출 내용**, **제안 요구사항**, **정성적 평가기준**입니다.
- 사이드바에서 최대 50 MB의 HWPX를 등록하면 파싱 JSON, 추출 이미지, 원본 파일을 SQLite에 저장합니다. 선택 문서를 삭제하면 관련 파싱 버전과 AI 결과를 삭제하며, 다른 문서가 참조하는 이미지 BLOB은 유지합니다.
- 원본 페이지는 `source_files`의 원본 BLOB에서 요청한 물리 쪽을 SVG로 렌더링합니다. 원본 BLOB이 없으면 원본 화면 대신 안내가 표시되므로 **추출 내용** 탭에서 저장된 JSON 블록을 확인합니다. 여러 쪽에 걸친 표의 행별 위치는 파싱 블록만으로 확정하지 않습니다.
- 요구사항 결과는 `business_summary`, `requirement_list`, `details`로 구성합니다. 상세 항목의 출처 페이지가 파싱 결과에 있으면 쪽번호를 표시하고, 없으면 생략합니다. 짧은 제목·구절은 독립 항목에서 제외하되 한 줄짜리 요구사항 문장과 표 셀은 유지합니다.
- `projects`와 `project_documents` 테이블은 프로젝트와 문서의 연결을 지원합니다. 현재 Streamlit 화면에는 프로젝트 관리 UI가 없으며, 프로젝트별 3~5개 제한·역할·순서·통합 분석 결과 저장도 구현되지 않았습니다.
- `requirements_core.py`에 있던 공통 블록 처리 함수는 `step3_ai_requirements_SQLite.py`에 통합했습니다. 이전 `step3_ai_requirements.py`와 MongoDB 저장 모듈은 제거됐습니다. 평가기준은 요구사항 결과를 먼저 저장한 뒤 생성하며, `criteria_results` 테이블은 첫 평가기준 저장 때 만들어집니다.

저장소 루트에서 의존성을 설치하고 현재 앱을 실행하는 명령은 다음과 같습니다.

```sh
.venv/bin/python -m pip install -r apps/documents_daeung/requirements.txt
.venv/bin/python -m streamlit run apps/documents_daeung/streamlit_parser_test_page.py
```

**DB 확인 기록(2026-10-12):** 읽기 전용 조회에서 문서 6건, 파싱 버전 6건(파서 2.1.1), 페이지 499건, 블록 15,224건, 이미지 BLOB 14건, 원본 BLOB 6건, 요구사항 결과 5건을 확인했습니다. 프로젝트 연결은 0건이고 평가기준 테이블은 아직 생성되지 않았습니다. 이 수치는 업로드·삭제·재분석에 따라 바뀝니다.

## 부록. 이전 MongoDB 구현 기록

이하는 이전 Git README에 있던 로컬 산출물·MongoDB 저장·옛 Streamlit 앱·요구사항·평가기준 설명을 기록으로 옮긴 것입니다. **현재 실행 절차가 아닙니다.** 명령과 링크는 당시 경로이므로 지금은 작동하지 않을 수 있습니다.

#### 로컬 산출물

```text
output/
├─ json/<원본 SHA256>.json              # Streamlit 업로드 파싱 결과
├─ uploads/<원본 SHA256>/<파일명>       # Streamlit이 보관하는 원본
├─ images/<원본 SHA256>/<이미지 SHA256>.<확장자>  # HWPX에서 추출한 그림
└─ page_previews/<원본 SHA256>/         # 페이지별 SVG 미리보기 캐시
```

CLI 기본 JSON 경로는 `output/json/parsed.json`입니다.  이미지 출력은 `images/<원본 SHA256>/`에 저장됩니다.

### 2. 저장 구조 — `step2_hwpx_storage.py`

#### 저장 흐름

1. 파싱 결과의 정렬된 JSON을 해시해 `revision`을 계산합니다. 같은 결과의 재실행은 같은 revision을 사용합니다.
2. 원본(선택 사항)과 추출 이미지를 SHA256 기준으로 GridFS `hwpx_files`에 저장합니다. 저장 전 파일 내용의 해시를 다시 검사합니다.
3. 블록·자산·청크를 각각 최대 500건 단위의 upsert로 저장하고, revision별 저장 건수를 확인합니다.
4. 모든 저장 및 건수 검증이 성공한 뒤에만 `Request`의 `active_revision`을 새 revision으로 바꿉니다.

따라서 저장 도중 실패해 보조 컬렉션에 일부 레코드가 남더라도 `Request.active_revision`을 통해 공개되지 않습니다. 조회 시에는 반드시 문서의 활성 revision을 함께 조건으로 사용합니다. 과거 revision의 자동 정리는 하지 않습니다.

#### MongoDB 컬렉션

| 컬렉션                                      | 저장 내용                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Request`                                 | 문서 메타데이터와 활성 revision, 페이지·경고·건수, 전체`blocks` 및 `assets`  |
| `hwpx_blocks`                             | 문단·표·그림 블록별 레코드. 문서 순서 조회 인덱스 포함                           |
| `hwpx_assets`                             | 이미지 자산 메타데이터 및 GridFS 참조                                              |
| `hwpx_chunks`                             | 검색용 텍스트 청크와 원본 블록/셀 참조. 임베딩은 생성하지 않음                     |
| `RequestRequirements`                     | 원본 문서 ID·파싱 버전과 연결된 요구사항 추출 결과, 출처 블록, 모델·토큰 사용량  |
| `RequestCriteria`                         | 요구사항·참고 서식 버전에 연결된 정성적 평가기준표, 항목·배점, 모델·토큰 사용량 |
| `hwpx_files.files`, `hwpx_files.chunks` | GridFS 바이너리. 이미지와 선택적으로 저장한 원본 파일                              |

블록·자산·청크 레코드의 `_id`는 `{document_id}:{revision}:{block_id|asset_id|chunk_id}` 형태입니다. `Request._id`는 원본 `document_id`입니다. `Request`에는 전체 문서를 바로 열 수 있도록 블록과 자산이 함께 있고, 보조 컬렉션에는 개별 조회·검색을 위한 정규화된 사본이 있습니다.

#### 검색용 청크

`make_chunks()`는 문단과 표의 각 행을 검색 단위로 만듭니다. 셀 내부 문단은 표 행에 포함되므로 별도 중복 청크를 만들지 않습니다. 긴 텍스트는 줄바꿈이나 공백 경계를 우선해 최대 2,000자 조각으로 나누며, `source_refs`에 블록 ID·셀 ID·문자 범위를 기록합니다. 임베딩, OCR, 외부 AI API 호출은 수행하지 않습니다.

단일 MongoDB BSON 레코드가 15 MiB 이상이면 DB 연결·쓰기 전에 중단합니다. 원본 파일은 기본적으로 GridFS에 저장하지 않으며, 파서 CLI의 `--store-source` 선택 시에만 함께 저장합니다. 이미지 바이너리는 추출 자산이 있으면 저장합니다.

### 3. Streamlit 앱 구조 — `streamlit_main.py`

- **등록:** HWPX 업로드 → 확장자·크기·파일 형식 검사 → 원본 해시별 `output/uploads/` 보관 → 파서 자식 프로세스 실행 → JSON을 `output/json/`에 저장 → MongoDB 저장.
- **저장 재시도:** 파싱이 끝난 뒤 DB 저장에 실패하면 파싱 결과를 세션 상태에 보관하고, 재시도 또는 JSON 다운로드를 제공합니다.
- **이력:** `Request`에서 저장 문서를 최근 순으로 조회하고 문서를 열거나 삭제할 수 있습니다.
- **상세 보기:** 페이지별 문서 보기, 표 보기, 이미지 보기, JSON 다운로드를 제공합니다. 본문 문자열은 HTML escape 처리 후 렌더링합니다.
- **문서별 탭:** `제안요청서`에서 전체 문서를, `제안 요구사항`에서 총괄표·목록표와 세부내역을, `정성적 평가기준`에서 생성된 평가기준표를 확인합니다. 각 생성 버튼을 눌렀을 때만 OpenAI API를 호출하며 저장 결과를 다시 열 때는 호출하지 않습니다.
- **원본 미리보기:** 원본 파일이 로컬 업로드 폴더나 GridFS에 있으면 페이지 미리보기를 생성·재사용합니다. 원본이 없으면 저장된 블록으로 대체 표시하되 페이지별 정확한 배치는 보장할 수 없습니다.

### 4. `streamlit_main.py`의 미리보기 작업자 모드

`streamlit_main.py --page-preview SOURCE --output OUTPUT`으로 실행합니다. Streamlit 본체에서 한글 렌더러를 직접 계속 보유하지 않도록 별도 Python 프로세스에서 실행되는 작업자입니다. 파서의 페이지 매핑·인쇄 쪽번호 보정 로직을 이용해 원본을 열고, 각 물리 페이지를 SVG로 렌더링해 다음 구조의 JSON을 반환합니다.

- `source_sha256`: 입력 원본 검증용 해시
- `pages`: 물리 페이지와 인쇄 쪽번호 메타데이터
- `svgs`: 물리 페이지 번호를 키로 하는 SVG 문자열

렌더링된 SVG에 인쇄 쪽번호가 이미 포함된 경우 그 텍스트를 제거합니다. Streamlit이 페이지 바깥쪽에 별도 쪽번호 표시를 하기 때문입니다. 캐시 키에는 원본 해시와 작업자·파서·쪽번호 보정 파일 등의 해시가 반영되어 코드나 설정이 바뀌면 새 미리보기를 생성합니다.

### 실행 및 설정

저장소 루트에서 의존성을 설치하고 앱을 실행합니다.

```sh
.venv/bin/python -m pip install -r apps/documents_daeung/requirements.txt
.venv/bin/python -m streamlit run apps/documents_daeung/streamlit_main.py
```

`apps/documents_daeung` 폴더에서 실행할 때는 `../../.venv/bin/python -m streamlit run streamlit_main.py`를 사용합니다. 설정 파일은 이 폴더의 `.env`를 우선 사용하고, 없으면 저장소 루트의 `.env`를 읽습니다.

#### MongoDB 연결 설정

저장과 Streamlit 조회는 `step2_hwpx_storage.py`의 `mongo_settings()`를 통해 MongoDB URI를 가져옵니다. 우선순위는 `MONGODB_URI` → `MONGO_URI` → `client_db`이며, 같은 이름의 값이 있으면 프로세스 환경변수가 `.env` 파일 값보다 우선합니다.

- **로컬 실행:** 프로젝트 루트의 `.env` 파일에 `MONGODB_URI`를 설정할 수 있습니다. `python-dotenv`가 읽으므로 값의 따옴표를 사용할 수 있습니다.
- **웹 배포:**  인증정보를 포함한 전체 접속 URI를 `MONGODB_URI` 하나에 지정합니다.

URI 형식은 다음과 같습니다.

```text
mongodb://<사용자명>:<URL-인코딩된-비밀번호>@<호스트>:<포트>/<데이터베이스>?authSource=<인증-DB>
```

### 5. 요구사항 원문 추출 — `step3_ai_requirements.py`

프로젝트 `.env` 또는 환경변수에 `OPENAI_API_KEY`를 설정합니다. 환경변수가 우선하며, 키는 화면·로그·추출 결과에 저장하지 않습니다. 기본 모델은 `gpt-4o`입니다. (`gpt-4o-mini로는 충분한 결과도출 불가`)

1. DB `Request`의 현재 `active_revision`에 해당하는 파싱 JSON을 읽습니다.
2. 문서 전체의 문단·표를 비용을 줄인 JSON으로 나누어 보냅니다. 중복 셀 문단·스타일·이미지 바이너리는 제외하며, 긴 블록도 생략 없이 분할합니다. 배치 경계의 문맥은 겹쳐 제공합니다.
3. LLM은 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)로 총괄표·목록표와 세부내역에 해당하는 **기존 블록 ID만** 반환합니다. 항목명·필드명을 고정하지 않습니다.
4. 프로그램이 해당 ID의 원본 블록과 하위 문단·표·이미지를 복사합니다. 셀 텍스트, 문단, 줄바꿈, 병합, 순서, 출처 페이지를 그대로 보존합니다. 목록표와 상세표의 표현이 달라도 맞추거나 요약하지 않습니다.
5. 출처·원문 동일성을 검증하고 `RequestRequirements`에 저장합니다. 원래 `Request`나 파싱 블록은 수정하지 않습니다. 결과는 문서 ID, 원본 revision, 추출기 버전, 모델별로 재사용하며 재파싱 후에는 이전 결과를 표시하지 않습니다. 문서를 삭제하면 연결된 요구사항·평가기준 결과도 삭제됩니다.

화면 사용: 저장 이력에서 문서 열기 → **제안 요구사항** → **제안 요구사항 추출**. 이후 `총괄표`와 `세부내역` 하위 탭에서 확인하거나 별도의 JSON으로 다운로드합니다. **다시 추출** 버튼은 API를 새로 호출합니다.

CLI에서도 실행할 수 있습니다. 파일명은 일부 일치와 한글 NFC/NFD를 지원하며, 여러 문서가 검색되면 `--document-id`를 사용합니다.

```sh
# 추출·검증 후 원본 문서에 연결해 저장
.venv/bin/python apps/documents_daeung/step3_ai_requirements.py --filename '특허 빅데이터' --save --output apps/documents_daeung/output/requirements.json

# 특정 문서 재추출 (--force 사용 시 새 API 비용 발생)
.venv/bin/python apps/documents_daeung/step3_ai_requirements.py --document-id '<문서 ID>' --save --force
```

`--save`를 생략하면 DB에 쓰지 않습니다. 저장된 결과가 없으면 API 추출은 수행합니다. JSON에는 `summary`, `details` 각각의 `block_ids`와 원문 `blocks`, `document_id`, `source_revision`, 원문 해시, 추출 시각, `usage`, `warnings`가 들어 있습니다.

원문 보존은 **기존 파싱 JSON 기준**입니다. 기존 파서의 오탈자·수식 문자열도 유지하며 이미지 속 문자는 새로 OCR하지 않습니다. 총괄표/세부내역이 없거나 목록의 요구사항 번호가 세부내역에서 확인되지 않으면 `needs_review`로 표시합니다. 출처가 맞지 않는 AI 응답이나 실패한 배치가 있으면 부분 결과를 저장하지 않습니다. 원문 동일성 검증은 자동으로 수행하지만, 새로운 문서 양식에서 모든 요구사항을 선택했는지는 사용자 확인이 필요할 수 있습니다.

### 6. 정성적 평가기준표 생성 — `step4_ai_criteria.py`

제안요청서 상세 보기의 **정성적 평가기준** 탭에서 생성합니다. 먼저 **제안 요구사항** 탭에서 요구사항을 추출·저장해야 합니다. GPT-4o가 총괄표와 세부내역을 기준표 형식의 JSON으로 작성하며, 화면에서는 제안 요구사항과 같은 문서 스타일로 렌더링합니다.

1. 현재 제안요청서에서 정성적 평가기준표를 찾으면 그 표의 평가부문·평가항목·배점을 우선 사용합니다. 없으면 [doc/ai_criteria.md](doc/ai_criteria.md)의 평가기준·평가요소 예시를 기본 서식으로 삼습니다.
2. JSON에는 `evaluation_division`, `evaluation_item`, `evaluation_criteria`, `evaluation_elements`, `score`를 포함합니다. 기존 요청서의 고정 항목·배점은 바꾸지 않고, 평가기준과 요소는 해당 제안요구사항에 맞춰 작성합니다.
3. 누락·중복 항목, 빈 평가기준, 총 배점을 검증합니다. 결과는 `RequestCriteria`에 원본 문서 revision, 요구사항 결과 ID, 사용 기준표 버전, 모델 버전을 연결해 저장합니다.
4. 요구사항 또는 기준표 버전이 바뀌면 이전 결과를 재사용하지 않습니다. JSON을 다운로드할 수 있고 화면에서는 문서형 표로 확인할 수 있습니다.

CLI에서는 다음과 같이 실행할 수 있습니다.

```sh
.venv/bin/python apps/documents_daeung/step4_ai_criteria.py --document-id '<문서 ID>' --save --output apps/documents_daeung/output/criteria.json
```

`--save`를 생략하면 결과를 저장하지 않습니다. `--force`는 저장 결과가 있어도 GPT-4o를 다시 호출합니다.

관련 회귀 검증:

```sh
.venv/bin/python -m unittest discover -s apps/documents_daeung/tests -v
```

## 이후 변경 기록 (2026-10-12)

`requirements_core.py`에 있던 원문 블록 압축·선택·검증 함수는 [step3_ai_requirements_SQLite.py](step3_ai_requirements_SQLite.py)에 통합했습니다. 공통 파일은 삭제했으며, 요구사항 추출과 평가기준 생성은 위의 현행 CLI와 Streamlit 경로를 사용합니다. 이전 Markdown 검토용 `step1_hwpx_parser2.py`와 Streamlit 실행 파일 `streamlit_parser_test.py`, `streamlit_parser_test2.py`도 현재 작업 트리에는 없습니다. 위 부록의 MongoDB 파일명과 명령은 당시 구현 기록으로 유지합니다.
