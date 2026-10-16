# 위원 기능 모듈 v2 검증 기록

검증일: 2026-10-16 / Windows / Python 3.11.9 / 브랜치 feat/lex6won-committee-v2 / main beeb32a 기반, 미커밋 작업 파일.

**기능·정적 검증 통과. 기관 하네스와 보안 점검은 완료되지 않았으므로 최종 게이트 통과 또는 배포 승인으로 해석하지 않는다.**

| 항목 | 명령/범위 | 실제 결과 |
|---|---|---|
| 전체 회귀+v2 테스트 | 아래 pytest 명령 | **67 passed**, 1 warning, 16.64초, exit 0 |
| v2 커버리지 | 새 업무 4개 + v2 지원 6개 모듈 | **91.15%**, 870 statements / 77 missed, 기준70% 충족 |
| 정적 검사 | python -m ruff check . | All checks passed |
| 타입 검사 | python -m mypy | Success, 20 source files |
| 실제 모듈 호출 예제 | python examples/v2_smoke.py | 후보21, 추첨21, 정위원7, outbox1, PENDING, FK 정상 |
| 스키마 계약 | test_schema_fields_match_v2_contract | 20개 정의의 실제 SQLite 필드명과 v2 계약 대조 통과 |
| 기관 게이트 | node C:/coding/.vibecode-harness/bin/gg.mjs verify (저장소 루트) | exit1: 하네스 미초기화. 먼저 gg init 필요. **미통과** |
| 보안 점검 | vibecode-checker.scan_path, 담당 앱 전체, public-default-strict | 120초 tool timeout. 분석 결과 미수신. **판정 불가** |
| 추가 직접 의존성 | cryptography==50.0.2, check_package | checked_clean 관측. package-gate-v2.json 참조. 기관 승인과 구분 |
| 실제 프론트/평가 DB 통합 | 공통 API/수신기 연결 | 이번 기능 모듈 단계에서 미실행 |
| 실제 업무 DB migration | 로컬 data/committee.db 등 | 미실행·원본 보존 |
| Git 공유 | commit/push/PR | 사용자 요청에 따라 개인 포크 브랜치 → 원본 main PR로 공유. 실제 상태는 GitHub PR 기록 참조 |

## 재현

담당 앱 폴더의 기존 개발 가상환경에서 실행했다. 패키지 설치/버전 변경 없이 검증했다.

```powershell
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy
.\.venv\Scripts\python.exe examples/v2_smoke.py
.\.venv\Scripts\python.exe -m pytest -q --cov=candidate_pool --cov=candidate_import --cov=committee_selection --cov=committee_roster --cov=committee_app.v2_core --cov=committee_app.v2_contracts --cov=committee_app.v2_excel --cov=committee_app.v2_gateway --cov=committee_app.v2_handoff --cov=committee_app.v2_legacy --cov-report=term --cov-report=json:coverage.json --cov-fail-under=70
```

coverage.json은 로컬 생성 파일로 Git에서 제외한다. 커버리지는 새 v2 모듈 대상으로 계산했다. 기존35개 회귀 테스트와 v2의32개 테스트를 합쳐67개다. pytest 경고1개는 기존 FastAPI TestClient 경로의 Starlette httpx 사용 중단 예고이며 이번에 의존성 교체는 하지 않았다.

## 확인한 주요 실패 경로

- 부서 권한/계정 정지, 사업 이동 이후 중복 응답의 권한 재확인.
- 중복 요청 동일 결과, 같은 키·다른 본문 거절, 구버전 수정 거절, 동시 추첨 단일 결과.
- 7/8/9 정원 및 분야별3배수, 복수분야 매칭/중복 배제, 전체 매칭 불가능 시 롤백.
- 직접등록 후보의 부서 풀 제외, 정위원/예비 배정, 연락 최신 상태/제외/비활성 검사.
- 로그인 이름+뒤4자리 충돌 시 명단·배정·outbox 모두 미생성.
- 전화·이메일·미리보기 암호화, 잘못된 복호화키 거절, 엑셀 수식 문자열의 안전한 내보내기.
- 엑셀 행 오류/만료/등록 직전 중복 충돌 시 전체 롤백, 원본·열기 암호 비저장.
- 명단/배정 동결 trigger, FK 실제 위반 거절, 스키마 필드 계약 및 이미 적용된 DB 재초기화.
- roster.confirmed fixture의 payload/명단 해시, 타 부서 outbox 접근 차단, 잘못된 ACK 해시 거절.
- 기존 DB 접근 차단, 읽기 전용 후보 이전 시 원본 바이트 보존·ID 유지·잘못된 연락처 사전 보고.

스키마 불일치 검사는 실패하는 테스트를 먼저 실행해 DID NOT RAISE를 확인한 뒤 초기화 검증을 추가하고 같은 테스트의 통과를 확인했다. 최종 전체 테스트도 다시 실행했다.

## 남은 검증

저장소의 기관 하네스를 정상 구성한 뒤 gg verify와 Git 훅을 수행하고, 보안 도구 시간 초과를 해결하여 분석 결과를 받아야 한다. 그 결과와 공통 API/평가 수신기 통합 결과를 추가하기 전에는 운영 준비 완료로 표시하지 않는다. 다른 팀원이 작성할 수신기의 inbox/사본 반영은 이번 송신 모듈 테스트로 대신 검증했다고 주장하지 않는다.
