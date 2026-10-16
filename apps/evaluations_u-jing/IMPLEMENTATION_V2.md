> 원본 화면의 기존 버튼을 별도 binding으로 연결합니다. [화면별 연결 현황](DESIGN_CONNECTION_STATUS.md)과 [결과보고](RESULT_REPORT_2026-10-16.md)를 함께 확인하세요.

# 원준석·김유진 통합 구현 v2 — 2026-10-16

## 기준과 개발 범위

- 원격 `origin/main` 확인 기준: `5529862`. 기존 README에는 삭제된 React 앱 설명이 남아 있어 실제 v2 소스와 화면별 README를 함께 확인했다.
- 사용자 제공 `심사임당_v2_기능별_담당자_선정표.xlsx`: 기능 담당 선택란은 비어 있으므로 **문서상 담당(참고)** 열을 기준으로 삼았다. 김유진(제안)의 공통 기능도 포함했다. 사용자가 “참고 열 기준으로 공통 기능까지 포함”으로 확정한 범위다.
- 백업의 `diagrams_v2/index.html`, `AUTOPILOT_DEVELOPMENT_HANDOFF_V2.html` 및 같은 버전의 구조화 모델을 대조했다. 원본 경로·SHA256은 `contracts/actions_v2.json`에 기록했다.
- 73개 Action ID 중 원준석 16개, 김유진 평가 16개, 김유진 제안 공통 16개 = **48개 구현 범위**. 오대웅 25개는 외부 담당 연계 범위다.
- 화면은 23개 디렉터리이며 PM-01 목록/상세를 구별하면 엑셀의 24개 화면 항목에 대응한다.

## 소스와 DB를 저장하는 위치

| 대상 | 위치 | 책임 |
|---|---|---|
| 실행 진입점 | `apps/web_cookiesh1/index.html` | 통합 웹 |
| 화면별 연결 코드 | `apps/web_cookiesh1/src/screens/{entry,super-admin,dept-admin,evaluator}/화면ID/binding.js` | 원본 버튼·API 연결; PM-01 상세는 overview-binding.js |
| 공통 연결 | `apps/web_cookiesh1/src/bindings/`, `design_runtime.py` | 인증·API·원본 해시 검증·응답 스크립트 결합 |
| 위원 기능 원본 | `apps/committee_Lex6won/` | candidate_pool/import, committee_selection/roster |
| 관리자·사업·평가 기능 | `apps/evaluations_u-jing/*_service.py` | 설계의 함수 이름 유지 |
| HTTP 연결 | `apps/evaluations_u-jing/web_api.py` | 인증된 주체를 서비스에 전달 |
| DB 구조 | `apps/evaluations_u-jing/migrations/`, 기존 위원 migration | SQL·FK·제약 공유 |
| 실행 DB | `apps/evaluations_u-jing/data/original-demo-v2/admin.sqlite3`, `evaluation.sqlite3` | 실행 시 생성, Git 제외 |

**SQL과 SQLite 파일을 화면 폴더에 넣지 않는다.** 브라우저는 HTTP API를 호출하고 Python 서버가 DB를 연다. SQLite 파일끼리 Git merge하지 않는다. 소스·migration·계약·seed를 공유하고 각자 DB를 생성한다. 암호화 키 `keys.bin`을 DB와 함께 백업하되 Git에는 올리지 않는다.

## 기능 모듈

| Action | 모듈 | 핵심 함수 |
|---|---|---|
| AUTH-01~03 | auth_service.py | login_admin, login_evaluator, logout, authorize |
| ADM-01~05 | admin_service.py | search_admins, create_admin, update_admin, deactivate_admin, set_permissions |
| PRJ-01~07 | project_service.py | search_projects, create_project, update_project, archive_project, project_detail, save_vendor, archive_vendor |
| DASH-01 | dashboard_service.py | get_overview |
| COM-01~07 | 기존 candidate_pool.py / candidate_import.py | 검색·양식·미리보기·등록·수정·비활성 |
| DRAW-01~03 | 기존 committee_selection.py | save_rules, draw_shortlist, export_shortlist |
| ROS-01~06 | 기존 committee_roster.py | list_nominees, add_nominee, save_contact, exclude_nominee, confirm_roster, export_roster |
| ATT-00/05 | evaluation_service.py | prepare_session, open_session |
| ATT-01~04 | attendance_service.py | confirm_attendance, list_attendance, lock_participants, designate_chair |
| SCO-01~03/05 | evaluation_service.py | get_sheets, save_scores, review_scores, submit_evaluation |
| SCO-04 / RES-03 | signature_service.py | save_signature |
| RES-01/02/04/05 | result_service.py | get_results, aggregate_results, confirm_results, export_report |

