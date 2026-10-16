# 실행 방법

Node.js 22.12 이상(팀 기준 22 LTS), Python 3.13, Git을 사용한다.
최초 실행은 SQLite여서 Docker 없이 가능하다. 기존 Gemma/데스크톱 에이전트도 필요하지 않다.

## Windows 빠른 설정

저장소 루트 PowerShell에서:

```powershell
./scripts/setup.ps1
# python 명령이 없거나 Windows Store 별칭이면 실제 실행 경로 지정:
# ./scripts/setup.ps1 -PythonExe 'C:\Python313\python.exe'
```

가상환경 활성화 없이 실행할 수 있다. setup은 이미 존재하는 .env를 덮어쓰지 않는다.
기존 `apps/api/.env`가 있다면 DATABASE_URL이 개인 로컬 DB인지 먼저 확인한다.
setup은 그 연결로 migration과 seed를 실행하므로 공동 Supabase/운영 DB를 가리킨 상태에서 실행하지 않는다.
API 터미널:

```powershell
cd apps/api
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

다른 터미널에서 저장소 루트:

```powershell
npm run dev
```

- 새 프론트: http://127.0.0.1:5173
- API 문서: http://127.0.0.1:8000/docs
- 원본 ZIP 디자인: 루트에서 `npm run demo` → http://127.0.0.1:4174

## macOS/Linux 또는 수동 설정

```bash
npm ci
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.lock
python -m pip install --no-deps -e '.[dev]'
cp -n .env.example .env
python -m alembic upgrade head
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

다른 터미널의 루트에서 `npm run dev`. seed는 가상의 사업 1건과 후보 5명을 만들며 재실행해도
해당 ID를 중복 생성하거나 이미 존재하는 내용을 덮어쓰지 않는다.

## 팀 기능 확인

1. 사업 관리에서 샘플 사업을 선택하거나 새 사업을 만든다.
2. 평가위원 등록·추첨 → 활성 후보 모두 선택 → 자격 검토 확인 → 추첨.
3. 평가·제출·취합 → 개발용 평가위원 선택 → 21개 칸 작성 → 평가표 저장.
4. 본인 작성 확인 → 최종 제출. 입력칸이 잠기는지 확인한다.
5. 다른 선정위원도 제출하면 기술 평균이 표시된다.

사업당 추첨은 한 번이므로 반복 검증하려면 새 사업을 만든다. DB 파일을 지우지 않는다.
화면의 후보 선택 확인은 검토자의 확인 표시이며, 서버가 자격을 자동 심사하는 기능은 아직 없다.

## 개발용 인증

API는 `.env`의 `SIMSAIMDANG_DEMO_AUTH=true`일 때만 개발 토큰을 받는다.
Swagger 우상단 Authorize에는 관리자 `local-admin`, 평가위원 `local-evaluator:<선정된 후보ID>`를 쓴다.
앱은 이를 자동 사용한다. 임의 전환 가능한 개발용 신원이며 실제 사용자 인증이 아니다.
미설정 시 보호 API의 503은 의도한 동작이다. 실데이터/외부 공개에는 사용하지 않는다.

## PostgreSQL 검증

```bash
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml up -d
```

Windows에서는 `Copy-Item infra/.env.example infra/.env`를 사용한다.
`apps/api/.env`의 DATABASE_URL을 아래 값으로 바꾼 후 migration과 seed를 실행한다.

```text
postgresql+psycopg://simsa:simsa_local_only@localhost:5432/simsa
```

이 전환은 SQLite 데이터를 자동 이동하지 않는다. 팀 통합 DB는 별도로 구성한다.
로컬 Docker가 없어도 PR의 GitHub Actions에서 PostgreSQL 검증이 실행된다.

## 검증 명령

apps/api, 가상환경 Python 기준:

```bash
python -m pytest -q
python -m ruff check app tests migrations ../../scripts/export_openapi.py
python -m ruff format --check app tests migrations ../../scripts/export_openapi.py
python -m alembic check
python ../../scripts/export_openapi.py
```

Windows에서 활성화하지 않았으면 `python` 대신 `./.venv/Scripts/python.exe`를 사용한다.
루트:

```bash
npm run contracts:types
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E는 8000/5173 포트에 자체 서버와 별도 임시 SQLite DB를 만든다. 개발 서버를 먼저 종료한다.
설치된 Chrome으로 테스트하려면 PowerShell에서 `$env:PLAYWRIGHT_CHANNEL='chrome'` 후 실행한다.
pytest에서 TEST_DATABASE_URL을 지정하면 해당 DB에 테스트 레코드가 생성된다. 반드시 전용 테스트 DB를 쓴다.

## 의존성 업데이트

프론트는 package.json 변경 후 npm install, package-lock.json을 함께 커밋한다.
Python은 pyproject.toml 수정 후 새 가상환경에서 설치·검증하고 requirements-dev.lock의
해결 버전을 갱신한다. 팀원/CI는 잠금 파일을 먼저 설치한 뒤 --no-deps -e로 로컬 코드를 연결한다.
통합 담당자가 lock 변경 PR에서 Windows/Linux 양쪽을 확인한다.
