# `documents_parse.sqlite3` 테이블 정의서

## 1. 개요

| 항목 | 내용 |
| --- | --- |
| 데이터베이스 | `apps/documents_daeung/documents_parse.sqlite3` |
| DBMS | SQLite |
| 용도 | 제안요청서 원본, 파싱 스냅샷, 사업별 업로드 이력, AI 요구사항 추출 및 평가기준 생성 결과 저장 |
| 테이블 수 | 15개 |
| 확인 기준 | 현재 DB 파일의 SQLite 스키마 |

`TEXT` 형식의 JSON 열은 JSON 직렬화 문자열을 저장합니다. `BLOB` 열은 파일의 바이너리를 저장합니다. `PK`는 기본 키, `FK`는 외래 키, `NN`은 스키마에 명시된 `NOT NULL`입니다. SQLite의 `TEXT PRIMARY KEY` 중 일부는 별도의 `NOT NULL` 선언이 없으므로, 기본 키 표기와 `NN` 표기를 구분했습니다.

## 2. 테이블 목록

| 테이블 | 설명 |
| --- | --- |
| `documents` | 문서 식별 정보와 현재 활성 파싱 버전 |
| `parse_snapshots` | 문서별 파싱 버전과 원본 파싱 JSON |
| `pages` | 파싱 버전별 페이지 정보 |
| `blocks` | 파싱 버전별 문단·표 등 콘텐츠 블록 |
| `table_cells` | 표 블록의 셀 위치와 텍스트 |
| `assets` | 해시 기준 중복 제거된 이미지 등 바이너리 자산 |
| `snapshot_assets` | 파싱 스냅샷과 자산의 연결 및 자산 메타데이터 |
| `source_files` | SHA-256 해시로 식별하는 원본 파일 바이너리 |
| `projects` | 사업 기본 정보 |
| `project_documents` | 사업과 일반 문서의 연결 |
| `project_rfp_uploads` | 사업별 제안요청서 업로드 버전과 파싱 요약 |
| `requirement_jobs` | 업로드 버전별 요구사항 추출 작업 상태 |
| `requirement_results` | AI 요구사항 추출 결과 |
| `criteria_jobs` | 업로드 버전별 평가기준 생성 작업 상태 |
| `criteria_results` | AI 평가기준 초안 결과 |

## 3. 테이블별 정의

### 3.1 문서 및 파싱 데이터

#### `documents`

문서의 식별 정보와 현재 활성 파싱 버전을 관리합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `document_id` | TEXT |  | PK | 문서 식별자 |
| `filename` | TEXT | ✓ |  | 문서 파일명 |
| `source_sha256` | TEXT | ✓ |  | 원본 파일의 SHA-256 해시 |
| `active_revision` | TEXT | ✓ |  | 현재 활성 파싱 버전 |
| `created_at` | TEXT | ✓ |  | 레코드 생성 시각 |
| `updated_at` | TEXT | ✓ |  | 레코드 갱신 시각 |

#### `parse_snapshots`

문서의 파싱 버전별 메타데이터와 파싱 JSON 전체를 보관합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `document_id` | TEXT | ✓ | PK, FK | 문서 식별자. `documents.document_id` 참조 |
| `revision` | TEXT | ✓ | PK | 파싱 버전 |
| `parser_version` | TEXT |  |  | 파서 버전 |
| `schema_version` | TEXT |  |  | 파싱 JSON 스키마 버전 |
| `document_json` | TEXT | ✓ |  | 문서 파싱 결과 전체 JSON |
| `stored_at` | TEXT | ✓ |  | 스냅샷 저장 시각 |

기본 키: (`document_id`, `revision`)

#### `pages`

각 파싱 스냅샷의 페이지 번호와 페이지 메타데이터를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `document_id` | TEXT | ✓ | PK, FK | 문서 식별자. `parse_snapshots.document_id` 참조 |
| `revision` | TEXT | ✓ | PK, FK | 파싱 버전. `parse_snapshots.revision` 참조 |
| `physical_page_number` | INTEGER | ✓ | PK | 문서 물리 페이지 번호 |
| `page_number` | INTEGER |  |  | 문서에 표시된 쪽번호. 없을 수 있음 |
| `metadata_json` | TEXT | ✓ |  | 페이지 메타데이터 JSON |

