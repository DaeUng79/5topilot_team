# 기능 → 화면 연결표
기준: 팀 기능명세 v2 (`index.html`, 화면 S01~S15 · 버튼 73개 · 모듈 25개) · 2026-10-16 · 모두 "제안 계약" 단계라 바뀔 수 있음
원칙: 화면은 DB 칸이 아니라 버튼의 **입력 → 출력**과 **규칙**에 맞춘다. 버튼 ID(예: `DRAW-02`)를 화면카드·코드 주석에 그대로 쓴다.

## 팀 화면 ↔ 우리 화면
| 팀 화면 | 우리 화면 | 버튼 수 |
|---|---|---|
| S01 로그인 | ENTRY · SA-00 · PM-00 · EV-00 | 3 |
| S02 부서관리자 관리 | SA-02 | 5 |
| S03 사업 목록·상세 | SA-03 · PM-01 (업체 PRJ-06·07 → PM-02) | 7 |
| S04 제안요청서 | PM-02 | 6 |
| S05 평가기준 확정 | PM-03 | 5 |
| S06 업체별 제안서 | PM-02 · PM-08(근거 연결) | 5 |
| S07 위원 풀·직접 등록 | PM-07 · PM-04 | 7 |
| S08 3배수 선정 | PM-04 | 3 |
| S09 연락·초청명단 | PM-04 | 6 |
| S10 참석·위원장 | PM-05 · EV-01(ATT-01) | 6 |
| S11 원문·목차·비교 | EV-03 · EV-04 · EV-05 | 4 |
| S12 문서 챗봇 | EV-05 | 2 |
| S13 평가표 | EV-06 | 5 |
| S14 취합·위원장 결과 | EV-07 · PM-06 | 5 |
| S15 자료·대시보드 | SA-01(DASH-01) · SA-04(MAT) | 4 |

## 버튼별 (화면이 지켜야 할 규칙)

### S01 로그인 → ENTRY · SA-00 · PM-00 · EV-00
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| AUTH-01 | 관리자 로그인 | 공통 | username, password → 세션·역할 | 실패 시 계정 존재 여부를 구별하지 않음 |
| AUTH-02 | 평가위원 로그인 | 공통 | name, last4 → 세션·참석 화면 | 사업 링크 필수, 동일 이름·뒤4자리 중복이면 임의 첫 행 선택 금지 |
| AUTH-03 | 로그아웃 | 전체 | 세션 → 해지 | 서버 세션 폐기와 클라이언트 화면 초기화 |

### S02 부서관리자 관리 → SA-02
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| ADM-01 | 검색 | 총괄 | 검색어·부서·상태·페이지 → 목록 | 전체 목록도 페이지네이션 |
| ADM-02 | 등록 저장 | 총괄 | ID·이름·부서·초기 비밀번호 → ID | ID 중복 409; 비밀번호 해시만 저장 |
| ADM-03 | 수정 저장 | 총괄 | 표시명·부서·version → 새 version | 최종 활성 총괄 계정 상실 차단 |
| ADM-04 | 삭제 / 비활성 | 총괄 | id,version → 비활성 | 참조된 계정 물리 삭제 금지 |
| ADM-05 | 권한 저장 | 총괄 | permission_codes,version → 권한 목록 | 권한 변경 후 기존 세션 재검증 |