설계의 URL은 제안 계약이다. 이 브랜치의 웹 운송 계층은 `POST /api/v2/actions/{Action-ID}`를 사용하며 함수 이름·Action ID·DB 이름은 유지한다. 성공 응답은 `data`, `meta`; 오류는 `error`이다. 요청에는 `X-Simsa-Client: v2-web`, 쓰기에는 `Idempotency-Key`를 보낸다. 브라우저의 actor_id/role을 인증 주체로 사용하지 않는다. 엑셀 업로드는 `/committee-v2/api/imports/preview` multipart이다.

## SQLite 구조와 연결

admin 22개 테이블 중 위원 11개 및 공통 감사·연계 테이블은 원준석 migration을 재사용한다. 공통 계정·사업·업체·세션은 김유진 migration에서 생성한다. evaluation 27개 테이블은 설계 모델의 컬럼·단일 FK·복합 FK를 사용한다. 모든 연결에 `PRAGMA foreign_keys=ON`을 적용한다. 제출·서명·집계 불변성과 평가 시작 후 참여자·업체 고정은 DB trigger로도 보강한다.

원본 화면에 있는 평가일·임시 비밀번호 변경·업체별 종합 의견을 저장하기 위해 추가 migration에 `project_evaluation_dates(project_id FK, evaluation_date, updated_at)`, `admin_password_requirements(admin_id FK, must_change)`, `score_sheet_opinions(sheet_id FK, opinion)`를 추가했다. 기존 설계 컬럼을 바꾸지 않는 확장이다. 업무 테이블은 총 52개(admin 24 + evaluation 28)이며 SQLite 내부 테이블과 migration 관리표는 별도다. 종합 의견도 서명 해시에 포함하며 제출 후 DB에서 변경을 차단한다.

원본 부서·계정 버튼에는 `department_service`의 ADM-DEPT-LIST/SAVE/STATE, ADM-RESTORE/RESET, AUTH-04를 연결했다. 임시 비밀번호는 최초 응답에서만 표시하고 변경 전 업무 API를 제한한다.

| 원본 DB | 발행 계약 | 수신 |
|---|---|---|
| admin | project.snapshot, admin.projection, vendor.snapshot | evaluation의 ref 테이블; documents 수신은 담당자 연결 대기 |
| admin | roster.confirmed | 명단 전체와 배정 전체를 evaluation에서 한 트랜잭션으로 수신 |
| documents | rfp.bound, criteria.approved, proposal.ready | `integration_contracts.apply_event(store, envelope, 'documents')` |
| evaluation | result.finalized | admin에서 사업 COMPLETED 처리 후 ACK |
| evaluation | 참석 현황 | ATT-02 읽기 API로 조회; admin에 참석 원본 복제 안 함 |

`integration_contracts.apply_event`는 내부 신뢰 어댑터용 Python 함수이며 외부 브라우저 수신 API로 노출하지 않았다. schema_version=2, event_id, aggregate_id/version, payload, payload_sha256을 검증한다. 부모가 없으면 PENDING_PARENT, 동일 이벤트는 DUPLICATE, 해시/내용 충돌은 거절한다. ACK 전 원본 outbox를 SENT로 바꾸지 않는다. 원본 변경과 발행은 동일 DB 트랜잭션이다. 공통 서버는 요청 시 미전송 이벤트를 다시 전달한다.

`rfp.bound`의 결합키 ID는 `digest({project_id, upload_revision, document_id, parse_revision})`이다. `criteria.approved`는 `id, project_id, approval_no, rfp_pin, status=APPROVED, approved_at, total_max_score, items, snapshot_sha256=digest(items)`를 받는다. 항목 필드는 `ref_approved_criteria_items`의 업무 필드와 같다. `proposal.ready`는 `proposal_upload_id, project_id, vendor_id, upload_revision, document_id, parse_revision, format`을 받는다. 해시는 키 재귀 정렬·UTF-8·공백 없는 JSON을 기준으로 계산한다.

