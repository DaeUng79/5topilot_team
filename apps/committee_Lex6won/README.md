# 평가위원 등록·선정·배정 — 기능 모듈 v2

담당 **원준석 · Lex6won**. 2026-10-16 v2 설계를 반영한 Python 3.11 / SQLite 모듈이다. 기능 모듈은 프론트엔드와 독립적으로 호출하며, 현재 통합 브랜치는 `feat/lex6won-committee-v2-web`이다.

현재 실행 기준은 [원본 화면 연결·전체 흐름 검증 보고](../evaluations_u-jing/COMMITTEE_FLOW_FIX_2026-10-17.md)다. 저장소 루트의 `start_simsa_v2.cmd`를 실행하고 http://127.0.0.1:5190/ 에 접속한다. Git의 `web_cookiesh1/v2` 원본 디자인을 별도 바인딩으로 연결한다.

## 공유할 파일

- [초기 독립 웹 어댑터 기록](docs/WEB_V2_CONNECTION.md): 과거 개발 단계의 기록이며 현재 원본 디자인 통합 실행 안내는 아니다.

- [버튼·입출력·DB·팀 연계 인계서](docs/COMMITTEE_V2_HANDOFF.md)
- [입력 모델](committee_app/v2_contracts.py), [버튼 호출 진입점](committee_app/v2_gateway.py)
- [SQLite migration](migrations/20261016_lex_001.sql), [테이블 계약](contracts/committee_schema_v2.json)
- [합성자료 실행 예제](examples/v2_smoke.py), [기능 테스트](tests/test_modules_v2.py), [검증 기록](evidence/verification-v2.md)

## 파일과 기능명

| 파일 | 공개 함수 | 버튼 ID |
|---|---|---|
| candidate_pool.py | search_candidates, create_candidate, update_candidate, deactivate_candidate | COM-01,05,06,07 |
| candidate_import.py | download_template, preview_import, commit_import | COM-02,03,04 |
| committee_selection.py | save_rules, draw_shortlist, export_shortlist | DRAW-01~03 |
| committee_roster.py | list_nominees, add_nominee, save_contact, exclude_nominee, confirm_roster, export_roster | ROS-01~06 |
| candidate_pool.py | list_specialties | COM-CATALOG 보조 함수 |

공개 함수는 `async function(ctx, command, *, runtime)` 형식이다. 엑셀 미리보기만 `raw=bytes, password=""`를 추가한다. 파일은 ExportFile, 나머지는 dict DTO를 반환한다. 서버는 ModuleError의 code/message/status를 오류 응답으로 변환한다.

## v2 동작

- 부서 풀과 사업별 직접 등록을 분리하고 공통 `projects.id`를 사용한다. 사업·제안서 생성은 공통/문서 모듈에서 처리한다.
- 풀 추첨은 분야별 정원 합계 7~9명, 각 분야 3배수다. 복수분야 후보의 중복 배정을 막는 증대 경로 매칭을 사용한다. 난수 순서를 사용하지만 모든 가능한 조합의 균등 확률은 보장하지 않는다.
- DIRECT는 추첨 없이 등록·연락·확정한다. 예비위원 수는 규칙에서 설정한다.
- AVAILABLE인 활성 후보만 확정한다. 분야 정원, 중복, 예비 순위, 이름+전화 뒤4자리 충돌을 확인한다.
- 명단·배정·감사·outbox를 같은 트랜잭션으로 저장한다. 초청과 실제 참석·평가 권한은 구분한다.
- FK·부서 권한·version·요청 중복 방지·확정본 변경 방지를 적용한다. 전화/이메일/업로드 임시자료/중복요청 응답은 암호화한다.

## 실행·검증

기관 패키지 게이트를 거친 환경에서 실행한다. 런타임 의존성은 requirements.txt, 기존 개발 환경 버전은 requirements-dev.lock에 있다. `cryptography==50.0.2`를 직접 의존성으로 명시했다.

```powershell
cd C:\coding\5topilot_team\apps\committee_Lex6won
.\.venv\Scripts\python.exe examples/v2_smoke.py
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy
```

예제는 임시 DB와 합성 인물로 21명 등록→추첨→7명 연락 확인→확정→outbox/FK 검사를 수행한다. 실제 DB와 키는 건드리지 않는다.

실제 DB는 `Runtime.initialize()`로 생성한다. 공통 담당의 departments/admin_users/projects가 선행해야 한다. `development_parents=True`는 개발용 부모 스키마 생성 옵션이다. 실제 관리자·사업·분야 코드는 담당자가 공통 ID로 공급한다.

Runtime의 pii_key/lookup_key/auth_key는 서로 다른 32바이트 키다. 실제 환경에서는 비밀 저장소/환경 설정에서 계속 같은 키를 공급한다. 평가 모듈과 auth_key 및 auth_key_version만 공유한다. 키를 임의 교체하면 기존 자료 복호화·중복검사·로그인 조회가 깨진다. DB 바이너리·키·실제 자료는 Git에서 제외한다.

## 기존 코드와 후속 연결

기존 run.py, committee_app/main.py/service.py, web/는 보존했다. **기존 웹은 v1 흐름이며 새 v2 함수를 호출하지 않는다.** 사용법은 [LEGACY_README.md](LEGACY_README.md)에 보존했다. 현재 v2 HTTP 연결과 공통·평가 통합은 `evaluations_u-jing/web_api.py` 및 화면별 `binding.js`를 사용한다.

`v2_legacy.migrate_legacy_pool`은 원본을 읽기 전용으로 검사하고 명시적 부서/분야 매핑과 확인 해시를 받으면 후보를 새 DB로 이전한다. ID를 보존하고 충돌 시 전체 롤백한다. 비활성·불완전 후보는 검토 오류로 표시한다. 기존 사업·추첨·확정본은 v2 증빙으로 자동 전환하지 않는다. 이번 개발에서 실제 DB 이관은 실행하지 않았다.

현수환은 공통 API에서 버튼 함수를 호출하고 김유진은 인증 Context·평가 DB 수신기·참석·위원장 기능을 연결한다. `v2_handoff.pending_events/acknowledge_event`가 명단 전달을 지원한다. SENT는 수신자의 APPLIED/DUPLICATE ACK 확인 이후에만 설정한다. 재추첨·확정 취소·위원 교체·키 회전은 별도 revision 정책이 필요하며 현재는 명시적으로 거절한다.