### S03 사업 목록·상세 → SA-03 · PM-01 (업체 PRJ-06·07 → PM-02)
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| PRJ-01 | 검색 / 초기화 | 총괄·부서 | 검색어·부서·상태·페이지 → 사업목록 | 부서관리자는 본인 부서 조건 서버 강제 |
| PRJ-02 | 사업 등록 | 총괄·부서 | 사업명·소속·부서·직책/직급·성명·전화·이메일? → project_id | 이메일만 선택; 필수 연락처 검증 |
| PRJ-03 | 사업 수정 | 총괄·부서 | 담당 정보·version → 새 version | 평가 시작 후 사업 식별·평가조건 변경 차단 |
| PRJ-04 | 사업 삭제 | 총괄·부서 | 사유·version → 목록 제외 | 진행 평가 취소는 별도 정책, 서명 자료 보존 |
| PRJ-05 | 상세 / 자료 열기 | 총괄·부서 | project_id → RFP·제안서·평가·결과 링크 | 문서·평가 DB 준비 상태를 별도 표시 |
| PRJ-06 | 업체 등록 / 수정 | 총괄·부서 | 법인명·표시코드·순서·version → 업체 | 코드 사업 내 유일; 신규 ID는 서버 발급 |
| PRJ-07 | 업체 삭제 | 총괄·부서 | version → 비활성 | 평가에 고정된 업체는 삭제 차단 |

### S04 제안요청서 → PM-02
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| DOC-01 | 파일 선택 → 등록 / 교체 | 총괄·부서 | file(HWPX≤50MB), 사업ID·명 → 업로드요약 | 재등록은 새 upload revision. 저장 반환 parse revision 고정 |
| DOC-02 | 등록 이력 / 검색 | 총괄·부서 | 검색어 → upload_revision 목록 | 최신 업로드와 과거 고정 버전을 구별 |
| DOC-03 | 요구사항 새로고침 | 총괄·부서 | project_id → 상태·결과 | queued/running 때 폴링; 실패에도 원본 유지 |
| DOC-04 | 요구사항 추출 / 재시도 | 총괄·부서 | upload_revision, force → job상태 | 기존 재시도 URL은 개발본 확인 후 연결. 여기 경로는 제안 |
| DOC-05 | 원본 보기 / 다운로드 | 참여권한자 | 권한검사 + 명시적 버전 맥락 → 파일 | 사업의 업로드/binding 확인 후 해시로 BLOB 조회 |
| DOC-06 | 등록 삭제 | 총괄·부서 | 사유 → 목록 제외 | 다른 사업 공유·승인표·평가참조 있으면 원본 삭제 차단 |

### S05 평가기준 확정 → PM-03
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| CRT-01 | 초안 생성 | 총괄·부서 | project_id → 생성 상태 | AI 생성 완료는 사람 승인 완료가 아님 |
| CRT-02 | 초안 조회 / 새로고침 | 총괄·부서 | project_id → 항목·배점·근거·보완점 | 생성 실패·요구사항 미완료 구별 |
| CRT-03 | 검토 시작 | 총괄·부서 | result_id, upload_revision → DRAFT ID | 원본 초안 JSON을 복제; AI 초안 테이블 수정 금지 |
| CRT-04 | 항목 추가 / 수정 / 삭제 / 순서 저장 | 총괄·부서 | 항목배열·배점·근거·version → 저장본 | DRAFT만 가능. 말단 배점합·음수·중복코드·계층 검증 |
| CRT-05 | 평가표 확정 | 총괄·부서 | version·확인동의 → 승인해시 | 원문·배점·누락 확인, 확정 후 불변; evaluation 수신 ACK 표시 |

### S06 업체별 제안서 → PM-02 · PM-08(근거 연결)
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| PRO-01 | 제안서 등록 / 교체 | 총괄·부서 | HWPX/PDF, 업체 → 고정 문서버전 | PDF는 기존 구현 인터페이스 등록 후 어댑터 연결; 미확인 시 성공 처리 금지 |
| PRO-02 | 제안서 검색 / 이력 | 총괄·부서 | 업체·검색어 → 버전 목록 | 새 업로드가 기존 평가회차 자료를 교체하지 않음 |
| PRO-03 | 제안서 삭제 | 총괄·부서 | 사유 → ARCHIVED | 참조·서명 증빙을 보존 |
| PRO-04 | 항목 연결 제안 | 총괄·부서 | 승인표·업체문서버전 → 근거후보 | 출처 없는 매핑은 저장 거절 |
| PRO-05 | 근거 연결 수정 / 확정 | 총괄·부서 | 항목·블록·셀·version → CONFIRMED | 같은 사업·문서·평가표 확인; 새 버전 변경 시 재검토 |

