# 평가위원 등록·3배수 선정

담당: **Lex6won**. Python 3.11 이상, FastAPI, SQLite, 로컬 HTML/JavaScript로 만든
독립 실행 모듈이다. 팀 공통 서버에 통합되거나 운영 배포된 서비스는 아니다.

## 구현된 업무

1. 부서 XLSX 업로드 → 암호 파일 처리 → 행별 미리보기 → DB 등록 확정.
2. 후보 수기 등록·보완·활성/비활성. 연락처 중복 및 구버전 수정 거절.
3. PDF 제안서 등록 시 프로젝트 자동 생성 → 분야·최종 정원 7/8/9명 선택.
4. 서버 난수로 21/24/27명 비복원 추첨. 모집단·해시·시각·실행자 보존.
5. 통화 상태·메모 저장 → 클릭으로 최종 7/8/9명과 별도 예비위원 3명 확정.
6. 최종 확정과 동시에 최종위원만 과제에 배정. 이름 + 휴대전화 또는 이메일로 테스트 로그인.

각 입력 작업은 별도 페이지다. 인력풀 목록 → 개별/엑셀 등록 → 프로젝트 목록 → 제안서 등록
→ 3배수 추첨 → 최종·예비위원 선정 → 로그인 준비 순서로 진행한다.
위원 로그인 화면에는 관리자 메뉴가 표시되지 않는다. 제안서 등록은 현재 PDF 8MB 이하이며,
내용 파싱·제안요청서 비교·채점은 팀 평가 모듈의 후속 범위다.

추첨 후 성명·연락처·분야 등이 바뀌면 통화 상태를 미연락으로 돌려 재확인한다.
추첨 당시 스냅샷은 유지하고 연락 화면은 현재 정보를 별도로 표시한다.
동시 추첨·연락 기록 수정·최종 확정은 트랜잭션과 version으로 보호한다.
재추첨·확정 취소·위원 교체는 팀에서 변경 정책을 정한 뒤 추가할 범위다.

## 실행

저장소 루트에서 아래 폴더로 이동한다. 새 설치는 기관 패키지 게이트를 먼저 실행한다.
검사 결과는 `evidence/package-gate.json`, Windows/Python 3.11 검증 버전은
`requirements-dev.lock`에 있다.

```powershell
cd apps/committee_Lex6won
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock
.\.venv\Scripts\python.exe run.py --local-admin
```

업무 앱: http://127.0.0.1:5187/ . 새로고침·서버 재실행 후 DB 자료가 유지된다.
`data/committee.db`는 로컬 업무 DB다. 원본 업로드 파일과 열기 암호는 저장하지 않는다.
성명·소속·분야가 없는 행은 보완 상태로 저장하고 추첨에서 제외한다.
휴대전화 누락은 통화·인증 보완 상태로 표시하며, 번호는 문자열로 저장한다.

합성자료로 시험하려면 별도 DB로 실행한다.

```powershell
.\.venv\Scripts\python.exe run.py --local-admin --demo-data --demo-auth --port 5188
```

시연 앱: http://127.0.0.1:5188/ . `data/demo.db`에 합성 후보 48명과 과제 1개를 만든다.
업무 DB에 시연 후보를 넣지 않고, 이미 있는 시연 기록도 덮어쓰지 않는다.
추첨 → 통화 결과 저장 → 정원만큼 체크 → 최종 확정 → 배정 순서로 시험한다.
위원 로그인 화면에는 최종위원의 합성 이름과 등록된 휴대전화 또는 이메일을 입력한다.
예비위원·미선정 후보는 로그인할 수 없다. 이전 버전 코드 확인 API는 호환용으로 유지한다.

`--local-admin`은 명시적 로컬 개발용 접속이며 운영 로그인/SSO가 아니다.
서버는 기본 127.0.0.1에 바인딩하고 Host·Origin·클라이언트 헤더를 제한한다.
공동 운영·공개 배포 전에는 팀 인증·권한·TLS·백업 정책을 연결해야 한다.

같은 내부망의 PC·태블릿에서 합성자료로 시험하려면 `--lan-origin`에 이 PC의 사설 IPv4와
실행 포트를 지정한다. 예시 IP는 실제 주소로 바꿔야 한다.

```powershell
.\.venv\Scripts\python.exe run.py --local-admin --demo-data --demo-auth --port 5188 --lan-origin http://192.168.1.10:5188
```

이 옵션을 명시한 경우에만 네트워크 인터페이스에 바인딩한다. 외부 기기는 위원 로그인만 가능하고,
관리자 세션 생성은 서버 PC의 localhost에서만 허용한다. 로그인 준비 화면에 내부망 주소가 표시된다.
실제 다른 기기·방화벽을 통한 접속은 아직 검증하지 않았다. 현재 실행 중인 앱은 로컬 접속이다.

## 본인인증과 평가 연결

