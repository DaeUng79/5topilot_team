# EV-03 · 코드

| 항목 | 내용 |
|---|---|
| 화면 기획 | [v2/위원/EV-03-제안요청서-보기/](../../../../v2/위원/EV-03-제안요청서-보기/) |
| 팀 버튼 ID | VIEW-01~03 · DOC-05 |
| 상태 | 코드 ✅ 구현됨 (읽기 전용) |

규칙: 이 폴더 파일 맨 위에 `// EV-03 · DOC-06 · DOC-02` 를 적는다. DB 경로나 SQL은 넣지 않고 API(기능 출력 모양)만 쓴다.

## 실행
1. 저장소 루트에서 `.venv/bin/python apps/web_cookiesh1/src/screens/dept-admin/PM-01-projects/step0_documents_api.py` 실행 (포트 8001). PM-01과 EV-03 API를 함께 제공한다.
2. `npm run dev` 후 `/src/screens/evaluator/EV-03-rfp/?project=<id>` 접속 (Vite가 `/rfp-api`를 8001로 프록시).
3. API를 실행하는 Python 환경에 `pyhwpxlib`와 `wasmtime`이 필요하다. 버전 기준은 `apps/.documents_daeung/requirements.txt`를 따른다.

## API
`GET /projects` · `/projects/{id}/rfp` (개요·쪽·목차) · `/projects/{id}/rfp/pages/{n}` · `/projects/{id}/rfp/pages/{n}/svg` (원본 쪽 SVG 렌더링) · `/projects/{id}/rfp/source` (원본 파일) · `/assets/{sha256}`

## 쪽번호·목차
- 문서 안의 "목 차" 표(제목·인쇄 쪽번호)를 물리 쪽으로 변환하고 제목이 그 쪽에 있는지 확인한다.
- 어긋나면 주변에서 제목으로 찾고(툴팁 표시), 못 찾으면 "확인 필요"(회색·클릭 불가)로 둔다.
- 목차 표가 없으면 로마숫자/번호 제목으로 목차를 만든다.

## 쪽 캡처
DB에 쪽 캡처 이미지는 없다. 원본 파일을 API에서 `pyhwpxlib`로 요청할 때 SVG 렌더링한다. 목차와 인쇄 쪽번호는 기존 파싱 결과를 사용하며, SVG 렌더링이 안 되는 경우 파싱된 문단·표·그림으로 대체 표시한다.