오대웅 담당 source 파일과 문서 DB는 수정하지 않았다. documents 대상 outbox는 **PENDING 유지**가 정상이며 실제 문서 서비스가 반영하기 전 완료로 표시하지 않는다. 문서 샘플은 로컬 allowlist와 사업 권한으로 다운로드하며 외부 AI 호출은 없다. 가상 승인 평가표는 원문에서 실제 추출·승인된 결과가 아니다. `receive_document_snapshot`은 가상 자료 묶음을 넣는 테스트 보조 어댑터이며 표준 문서 이벤트는 위의 `apply_event`를 사용한다.

## 업무 규칙

1. 관리자 ID/PW와 평가위원 사업 ID+성명+뒤 4자리 로그인을 분리한다. 세션 토큰은 해시로 저장하고 권한 변경 시 세션을 회수한다.
2. 로그인과 참석 확인은 별개다. 초청 명단 → 본인 동의·참석 → 관리자 실제 참여자 확정 → 위원장 지정 → 평가 시작 순서다.
3. 정원은 7~9명. 운영 최소 인원은 관리자가 정책과 함께 명시적으로 확인한다. 3은 계산 하한일 뿐 기본 운영 정족수가 아니다.
4. 점수는 정수(점수×10000) 저장, 0은 유효, NULL은 미입력. 범위·간격·버전을 서버에서 검증한다.
5. 모든 업체의 필수 항목을 채운 뒤 현재 내용의 해시로 서명한다. 수정하면 이전 서명으로 제출할 수 없다. 개인 제출은 전체 업체를 원자적으로 잠근다.
6. 전원 제출 후 위원장만 집계한다. 업체별 총점 최저·최고 각 1명 제외, 동점은 참여자 ID로 안정적으로 선택한다. 실제 N−2로 나누고 ROUND_HALF_UP 소수 둘째 자리, 표시 평균 기준 공동 순위 1,1,3을 적용한다.
7. 최종 결과는 위원장의 별도 서명·제출로 확정한다. 보고서는 서명·점수·제외 대상·해시를 포함하는 HTML이며 브라우저 인쇄로 PDF 저장이 가능하다.

## 시연 순서

1. 저장소에서 `start_simsa_v2.cmd` 실행 → `http://127.0.0.1:5190/`.
2. 총괄: `super-demo` / 부서: `web-demo`, 공통 비밀번호 `DemoOnly!2026`. 모두 가상 계정이다.
3. 원준석 신규 흐름: ‘시연사업 1’에서 부서 풀·분야별 추첨·연락·초청 확정. ‘시연사업 2’는 직접 등록용.
4. 평가 흐름: ‘가상사업 · 제안서 평가 통합 시연’ 선택. 명단 7명·업체 2개·가상 승인표가 준비되어 있다. PM-05에서 회차 준비.
5. 평가위원 사업 ID `demo-evaluation`, 이름 `가상위원01`~`가상위원07`, 뒤 4자리 `0001`~`0007`. 각각 참석 확인. 여러 위원을 동시에 시연할 때는 별도 브라우저 프로필을 사용한다.
6. 관리자가 참여 명단 확정 → 위원장 지정 → 평가 시작.
7. 위원별 업체 A/B 점수 저장 → 전체 확인 → 서명 → 제출. 위원장은 EV-07에서 집계·서명·최종 제출.
8. 관리자는 PM-06에서 확정 보고서를 내려받는다.

파일 탐색기에서 HTML을 열면 정적 시안만 볼 수 있다. 실제 기능은 HTTP 서버에서 이용한다. Vite는 선택 사항이며 `/v2`, `/api/v2`, `/committee-v2`를 5190으로 프록시한다. `/api` 8000, `/document-api` 8001 기존 설정은 유지한다.

## 검증과 인수 조건

자동 테스트는 임시 DB, 브라우저 E2E는 별도 가상 DB를 사용한다. 최종 결과는 `VERIFICATION_V2.md`를 확인한다. `gg verify` 초기화 오류를 해결했고 로컬 정책·Python 테스트를 통과했다. 도구의 최종 상태는 `ready_for_portal_scan`이며 배포 전 포털 보안검사는 별도다. 프로젝트 전체 인수·운영 배포 승인을 뜻하지 않는다.