기본 키: (`document_id`, `revision`, `physical_page_number`)

#### `blocks`

파싱된 콘텐츠 블록을 문서 내 순서와 상위 블록·셀 정보와 함께 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `document_id` | TEXT | ✓ | PK, FK | 문서 식별자. `parse_snapshots.document_id` 참조 |
| `revision` | TEXT | ✓ | PK, FK | 파싱 버전. `parse_snapshots.revision` 참조 |
| `block_id` | TEXT | ✓ | PK | 스냅샷 내 블록 식별자 |
| `order_index` | INTEGER | ✓ |  | 문서 내 블록 순서 |
| `type` | TEXT | ✓ |  | 블록 유형 |
| `parent_block_id` | TEXT |  |  | 상위 블록 식별자 |
| `parent_cell_id` | TEXT |  |  | 소속 표 셀 식별자 |
| `text` | TEXT |  |  | 블록에서 추출한 텍스트 |
| `physical_page_numbers_json` | TEXT | ✓ |  | 블록이 위치한 물리 페이지 번호 배열 JSON |
| `block_json` | TEXT | ✓ |  | 블록의 상세 파싱 JSON |

기본 키: (`document_id`, `revision`, `block_id`)

#### `table_cells`

표 블록의 셀별 행·열 위치, 병합 범위, 텍스트를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `document_id` | TEXT | ✓ | PK, FK | 문서 식별자. `blocks` 참조 |
| `revision` | TEXT | ✓ | PK, FK | 파싱 버전. `blocks` 참조 |
| `block_id` | TEXT | ✓ | PK, FK | 표 블록 식별자. `blocks` 참조 |
| `cell_id` | TEXT | ✓ | PK | 표 블록 내 셀 식별자 |
| `row_index` | INTEGER | ✓ |  | 셀의 행 위치 |
| `col_index` | INTEGER | ✓ |  | 셀의 열 위치 |
| `row_span` | INTEGER | ✓ |  | 셀이 차지하는 행 수 |
| `col_span` | INTEGER | ✓ |  | 셀이 차지하는 열 수 |
| `text` | TEXT | ✓ |  | 셀에서 추출한 텍스트 |

기본 키: (`document_id`, `revision`, `block_id`, `cell_id`)

#### `assets`

SHA-256 해시를 키로 이미지 등 바이너리 자산을 저장합니다. 동일 해시의 자산은 한 번만 보관할 수 있습니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `sha256` | TEXT |  | PK | 자산 바이너리의 SHA-256 해시 |
| `byte_size` | INTEGER | ✓ |  | 바이너리 크기(바이트) |
| `data` | BLOB | ✓ |  | 자산 바이너리 |

#### `snapshot_assets`

파싱 스냅샷과 자산을 연결하고 스냅샷 기준 자산 메타데이터를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `document_id` | TEXT | ✓ | PK, FK | 문서 식별자. `parse_snapshots` 참조 |
| `revision` | TEXT | ✓ | PK, FK | 파싱 버전. `parse_snapshots` 참조 |
| `asset_id` | TEXT | ✓ | PK | 스냅샷 내 자산 식별자 |
| `sha256` | TEXT | ✓ | FK | `assets.sha256` 참조 |
| `metadata_json` | TEXT | ✓ |  | 자산 메타데이터 JSON |

기본 키: (`document_id`, `revision`, `asset_id`)

#### `source_files`

업로드된 원본 문서 바이너리를 해시 기준으로 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `sha256` | TEXT |  | PK | 원본 파일의 SHA-256 해시 |
| `filename` | TEXT | ✓ |  | 원본 파일명 |
| `byte_size` | INTEGER | ✓ |  | 파일 크기(바이트) |
| `data` | BLOB | ✓ |  | 원본 파일 바이너리 |

### 3.2 사업 및 업로드 이력

#### `projects`

사업의 기본 정보를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `project_id` | TEXT |  | PK | 사업 식별자 |
| `name` | TEXT | ✓ |  | 사업명 |
| `created_at` | TEXT | ✓ |  | 사업 레코드 생성 시각 |