### S07 위원 풀·직접 등록 → PM-07 · PM-04
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| COM-01 | 풀 / 사업별 검색 | 총괄·부서 | scope, project_id?, 분야·검색어 → 목록 | 사업별 등록자는 pool_member=0, 본인 부서 범위 |
| COM-02 | 엑셀 양식 다운로드 | 총괄·부서 | scope → XLSX | 열: 이름·휴대전화·소속·부서·직책·분야·이메일? |
| COM-03 | 엑셀 선택 / 미리보기 | 총괄·부서 | xlsx, scope, project_id? → 행별 오류·중복 | 원본 휴대전화 마스킹, 수정 전 실제 후보 생성 안 함 |
| COM-04 | 검증 목록 등록 | 총괄·부서 | 미리보기 version·확인 → 성공/제외행 | 만료·오류행·중복 처리정책 확인; 동일 요청 재등록 방지 |
| COM-05 | 개별 등록 | 총괄·부서 | 이름·전화·소속·분야·scope → 후보ID | 전화 정규화 후 부서 내 중복 판정 |
| COM-06 | 개별 수정 | 총괄·부서 | 변경값·version → 새 version | 기존 확정명단 스냅샷은 별개로 유지 |
| COM-07 | 개별 삭제 | 총괄·부서 | version → 비활성 | 확정배정·과거 추첨 증빙 물리삭제 금지 |

### S08 3배수 선정 → PM-04
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| DRAW-01 | 인원 / 분야 설정 저장 | 총괄·부서 | POOL/DIRECT, 정원7~9, 분야별 수 → 규칙 | 분야합=정원, DIRECT에서는 추첨 버튼 숨김 |
| DRAW-02 | 3배수 무작위 선정 | 총괄·부서 | 규칙version·요청키 → 후보3N | 분야별 3배수, 복수분야 동일인 중복 배정 금지; 부족 시 전체 중단 |
| DRAW-03 | 선정명단 다운로드 | 총괄·부서 | draw_id → XLSX | 다운로드 권한·감사, 필요 연락처만 제공 |

### S09 연락·초청명단 → PM-04
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| ROS-01 | 연락대상 검색 | 총괄·부서 | 연락상태·분야 → 목록 | POOL 추첨 대상과 DIRECT 후보 출처 구분 |
| ROS-02 | 사업 후보 추가 | 총괄·부서 | candidate_id → 사업 후보 | DIRECT만 일반 추가; 추첨명단 변경은 사유·정책 필요 |
| ROS-03 | 통화 결과 저장 | 총괄·부서 | 미연락/수락/거절/부재·메모·version → 결과 | 오프라인 전화 결과 기록; 통화 자동 실행 없음 |
| ROS-04 | 후보 제외 | 총괄·부서 | 사유 → 제외 | 과거 추첨 행 삭제 금지 |
| ROS-05 | 본위원·예비위원 명단 확정 | 총괄·부서 | 선택후보·종류·예비순서·version → roster_id | 이름+뒤4 충돌 차단, evaluation ACK까지 로그인 준비중 |
| ROS-06 | 확정명단 다운로드 | 총괄·부서 | roster_id → XLSX | 후보3배수 목록과 초청확정 목록 분리 표시 |

