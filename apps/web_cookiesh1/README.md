# 심사임당 웹 화면

메인 화면은 `src/screens/dept-admin/PM-01-projects/`의 사업 목록·등록·상세 화면입니다.
시안은 `v2/`에 보존되어 있습니다.

저장소 루트에서 PM-01 디렉터리 안의 복사본 문서 API를 실행합니다.

```bash
.venv/bin/python apps/web_cookiesh1/src/screens/dept-admin/PM-01-projects/step0_documents_api.py
```

별도 터미널에서 웹을 실행합니다.

```bash
cd apps/web_cookiesh1
npm install
npm run dev
```

http://127.0.0.1:5173/ → 새 사업 목록 화면으로 이동합니다.

- `npm run check`: 메인 JavaScript 구문 검사
- `npm run build`: 배포 파일 생성
- `npm run preview`: 빌드 결과 확인 (문서 API 별도 실행 필요)
- `/api`: `127.0.0.1:8000`, `/document-api`: `127.0.0.1:8001`로 프록시
- DB: `src/screens/dept-admin/projects.sqlite3`; 삭제 요약은 `src/screens/dept-admin/projects_delete.sqlite3`에 보관 (API만 접근, Git 및 정적 파일 제공에서 제외)

기능·API·실행 및 검증 방법: [PM-01 README](src/screens/dept-admin/PM-01-projects/README.md).