#### `project_documents`

사업에 연결된 문서와 연결 시각을 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `project_id` | TEXT | ✓ | PK, FK | 사업 식별자. `projects.project_id` 참조 |
| `document_id` | TEXT | ✓ | PK, FK | 문서 식별자. `documents.document_id` 참조 |
| `added_at` | TEXT | ✓ |  | 사업에 문서를 연결한 시각 |

기본 키: (`project_id`, `document_id`)

#### `project_rfp_uploads`

사업별 제안요청서 업로드 버전과 파일·파싱 요약 정보를 관리합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `project_id` | TEXT | ✓ | PK | 사업 식별자 |
| `revision` | INTEGER | ✓ | PK | 해당 사업의 업로드 버전 |
| `document_id` | TEXT | ✓ | FK | 연결된 문서. `documents.document_id` 참조 |
| `filename` | TEXT | ✓ |  | 업로드 파일명 |
| `byte_size` | INTEGER | ✓ |  | 파일 크기(바이트) |
| `uploaded_at` | TEXT | ✓ |  | 업로드 시각 |
| `page_count` | INTEGER | ✓ |  | 파싱된 페이지 수 |
| `block_count` | INTEGER | ✓ |  | 파싱된 블록 수 |
| `warning_count` | INTEGER | ✓ |  | 파싱 경고 수 |

기본 키: (`project_id`, `revision`)

### 3.3 AI 작업 및 결과

#### `requirement_jobs`

사업의 제안요청서 업로드 버전별 요구사항 추출 작업 상태를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `project_id` | TEXT | ✓ | PK, FK | 사업 식별자. 업로드 이력과 복합 참조 |
| `revision` | INTEGER | ✓ | PK, FK | 업로드 버전. 업로드 이력과 복합 참조 |
| `document_id` | TEXT | ✓ |  | 작업 대상 문서 식별자 |
| `status` | TEXT | ✓ |  | 작업 상태. 코드에서 `queued`, `running`, `done`, `failed` 사용 |
| `error` | TEXT |  |  | 실패 또는 상태 설명 |
| `updated_at` | TEXT | ✓ |  | 작업 상태 갱신 시각 |

기본 키: (`project_id`, `revision`)

#### `requirement_results`

파싱 스냅샷에 대한 AI 요구사항 추출 결과와 추출에 사용한 버전·모델 정보를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `result_id` | TEXT |  | PK | 요구사항 결과 식별자 |
| `document_id` | TEXT | ✓ | FK | 대상 문서 식별자. 파싱 스냅샷과 복합 참조 |
| `source_revision` | TEXT | ✓ | FK | 기준 파싱 버전. 파싱 스냅샷과 복합 참조 |
| `extractor_version` | TEXT | ✓ |  | 요구사항 추출기 버전 |
| `model` | TEXT | ✓ |  | 사용한 AI 모델 |
| `source_fingerprint` | TEXT | ✓ |  | 입력 원문 식별용 지문 |
| `status` | TEXT | ✓ |  | 요구사항 결과 상태 |
| `created_at` | TEXT | ✓ |  | 결과 생성 시각 |
| `result_json` | TEXT | ✓ |  | 추출 결과 JSON |

#### `criteria_jobs`

사업의 제안요청서 업로드 버전별 평가기준 생성 작업 상태를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `project_id` | TEXT | ✓ | PK, FK | 사업 식별자. 업로드 이력과 복합 참조 |
| `revision` | INTEGER | ✓ | PK, FK | 업로드 버전. 업로드 이력과 복합 참조 |
| `document_id` | TEXT | ✓ |  | 작업 대상 문서 식별자 |
| `status` | TEXT | ✓ |  | 작업 상태 |
| `error` | TEXT |  |  | 실패 또는 상태 설명 |
| `updated_at` | TEXT | ✓ |  | 작업 상태 갱신 시각 |

기본 키: (`project_id`, `revision`)

#### `criteria_results`

요구사항 결과를 참조하는 AI 평가기준 초안과 생성 기준 정보를 저장합니다.

