# 원본 화면 기준 검증 기록 — 2026-10-16

> 최신 수정·검증은 [2026-10-17 평가위원 업무 흐름 복구 보고](COMMITTEE_FLOW_FIX_2026-10-17.md)를 우선 참고하세요. 아래 기존 검증은 개별 화면 접근을 포함해 실제 화면 이동 누락을 발견하지 못했습니다. 최신 검증은 첫 입장부터 버튼으로 최종 제출까지 진행합니다.

## 판정

원준석·김유진 및 승인된 공통 기능의 로컬 구현·원본 화면 연결을 검증했다. 오대웅 25개 Action은 제외했다. 이전 별도 UI의 테스트 결과를 이번 완료 근거로 사용하지 않는다.

`gg verify --run-tests` 결과는 **ready_for_portal_scan**이다. 로컬 정책·런타임·Python 테스트는 통과했고, 배포 전 포털 보안검사는 아직 수행하지 않았다. 전체 서비스 인수·운영 배포 승인으로 해석하지 않는다.

## 실행 결과

| 검사 | 실제 결과 |
|---|---|
| pytest | **96 passed**, 기존 Starlette/httpx deprecation warning 1개 |
| ruff | All checks passed |
| mypy | 27개 소스 파일, 오류 없음 |
| 연결 JS 구문 | 20개 파일 통과; binding은 원본 함수 안에서 실행되는 스니펫이므로 async 함수 내부로 구문 검사 |
| 원본 보호 | 195개 디자인 파일 SHA256 일치 |
| 제외 영역 보호 | 오대웅 원본 19개 파일 SHA256 일치, 25개 Action이 신규 핸들러에 없는지 검사 |
| HTML 보존·CSP | 25개 HTML의 스크립트 외 DOM/CSS 동일, 실행 inline script 해시 허용 |
| SQLite | admin 업무 24개 + evaluation 업무 28개; 양쪽 foreign_key_check 위반 0 |
| 담당 매핑 | 73개 Action 중 담당 48개 핸들러 및 원본 23개 화면 코드 폴더 대조 |
| Chrome 원본 화면 | 업무 화면 20개 + 입장/로그인 4개 방문, 화면 목록 inline 동작 확인 |
| 실제 업무 흐름 | 아래 3개 흐름 통과, 수집된 JavaScript 실행 예외 0 |
| 직접 HTTP / Vite | 5190 / 5180에서 원본 목록·로그인·평가 시작 전 화면·내 계정 연결 통과 |
| 샘플 파일 | HWPX 2개·PDF 1개 다운로드 SHA256 원본 일치 |
| git diff --check | 오류 없음; Windows 줄바꿈 안내만 발생 |
| gg verify | 초기화 오류 해결; 로컬 검사 통과, 포털 검사 대기 |

Python 범위는 `apps/committee_Lex6won/tests`와 `apps/evaluations_u-jing/tests`이다. 기존 미사용 `de.py`는 실행 모듈이 아니며 정적 검사를 제외했다. npm test는 설정되지 않아 gg에서 not_configured로 기록되며, JS 구문 및 실제 Chrome 검사는 별도로 실행했다.

## 실제 Chrome 시나리오

1. `tests/original_committee.mjs`: 원본 PM 로그인 → 사업 등록 → 업체 추가·수정 → 위원 개별 등록·수정·삭제 → 실제 XLSX 미리보기·등록 → 분야별 2/3/2명 설정 → 21명 추첨 → 통화 수락 저장 → 본위원 7명·예비위원 1명 확정 → evaluation 전달 SENT 확인.
2. `tests/original_evaluation.mjs`: 회차 준비 → 가상위원 7명 참석 → 참여자 확정 → 위원장 지정 → 평가 시작 → 업체 2개의 점수·종합 의견 저장 → 7명 캔버스 서명·제출 → 위원장 집계·서명·최종 제출 → 관리자 결과 확인. 7개 제출, FINALIZED, 최고/최저 각 1명 제외 평균 69.00·공동 1위 확인.
3. `tests/original_admin.mjs`: 원본 총괄 로그인 → 부서 생성 → 계정 생성·수정·권한 → 비밀번호 초기화 → 최초 비밀번호 변경 → 부서별 접근 분리 → 비활성화.
4. `tests/original_all_pages.mjs`: 역할별 업무 화면 20개 방문. 제외된 문서 화면은 시안 및 연계 안내까지만 확인.
5. `tests/original_entry.mjs`: 기본 주소와 Vite에서 화면 목록, 4개 입장/로그인 화면, 실제 평가위원 로그인, 평가 시작 전 잠금, 내 계정 연결.

