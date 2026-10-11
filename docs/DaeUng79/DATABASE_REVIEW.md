# 데이터베이스 재검토

검토일: 2026-10-11 · 결정 상태: **추천안, 전환 미실행**

[개인 개발 안내](README.md) · [코드·RAG 검토](CODE_REVIEW_AND_RAG.md) · [추진계획](ACTION_PLAN.md)

## 1. 추천 결론

위원회 운영까지 통합한다는 목표에는 **PostgreSQL + pgvector + 별도 파일 저장소**를 우선 추천한다. 사업·위원·배정·점수·제출·승인 간 관계를 업무 DB에서 관리하고, 문서의 가변 구조는 JSONB, 검색 벡터는 pgvector, 원본·이미지·SVG는 파일 저장소로 나누는 안이다. 이는 현재 요구에 대한 설계 판단이며 성능 비교 시험의 결론은 아니다.

당장 외부 MongoDB를 없애기보다 **현행 코드 실행 복구 → 저장소 인터페이스 분리 → 합성 데이터로 새 DB 검증 → 대조 조회 → 제한된 전환** 순서를 권한다. 단기 발표·시연이 우선이면 MongoDB를 유지해 읽기 전용 RAG를 검증하는 편이 전환 작업을 줄인다.

외부 DB 사용 여부와 DB 엔진 선택은 별개의 문제다. 새 DB를 관리형 서비스에 두면 계속 외부 DB를 쓰는 것이고, 내부망이 필요하면 내부 PostgreSQL·파일 저장소와 모델 추론 위치까지 함께 정해야 한다.

## 2. 현재 상태와 미확인 정보

확인한 것은 소스의 `Request`, `hwpx_blocks/assets/chunks`, `RequestRequirements`, `RequestCriteria`, GridFS 구조다. 실제 서버에 접속하지 않았다. 의존성 파일의 “wire version 7 서버 호환” 주석은 기존 환경의 단서일 뿐, 현재 서버 버전 확인 결과가 아니다.

| 전환 전 확인할 정보 | 결정에 주는 영향 |
| --- | --- |
| 서버 종류·버전·관리형 여부·검색 기능·백업/복구 체계 | MongoDB Vector Search 사용 가능 여부와 유지 비용 |
| 문서 수·평균/최대 페이지·파싱 JSON·원본/이미지 용량 | 메타데이터/본문 분리, 벡터·파일 저장 규모 |
| 동시 사용자·읽기/쓰기 빈도·업무 DB 확정 여부 | DB 자원·연결 풀·검색 전용 DB 필요성 |
| 내부망 여부·문서 외부 처리 허용 범위 | 관리형 DB·저장소·임베딩/생성 API 선택 |
| 운영 담당·월 예산·허용 중단·복구 목표 | 자체 운영과 관리형 선택, 전환·복구 절차 |

현재 값이 없으므로 가격·최대 처리량·절감률을 단정하지 않는다.

## 3. 후보 비교

| 안 | 적합한 경우 | 이 프로젝트에서의 장점 | 추가 부담·판단 |
| --- | --- | --- | --- |
| **PostgreSQL + pgvector + 파일 저장소** | 위원회 업무와 문서 검색을 통합 | 관계·제약·트랜잭션과 문서 JSON·벡터를 함께 관리 | MongoDB 어댑터 교체와 이관 검증 필요. 장기 우선 추천 |
| **Supabase의 PostgreSQL·pgvector·Storage** | 외부 서비스 사용 가능, 작은 팀의 공동 시연 | 위 구성의 관리형 후보; 스토리지 접근 정책 연계 가능 | 리전·비용·백업·접근 정책 확인 필요. 내부망 요구와 별도 검토 |
| **MongoDB 유지 + 지원되는 Vector Search** | 기존 서버가 지원하고 문서 처리 중심으로 빠르게 확장 | 기존 JSON·GridFS 코드 변경량 감소 | 현재 서버의 지원 여부 미확인. 위원회 관계·권한·동시성 설계는 여전히 필요 |
| **PostgreSQL + Qdrant + 파일 저장소** | 실측 결과 독립 검색 서비스가 필요 | Qdrant의 벡터·하이브리드 검색 기능 활용 | 서비스 수·권한 필터 동기화·삭제·복구 부담 증가. 초기 기본안으로는 보류 |