사용자가 선택한 방식은 **등록된 휴대전화의 문자 코드 확인**이며, 현재는 테스트 범위다.
**실제 문자 발송 서비스는 미연결이다.** 기본 실행은 인증 요청에 503을 반환한다.
`--demo-auth`는 문자 발송 없이 이름과 등록 연락처를 대조하는 테스트 로그인이다.
이메일은 개별 등록/수정에서 입력한다. 원본 엑셀 14개 열에는 이메일이 없어 임의로 생성하지 않는다.
로그인 요청은 IP당 분당 10회 제한, 세션은 15분이며 과제에 묶인다.
공용 PC에서 로그인 실패·잘못된 입력·로그아웃 시 이전 위원 세션을 폐기한다.
`production_verified`는 항상 `false`다. 예비위원은 평가 권한을 받지 않는다.
기존 코드 API도 만료 5분·오입력 5회·재요청 60초·일회 사용 제한으로 유지한다.
실제 제공자의 검증 결과를 연결하기 전까지 운영 인증 완료가 아니다.
평가표·점수 화면 연결은 u-jing 담당 모듈과의 후속 통합 범위다.

## 부서 서식

14개 열: 연번, 소속, 직위, 성명, 생년월일, 근무 지역, 구분, 부서, 전문분야,
휴대전화, 비고, 1차 선정 여부, 최종 선정 여부, 발주사업명.

- 원문 분야를 보존하며 쉼표·세미콜론·줄바꿈으로 복수 분야를 나눈다.
- 검색·추첨에서 `AI`는 `인공지능`으로 정규화한다.
- 연번은 출처이며 후보 고유 ID는 별도 UUID다.
- 원본 선정 표시·사업명은 과거 기록으로 보존한다. 현재 과제의 배정 권한으로 적용하지 않는다.
- 수식·매크로·외부 XML 엔터티·손상/대용량 파일·중복 휴대전화는 거절한다.
- 미리보기 유효 시간은 30분이며 등록 확정은 전부 저장하거나 전부 취소한다.
- 같은 파일의 반복·동시 확정을 거절한다. 등록 파일을 재업로드하기보다 후보 보완을 사용한다.
- 실제 원본·DB·암호·인증 토큰은 Git에 올리지 않는다.

## API와 팀 인계

생성 계약은 `contracts/openapi.json`이다. 공통 접두어는 `/api/v1/committee`다.

| 경로 | 기능 |
| --- | --- |
| `GET/POST /candidates`, `PUT /candidates/{id}` | 후보 조회·등록·보완 |
| `POST /imports/preview`, `/imports/{id}/commit` | 엑셀 미리보기·원자적 확정 |
| `GET/POST /projects` | 선정용 과제·정원·분야 |
| `POST /proposals` | PDF 저장 및 프로젝트 자동 생성 |
| `GET /projects/{id}/proposal` | 관리자용 원본 다운로드 |
| `PUT /projects/{id}/criteria` | 추첨 전 위원 수·분야 설정 |
| `GET /projects/{id}/pool` | 모집단·부족 인원 |
| `GET/POST /projects/{id}/draw` | 추첨·기록 조회 |
| `PUT /projects/{id}/contacts/{candidate_id}` | 통화 기록 저장 |
| `POST /projects/{id}/finalize`, `/assign` | 최종 + 예비 3명 확정·최종위원 자동 배정 |
| `GET /auth/project`, `POST /auth/demo-login`, `/auth/logout` | 로그인 과제명·테스트 로그인·세션 폐기 |
| `POST /auth/request`, `/auth/verify`, `GET /auth/me` | 기본 차단/개발 코드·배정 확인 |
| `GET /audit` | 최근 작업 이력. 암호·코드·전화번호는 로그에 기록하지 않음 |

cookiesh1에는 후보·추첨·연락·확정 API를 전달한다. u-jing에는 배정된 위원 ID와
과제 ID를 전달하되 개발 인증을 운영 권한으로 사용하지 않는다.
선정용 과제 ID는 아직 팀 사업 ID와 연결되지 않았다. 통합 시 DaeUng79와
사업 ID 연결·인증 dependency·PostgreSQL migration을 합의하고 공통 PR로 제안한다.
팀 공통 웹·기존 파서·평가 코드·CI·공통 DB migration은 이 작업에서 수정하지 않았다.

## 검증

```powershell
.\.venv\Scripts\python.exe -m pytest -q --cov=committee_app --cov-report=term-missing
.\.venv\Scripts\python.exe -m ruff check committee_app run.py tests
.\.venv\Scripts\python.exe -m mypy
node --check web/app.js
```

실행 증거·보안 검사·`gg verify` 및 미실행 항목은 [개인 구현 기록](docs/COMMITTEE_IMPLEMENTATION.md)에 남긴다.
기존 1~4단계 점검은 [프로세스 검증 기록](docs/PROCESS_REVIEW.md)과
`evidence/verification-workflow-v2.json`을 따른다. DB revision 2는 기존 후보·프로젝트를 보존해 업그레이드한다.