| 컬럼 | 형식 | NN | 키 | 설명 |
| --- | --- |:---:| --- | --- |
| `result_id` | TEXT |  | PK | 평가기준 결과 식별자 |
| `document_id` | TEXT | ✓ | FK | 대상 문서 식별자. 파싱 스냅샷과 복합 참조 |
| `source_revision` | TEXT | ✓ | FK | 기준 파싱 버전. 파싱 스냅샷과 복합 참조 |
| `source_requirements_id` | TEXT | ✓ | FK | 기반 요구사항 결과. `requirement_results.result_id` 참조 |
| `reference_revision` | TEXT | ✓ |  | 기준으로 사용한 참조 버전 |
| `criteria_version` | TEXT | ✓ |  | 평가기준 생성 로직 버전 |
| `model` | TEXT | ✓ |  | 사용한 AI 모델 |
| `created_at` | TEXT | ✓ |  | 결과 생성 시각 |
| `result_json` | TEXT | ✓ |  | 평가기준 결과 JSON |

## 4. 외래 키 관계

| 자식 테이블 | 자식 컬럼 | 부모 테이블 | 부모 컬럼 |
| --- | --- | --- | --- |
| `parse_snapshots` | `document_id` | `documents` | `document_id` |
| `pages` | (`document_id`, `revision`) | `parse_snapshots` | (`document_id`, `revision`) |
| `blocks` | (`document_id`, `revision`) | `parse_snapshots` | (`document_id`, `revision`) |
| `table_cells` | (`document_id`, `revision`, `block_id`) | `blocks` | (`document_id`, `revision`, `block_id`) |
| `snapshot_assets` | (`document_id`, `revision`) | `parse_snapshots` | (`document_id`, `revision`) |
| `snapshot_assets` | `sha256` | `assets` | `sha256` |
| `project_documents` | `project_id` | `projects` | `project_id` |
| `project_documents` | `document_id` | `documents` | `document_id` |
| `project_rfp_uploads` | `document_id` | `documents` | `document_id` |
| `requirement_jobs` | (`project_id`, `revision`) | `project_rfp_uploads` | (`project_id`, `revision`) |
| `criteria_jobs` | (`project_id`, `revision`) | `project_rfp_uploads` | (`project_id`, `revision`) |
| `requirement_results` | (`document_id`, `source_revision`) | `parse_snapshots` | (`document_id`, `revision`) |
| `criteria_results` | (`document_id`, `source_revision`) | `parse_snapshots` | (`document_id`, `revision`) |
| `criteria_results` | `source_requirements_id` | `requirement_results` | `result_id` |

현재 정의된 외래 키의 삭제·갱신 동작은 별도 지정이 없어 SQLite 기본값인 `NO ACTION`입니다. 외래 키 제약 적용 여부는 각 연결에서 `PRAGMA foreign_keys` 설정에 따릅니다.

## 5. 명시적 인덱스

기본 키를 위해 SQLite가 자동 생성하는 인덱스는 아래 표에서 제외했습니다.

| 인덱스 | 테이블 | 컬럼 | 용도 |
| --- | --- | --- | --- |
| `idx_blocks_order` | `blocks` | (`document_id`, `revision`, `order_index`) | 문서·파싱 버전별 블록 순서 조회 |
| `idx_project_rfp_latest` | `project_rfp_uploads` | (`project_id`, `revision` DESC) | 사업의 최신 업로드 버전 조회 |
| `idx_requirement_source` | `requirement_results` | (`document_id`, `source_revision`) | 문서·파싱 버전에 따른 요구사항 결과 조회 |
| `idx_criteria_source` | `criteria_results` | (`document_id`, `source_revision`) | 문서·파싱 버전에 따른 평가기준 결과 조회 |

## 6. 참고

- 시간 값은 `TEXT` 열에 저장하며, 이 스키마는 날짜·시간 문자열의 형식 검증을 정의하지 않습니다.
- `result_json`, `document_json`, `block_json`, `metadata_json` 등 JSON 문자열은 별도 JSON 열 형식이 아닌 `TEXT`로 저장됩니다.
- `requirement_jobs`와 `criteria_jobs`는 `project_rfp_uploads`에 종속됩니다. AI 결과 테이블은 결과 JSON과 이를 생성한 문서 버전 정보를 보관합니다.