공식 근거: PostgreSQL은 JSONB를 지원하고, pgvector는 PostgreSQL에 벡터 검색을 추가한다. Supabase도 pgvector 기반 벡터 컬럼을 제공한다. Qdrant는 여러 검색 결과를 결합하는 하이브리드 쿼리를 제공한다. [PostgreSQL JSON](https://www.postgresql.org/docs/current/datatype-json.html), [pgvector](https://github.com/pgvector/pgvector), [Supabase vector columns](https://supabase.com/docs/guides/ai/vector-columns), [Qdrant hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/)

MongoDB Vector Search는 관리형뿐 아니라 자체 운영 경로도 공식 문서에 안내되어 있다. “MongoDB는 벡터 검색이 불가능하다”거나 “외부 MongoDB라면 바로 가능하다”는 판단은 모두 피해야 한다. 서버·검색 구성의 실제 지원 조건을 확인한다. [MongoDB Vector Search](https://www.mongodb.com/docs/vector-search/)

## 4. 권장 데이터 모델 초안

업무 테이블은 각 기능 담당자가 소유하고 DaeUng79는 문서·근거·검색 테이블과 연결 키를 조율한다. 아래는 설계안이며 테이블·마이그레이션이 생성된 상태가 아니다.

| 영역 | 제안 엔터티 | 핵심 키·내용 |
| --- | --- | --- |
| 사업 문서 | `project_documents` | 별도 문서 UUID, `project_id`, 업체/문서 종류, `content_id`, 활성 문서 버전, 공개 상태 |
| 원본 자산 | `file_assets` | 원본 SHA-256, 저장소 key, MIME·크기·무결성, 보관 상태. 해시는 업무 접근 권한이 아님 |
| 파싱 버전 | `document_revisions` | 업무 문서 ID·revision, 파서/스키마 버전, 원본 해시, 처리 상태·경고, 원본 JSON snapshot 참조 |
| 구조 블록 | `document_blocks` | 문서·revision·block ID 복합키, 부모·셀·순서·페이지, `payload jsonb` |
| 검색 청크 | `document_chunks` | 문서·revision·chunk ID·분할기 버전, 검색 텍스트·출처 JSON, 검색용 정규화 텍스트 |
| 임베딩 | `chunk_embeddings` | 청크 키·모델/버전·차원·텍스트 해시·벡터, 색인 상태. 서로 다른 벡터 공간을 섞지 않음 |
| 요구사항·기준 | `requirement_extractions`, `criteria_drafts`, `criteria_versions` | 입력 버전·모델·서식, 행별 근거, 생성 초안과 사람의 승인 이력 |
| 작업·감사 | `processing_jobs`, `audit_events` | 요청 중복 방지 키, 상태·재시도·오류 코드, 수행자·대상 버전·시각 |
| 위원회 업무 | 사업·후보·배정·평가·제출·서명 테이블 | 팀 담당 모듈과 연결; 승인된 기준 버전 및 사업 문서 참조 |

현재 `document_id=원본 해시`는 `content_id/source_sha256`로 보존하고, 새 사업 문서 UUID와 대응표를 둔다. 기존 인용 ID를 바로 버리지 않는다. 동일 파일의 물리 중복 제거와 사업별 접근 권한은 별도로 구현한다. 원본 SHA나 `asset_id`만 아는 요청으로 파일을 내려받게 하지 않는다.

JSONB에는 표·셀·스타일 등 가변 구조를 넣고, 권한·조인·정렬에 쓰는 `project_id`, `revision`, `order`, 상태는 별도 컬럼으로 둔다. JSONB 저장 형태를 원본 파일의 바이트 보존으로 간주하지 않는다. 원본은 파일 저장소와 해시로 검증한다. [PostgreSQL JSON 타입](https://www.postgresql.org/docs/current/datatype-json.html)

## 5. 원본·이미지·SVG 저장

현행 GridFS도 파일 저장 수단으로 유효하다. MongoDB 문서의 16 MiB 한계를 넘는 파일은 GridFS로 나눠 저장할 수 있지만, **현재 코드가 `Request`에 넣는 큰 `blocks` JSON 문제는 GridFS 사용만으로 해결되지 않는다.** 코드에는 그보다 보수적인 15 MiB 검사도 있다. [MongoDB GridFS](https://www.mongodb.com/docs/manual/core/gridfs/)

전환안에서는 원본·이미지·페이지 SVG를 비공개 파일 저장소에 넣고 DB에는 key·해시·크기·참조를 기록한다. 개발 단독 환경은 관리된 로컬 폴더, 공동 서비스는 접근 통제가 있는 객체 저장소를 후보로 삼는다. 원본이 필요할 때마다 개인 PC의 `output/uploads`에 의존하지 않도록 한다.

DB와 객체 저장소에는 단일 트랜잭션이 없으므로 `uploading → verified → ready` 상태를 사용한다. 해시·바이트 크기를 검증한 뒤 공개하고, 실패한 임시 자산은 재시도/유예 삭제한다. 삭제도 참조가 끊겼는지 확인한 후 처리한다. Supabase Storage를 쓰더라도 DB 정책만 켜면 끝나는 것이 아니라 스토리지 정책을 별도로 구성한다. [Storage 접근 통제](https://supabase.com/docs/guides/storage/security/access-control)

## 6. 검색·권한·인덱스

- 업무 문서·블록·청크·결과에 사업별 접근 조건을 일관되게 적용한다. PostgreSQL RLS를 쓰면 일반 접근을 행 단위로 제한할 수 있지만 테이블 소유자·슈퍼유저·`BYPASSRLS` 역할은 우회 가능하다. 서비스 계정 권한과 실제 사용자의 접근 조건을 시험한다. [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- 첫 pgvector 검증은 사업·활성 버전으로 제한한 **정확 검색**을 기준선으로 둔다. 데이터와 실측 지연이 커지면 HNSW를 비교한다. 근사 검색은 필터 때문에 원하는 개수보다 적게 반환할 수 있으므로 iterative scan·분할·후보 수를 함께 검증한다. [pgvector 필터링](https://github.com/pgvector/pgvector#filtering)
- 요구사항 ID는 별도 정규화 컬럼으로 정확 검색한다. 한국어 자연어 질문은 키워드·벡터 혼합을 실험한다. `pg_trgm`/기본 전문 검색을 한국어 형태소 분석 또는 BM25 완성품으로 가정하지 않는다. [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html), [전문 검색 설정](https://www.postgresql.org/docs/current/textsearch-configuration.html)
- 벡터 차원과 모델 버전을 설정·스키마로 고정하고 모델 변경 시 별도 색인으로 검증한다. 벡터 저장량은 float32 기준 대략 `청크 수 × 차원 × 4바이트`에 메타데이터·인덱스·복제·백업이 추가되는 방식으로 산정한다. 이는 비용 견적이 아닌 원시 용량 계산이다.

## 7. 안전하게 전환하는 순서

1. **현황 확보:** 접근 가능한 관리 도구로 실제 서버 버전·컬렉션 건수·용량·백업/복구·원본 보관 위치를 확인한다. 애플리케이션 자격증명을 문서에 적지 않는다.
2. **어댑터 경계:** `DocumentRepository`, `AssetStore`, `SearchIndex`의 입력·출력·오류 계약을 정의한다. 현행 MongoDB 구현을 첫 어댑터로 유지한다.
3. **합성 데이터 비교:** 10개 문서에서 원문 해시·블록/셀·페이지·활성 버전·요구사항·기준표를 새 구조로 옮기고 예상 결과와 대조한다.
4. **실데이터 사본 검증:** 허용된 환경에서 백업을 확보하고 ID 대응표를 생성한다. `Request`와 보조 컬렉션의 활성 버전, GridFS 파일, 개인 PC에만 있는 원본을 구분한다. 누락 파일은 성공으로 처리하지 않는다.
5. **읽기 대조:** 쓰기 기준 DB는 하나로 유지하고 새 DB를 대조 조회한다. 전체 건수·해시·인용·권한·검색 품질을 검증한다. 이중 쓰기를 도입한다면 재시도·전달 보장을 별도 설계한다.
6. **전환:** 쓰기 중단 구간 또는 검증된 변경분 동기화로 마지막 차이를 맞추고 기능 설정으로 읽기/쓰기 대상을 바꾼다. 허용 중단 시간은 사전 합의한다.
7. **복구:** 새 DB에 쓴 데이터가 있으면 단순 설정 복귀만으로 롤백하지 않는다. 변경 로그의 역반영·데이터 대조 후 복귀하거나 앞으로 수정하는 절차를 선택한다. 구 DB는 검증·보존 기간 전까지 삭제하지 않는다.

최종 선택은 동일 데이터·동시성에서 인용 정확성, 권한, 백업 복구, p95 검색 지연, 운영 부담을 비교한 뒤 확정한다. 현재 외부 MongoDB의 유지·업그레이드·전환 비용도 같은 기간으로 비교한다.