### S10 참석·위원장 → PM-05 · EV-01(ATT-01)
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| ATT-00 | 평가회차 준비 | 총괄·부서 | roster_id, 승인표ID, 정원, 집계정책 → PREPARING session_id | 명단·승인표 수신 완료 후 생성. 이후 참석자 잠금→위원장 지정→시작 순서 |
| ATT-01 | 본인 참석 확인 | 평가위원 | 동의버전·참석확인 → 참석 상태 | 서버 세션의 assignment_id 사용. 단순 로그인과 구별 |
| ATT-02 | 참석자 새로고침 | 총괄·부서 | project_id → 참석·초청·배정상태 | 관리자 화면에 실제 참석확인만 위원장 후보로 표시 |
| ATT-03 | 실제 평가인원 확정 | 총괄·부서 | 참석확인자IDs·version → 잠금명단 | 정원·분야·최소인원 승인조건, 평가 시작 후 변경 금지 |
| ATT-04 | 위원장 지정 | 총괄·부서 | participant_id·version → 위원장 | 동일 회차 실제 참여자 한 명. 최종결과 제출권한과 직접 연결 |
| ATT-05 | 평가 시작 | 총괄·부서 | 승인표·업체버전·roster·정책·version → OPEN | 필수 데이터 ACK·참석·위원장·집계정책 충족, 한 로컬 트랜잭션 동결 |

### S11 원문·목차·비교 → EV-03 · EV-04 · EV-05
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| VIEW-01 | 목차 열기 / 항목 선택 | 참여권한자 | parse_revision → 목차·페이지 | 버전 필수; 잘못 매핑된 페이지는 NEEDS_REVIEW 표시 |
| VIEW-02 | 원문 근거로 이동 | 참여권한자 | parse_revision, cell_id? → 원문 | 출처 없는 AI 문장을 원문처럼 표시하지 않음 |
| VIEW-03 | 기업별 파일 보기 | 참여권한자 | 동결 제안서 맥락 → BLOB | 다운로드 권한 검사. A사 표시만으로 파일 속 실명 제거되는 것은 아님 |
| VIEW-04 | 평가항목별 기업 비교 | 평가위원 | session_id, criterion_id, 업체배열 → 근거열 | 업체 수 가변; 근거 없음도 빈상태 명시 |

### S12 문서 챗봇 → EV-05
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| CHAT-01 | 질문 전송 | 평가위원 | session_id, 선택업체, question, history → 답변·출처 | 기존 fullpages 방식 유지; 다른 사업 검색 금지 |
| CHAT-02 | 대화 초기화 | 평가위원 | 현재 문서맥락 → 빈 대화 | 사업·문서 버전 변경 시 자동 초기화 |

### S13 평가표 → EV-06
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| SCO-01 | 평가표 열기 / 업체 선택 | 평가위원 | 현재세션 → 본인 전체업체 평가표 | 타 위원 점수는 위원장도 진행 중 접근 불가 |
| SCO-02 | 점수·의견 임시 저장 | 평가위원 | 항목배열·점수·의견?·version → 저장본 | 0과 NULL 구분, 배점 상한·간격 검사, 409면 충돌안내 |
| SCO-03 | 점수 확인 | 평가위원 | 세션 → 업체별합계·누락·payload_sha256 | 서명 이전 서버 저장된 점수로 재계산 |
| SCO-04 | 서명 저장 | 평가위원 | purpose=EVALUATION, image, payload_sha256 → signature_id | 현재 저장점수와 해시 일치; 서명만으로 제출 완료 아님 |
| SCO-05 | 평가 제출 | 평가위원 | signature_id, payload_sha256, 요청키 → 제출증빙 | 전 업체 말단항목 완성, 서명해시·현재주체 확인, 원자 제출 |

### S14 취합·위원장 결과 → EV-07 · PM-06
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| RES-01 | 제출 현황 / 결과 조회 | 관리자·위원장 | 역할별 → 제출수/허용결과 | 전원 제출 전 관리자에게 개별 점수 비공개 |
| RES-02 | 결과 취합 / 재조회 | 서버 자동·위원장 | 승인정책·요청키 → result_run_id | 최고·최저 제외 대상·동점 처리·분모 기록. 전원 제출 전 409 |
| RES-03 | 위원장 서명 | 위원장 | purpose=CHAIR_RESULT, result_run_id, hash, image → 서명 | 현재 지정 위원장 및 집계해시 확인 |
| RES-04 | 최종 결과 제출 | 위원장 | result_run_id, signature_id, hash → FINALIZED | 집계 갱신·위원장 변경 시 이전 서명 사용 차단 |
| RES-05 | 결과 보고서 다운로드 | 허용된 관리자·위원장 | 확정회차 → 보고서 | 승인 전 미리보기는 미확정 워터마크; 다운로드 감사 |

