# PM-01 · 사업 목록·등록·사업 정보

시안: `v2/사업담당자/PM-01-사업-목록-등록/시안/overview.html`, `projects.html`.
팀 버튼 ID: PRJ-01~05. 프런트엔드는 DB/SQL에 직접 접근하지 않고 문서 API만 호출한다.

## 실행

저장소 루트의 첫 번째 터미널:

```bash
.venv/bin/python apps/web_cookiesh1/src/screens/dept-admin/PM-01-projects/step0_documents_api.py
```

두 번째 터미널:

```bash
cd apps/web_cookiesh1
npm run dev
```

접속: http://127.0.0.1:5173/src/screens/dept-admin/PM-01-projects/

웹 서버의 `/`도 위 화면으로 이동한다. `?id=<사업 ID>`는 사업 정보,
`?id=<사업 ID>#documents`는 문서 등록 화면을 연다.
기존 시안은 `v2/`에 그대로 남아 있다.
같은 API 서버가 `/document-api`와 EV-03의 `/rfp-api` 경로를 모두 처리한다. EV-03 화면은
http://127.0.0.1:5173/src/screens/evaluator/EV-03-rfp/?project=<RFP 사업 ID> 에서 연다.

이 화면은 같은 디렉터리의 `index.html`, `main.js`, `styles.css`로 구동한다.
공통 레이아웃과 사업 단계 스타일도 `_shell.css`, `_steps.css`로 이 디렉터리에 복사해 두었으며,
시안 디렉터리의 파일에 의존하지 않는다.

## 구현 범위

- 사업 등록·목록·사업명/성명 검색·상태 필터·8건 단위 페이지 이동
- 사업 상세·수정, 삭제 요약 보관 및 원본 데이터 완전 삭제
- 평가 시작 후 사업명·소속·부서·평가일 변경 및 문서 교체·삭제 차단 (API에서도 검사)
- HWPX 선택/드롭 업로드, 50 MB 제한, 원본 다운로드, 파싱한 문단·표 조회
- 문서 화면의 업체별 제안서 등록 영역은 시안 UI만 표시하며, 업체·제안서 등록 기능은 연결되지 않음
- 업로드 후 AI 요구사항 추출 및 3초 간격 상태 조회 (추출 상태는 사업 정보 화면에서 확인)
- 추출 결과 상세 화면은 표시하지 않음
- 데스크톱/모바일 레이아웃, 키보드 입력과 기본 모달 포커스 제어

평가항목·위원·참석·결과 단계와 인증/부서별 접근 제어는 이 화면의 구현 범위에 포함하지 않는다.
연결되지 않은 단계는 비활성화되어 있다. 평가 상태는 저장된 API 값을 읽으며 이 화면에서는 바꾸지 않는다.
기존 문서 DB에 담당자 정보가 없는 사업은 `미등록`으로 표시하고 수정에서 입력한다.

## 문서 처리·저장

API는 이 디렉터리의 복사본 `step0_documents_api.py`로 실행하며,
파서·SQLite 저장·AI 처리 모듈도 같은 디렉터리의 복사본을 사용한다.
EV-03 읽기 전용 API 라우트와 SVG 렌더링은 이 서버 파일 안에서 함께 처리한다.

1. `step1_hwpx_parse_to_JSON.parse_hwpx`: 등록된 HWPX의 문단·표·이미지와 페이지 정보 파싱
2. `step2_hwpx_save_to_SQLite.save_to_sqlite`: 원본 파일 BLOB, 파싱 JSON, 블록·표·페이지 저장
3. `step3_ai_requirements_extract_to_SQLite.extract_and_save_requirements`: 근거 검증과 요구사항 추출 결과 저장
4. `step4_ai_criteria.py`: 평가기준 생성 결과 조회를 위한 저장 로직