모든 버튼의 모든 조합을 브라우저에서 전수 검사한 것은 아니다. 권한 우회·중복 요청·낙관적 잠금·잘못된 FK·제출 불변성·서명 해시·문서 고정본·부족 인원·분야 누락·반올림/동점·명단 변경 등의 실패 경로는 자동 테스트로 보완했다. 원본 모바일 디자인의 재설계·모바일 전수 검증은 하지 않았다.

## 재현 및 증거

```powershell
apps/committee_Lex6won/.venv/Scripts/python.exe -m pytest -q
apps/committee_Lex6won/.venv/Scripts/python.exe -m ruff check apps/evaluations_u-jing --exclude de.py
apps/committee_Lex6won/.venv/Scripts/python.exe -m mypy apps/evaluations_u-jing --exclude "de.py|prototypes" --ignore-missing-imports
```

- 브라우저 DB: `test-results/original-final/`. 사용자 시연 DB와 별개.
- 스크린샷: `test-results/original-chair-final.png`, `original-manager-results.png`, `original-attendance-started.png`, `original-admin-management.png`, `original-committee-final.png`, `original-before-evaluation.png`.
- 검사 JSON: `test-results/original-pages.json`, `original-final-db.json`.
- `original_cdp.mjs`는 로컬 Chrome CDP 9336을 사용한다. 기본 API 테스트 주소는 5196이며 `SIMSA_TEST_URL`로 변경한다.
- 평가 시나리오 재실행은 새 `--data-dir`가 필요하다. 이미 확정된 결과를 지우거나 재작성하지 않는다.
- 엑셀 시나리오는 `test-results/original-import.xlsx`에 중복되지 않는 가상 위원을 준비한다. 원본 문서를 테스트 데이터로 덮어쓰지 않는다.
- 런타임 DB·키·스크린샷·샘플 원문은 Git에서 제외한다.

## 차단 원인과 처리

브라우저 시작 요청에 자동 실행 정책 거절이 있었다. 도구는 구체적 사유를 제공하지 않았다. 지원되는 별도 Chrome 실행 및 전경 서버 프로세스로 정상 실행을 확인했다.

기존 `C:/coding/.vibecode-harness`는 설치 후 실행용 복사본이어서 `gg init`이 요구하는 `shared/harness-core.yaml`이 없었다. 로컬 보관 패키지 `C:/work/vibecode-local-release/bundle-c3514c9-r3`의 무결성 verified를 확인한 뒤 정상 init으로 프로젝트 하네스를 설치했다. 기존 사용자 디자인 확정 지시와 원본 경로를 설계 증거에 기록했으며 검사 코드·Git 훅을 우회하지 않았다.

최종 영수증: [gg verify](../../evidence/2026-10-16T14-15-34-345Z-verify.json). 원본 승인 기록: [디자인 근거](../../evidence/design/visual-review-receipt.json).

현재 루트 가상환경에는 pytest가 없고 위원 가상환경에 승인된 기존 의존성이 있어, 같은 Python 3.11 환경의 site-packages를 해당 검사 프로세스에만 지정했다. 패키지 설치나 정책 변경 없이 실제 96개 테스트를 실행한다.

```powershell
$env:PYTHONPATH = "$PWD/apps/committee_Lex6won/.venv/Lib/site-packages"
node .vibecode-harness/bin/gg.mjs verify --project . --run-tests
```

포털 검사와 GitHub PR/merge는 완료하지 않았다. 로컬 브랜치는 `feat/lex6won-committee-v2-web`이며 소스는 작업 트리에 저장되어 있다.