### S15 자료·대시보드 → SA-01(DASH-01) · SA-04(MAT)
| 버튼 ID | 버튼 | 누가 | 입력 → 출력 | 화면이 지켜야 할 규칙 |
|---|---|---|---|---|
| DASH-01 | 통계 새로고침 / 차트 필터 | 총괄 | 기간·부서 → 계정·사업·자료 집계 | 기준시각·수신 지연 표시, 개인정보 차트 노출 금지 |
| MAT-01 | 자료 검색 / 유형 필터 | 총괄·부서 | 사업·종류·검색어 → 파일/결과 목록 | 총괄 전체/부서 본인 범위 |
| MAT-02 | 결과 자료 등록 | 총괄·부서 | 파일·제목·설명 → 자료ID | UPLOADED_RESULT 표기; 시스템 취합본과 구분 |
| MAT-03 | 자료 수정 / 파일 교체 | 총괄·부서 | 변경파일?·설명·version → 새버전 | 원본 확정 점수·서명 변경 없음 |

## 모듈 담당 (참고)
| 모듈 | 담당 | 파일 |
|---|---|---|
| AUTH | 김유진(공통 담당 제안) | `apps/evaluations_u-jing/auth_service.py` |
| ADMIN | 김유진(제안) | `apps/evaluations_u-jing/admin_service.py` |
| PROJECT | 김유진(공동 영역 대표 제안) | `apps/evaluations_u-jing/project_service.py` |
| DASH | 김유진(제안) | `apps/evaluations_u-jing/dashboard_service.py` |
| IMPORT | 원준석 | `apps/committee_Lex6won/candidate_import.py` |
| POOL | 원준석 | `apps/committee_Lex6won/candidate_pool.py` |
| DRAW | 원준석 | `apps/committee_Lex6won/committee_selection.py` |
| ROSTER | 원준석 | `apps/committee_Lex6won/committee_roster.py` |
| ATTEND | 김유진 | `apps/evaluations_u-jing/attendance_service.py` |
| SCORE | 김유진 | `apps/evaluations_u-jing/evaluation_service.py` |
| SIGN | 김유진 | `apps/evaluations_u-jing/signature_service.py` |
| RESULT | 김유진 | `apps/evaluations_u-jing/result_service.py` |
| RFP | 오대웅 | `apps/documents_daeung/rfp_api.py` |
| PARSE | 오대웅 | `apps/documents_daeung/step1_hwpx_parse_to_JSON.py` |
| STORE | 오대웅 | `apps/documents_daeung/step2_hwpx_save_to_SQLite.py` |
| REQ | 오대웅 | `apps/documents_daeung/step3_ai_requirements_extract_to_SQLite.py` |
| DRAFT | 오대웅 | `apps/documents_daeung/step4_ai_criteria.py` |
| DOC | 오대웅 | `apps/documents_daeung/document_gateway.py` |
| PROPOSAL | 오대웅 | `apps/documents_daeung/proposal_document_adapter.py` |
| CRITERIA | 오대웅 | `apps/documents_daeung/criteria_approval.py` |
| EVIDENCE | 오대웅 | `apps/documents_daeung/proposal_evidence.py` |
| CHAT | 오대웅 | `apps/ai_chatbot_daeung/chatbot_service.py` |
| MATERIAL | 오대웅 | `apps/documents_daeung/material_service.py` |
| SYNC | 각 원본 담당 / 오대웅 통합 | `shared/integration/sync_service.py` |
| DB | 각 DB 담당 / 김유진 검증 | `shared/db/sqlite_connection.py` |