API 기본 DB: `apps/web_cookiesh1/src/screens/dept-admin/projects.sqlite3`.
사업 기본값은 `projects`, 담당자·평가일은 `project_profiles`에 저장한다.
API 실행 중 DB 파일이 삭제되더라도 다음 사업 API 요청에서 빈 DB 스키마를 다시 만든다.
삭제한 DB의 기존 데이터는 복구되지 않으므로, 보존이 필요하면 먼저 백업해야 한다.
삭제 시 사업정보, 사업 상태, 세 가지 사업 요약과 삭제 사유만
`apps/web_cookiesh1/src/screens/dept-admin/projects_delete.sqlite3`에 보관한다.
원본 DB에서는 해당 사업과 연결된 HWPX, 파싱 내용, 요구사항·평가기준 결과를 삭제하며,
다른 사업에서도 참조 중인 공용 문서는 유지한다.
`step4_project_delete_to_SQLite.py`가 보관과 원본 정리를 한 SQLite 첨부 트랜잭션으로 처리한다.
`--database <경로>`를 지정하면 보관 DB는 같은 폴더의 `projects_delete.sqlite3`이다.
두 DB는 Git에서 제외되며 Vite 정적 파일 접근 및 파일 변경 감시에서도 제외된다.

기존 논리 삭제 사업의 일회성 이관은 저장소 루트에서 실행한다.
이 명령은 이관된 사업 자료를 원본 DB에서 완전히 삭제한다.

```bash
.venv/bin/python apps/web_cookiesh1/src/screens/dept-admin/PM-01-projects/step4_project_delete_to_SQLite.py \
  --database apps/web_cookiesh1/src/screens/dept-admin/projects.sqlite3
```

AI 설정은 화면 디렉터리 `.env`, `apps/documents_daeung/.env`, 저장소 루트 `.env` 순으로 사용한다.
`--no-ai` 실행 시 파일 저장·조회는 가능하고 AI 추출은 비활성화된다.

2026-10-16 서버 전환 시 기존 `apps/documents_daeung/documents_parse.sqlite3`의 데이터
(사업 2건, 업로드 이력 3건)를 SQLite backup으로 새 위치에 복사했다. 기존 파일은 보존했다.
새 환경에서 API 실행 시에는 지정 경로에 빈 DB를 생성하며 기존 DB를 자동 병합하지 않는다.

## API

모든 주소의 접두어는 `/document-api`이며 Vite가 `127.0.0.1:8001`로 전달한다.

| 메서드·경로 | 기능 |
|---|---|
| `GET /health` | 서버 및 AI 활성 상태 |
| `GET /projects` | 삭제되지 않은 사업 목록 |
| `GET /deleted-projects` | 삭제 요약 목록 |
| `GET /deleted-projects/{id}` | 삭제 요약 상세 (읽기 전용, 원본 문서 제외) |
| `POST /projects` | 사업 등록 |
| `GET /projects/{id}` | 사업 상세 |
| `PATCH /projects/{id}` | 사업 정보 수정 |
| `DELETE /projects/{id}` | `{ "reason": "삭제 사유" }`를 보관한 뒤 원본 자료 완전 삭제 |
| `GET, POST /projects/{id}/rfp` | 최근 제안요청서 / multipart `file` 업로드 |
| `GET /projects/{id}/download` | 최근 원본 다운로드 |
| `GET /projects/{id}/source` | 파싱 문단·표 조회 |
| `GET, POST /projects/{id}/requirements` | 추출 상태·결과 / 추출 재시도 |

사업 필드: `name`, `org`, `dept`, `pos`, `owner`, `tel`, `mail`, `date`.
`mail`, `date`만 선택 입력이다. 상태는 생성 시 `준비`이며 클라이언트가 임의로 변경할 수 없다.

## 검증

```bash
npm --prefix apps/web_cookiesh1 run check
npm --prefix apps/web_cookiesh1 run build
.venv/bin/python apps/web_cookiesh1/src/screens/dept-admin/PM-01-projects/step0_documents_api.py --help
.venv/bin/python -m unittest apps.documents_daeung.tests.test_project_delete apps.documents_daeung.tests.test_hwpx_parser apps.documents_daeung.tests.test_hwpx_storage apps.documents_daeung.tests.test_ai_sqlite -v
```

API 실행 확인은 복사본 진입점으로 하고, 기존 단위 테스트는 파서·SQLite 저장·분석 처리를 검증한다.
유료 외부 모델의 실제 응답 품질은 자동 테스트 범위에 포함하지 않는다.
