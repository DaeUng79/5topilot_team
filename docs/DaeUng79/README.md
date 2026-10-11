# 오대웅(DaeUng79) — 제안서 파싱·DB화·제안평가 지원 에이전트/챗봇

[프로젝트 소개](../../../README.MD) · [문서 처리 모듈 상세](../../modules/document-parsing.md) · [GitHub 프로필](https://github.com/DaeUng79)

확인 기준: 2026-10-10. 사용자가 확정한 담당은 **제안서 파싱, DB화 기능, 제안평가 지원 에이전트/챗봇**입니다. 제공된 팀 가이드의 저장소 통합 책임도 유지합니다. 프로젝트 PM은 원준석(Lex6won)이며, DaeUng79의 통합은 코드·계약·검증·병합을 조율하는 책임입니다.

## 담당 범위

| 책임 | 작업 내용 | 다른 기능에 제공할 내용 |
| --- | --- | --- |
| 제안서 파싱 | 제안요청서·제안서의 HWPX/HWP 문단·표·이미지·페이지 구조화, 오류·경고 관리 | 문서 식별자, 버전, 블록·표·페이지·근거 위치 |
| DB화 기능 | 파싱 결과 저장, 요구사항 원문 추출, 정성적 평가기준 생성 보조 | 원문에 연결된 요구사항·기준 JSON, 재처리·검토 상태 |
| 제안평가 지원 에이전트/챗봇 | 향후 사업 문서의 근거 검색·질의응답·평가 검토 보조 | 출처 문서·revision·페이지를 확인할 수 있는 답변, 권한 내 문서 접근 |
| 통합 | 공통 계약 및 변경 순서 조율, PR 병합, 전체 흐름 검증 | 승인된 코드·계약·테스트·배포 기록 |

통합 담당이라는 이유로 다른 기능의 구현을 모두 맡지는 않습니다. 관련 기능 담당자가 API·화면·테스트를 함께 개발하고, DaeUng79 본인의 PR도 동료가 검토합니다.

협업 연결: 현수환(cookiesh1)은 UI, 원준석(Lex6won)은 PM·평가위원 기능, 김유진(u-jing)은 평가취합·서명·보고서·데이터 테스트를 담당합니다. 문서 계약은 이 기능들의 소비 방식과 함께 검토합니다.

## 현재 개발 내용과 근거

| 항목 | 실제 파일 | 확인 상태 |
| --- | --- | --- |
| HWPX/HWP 파싱 | [step1_parser_hwpx.py](../../../step1_parser_hwpx.py) | 구현 확인. 표 셀 병합·이미지·문서 순서·페이지 정보를 구조화 |
| 문서 저장 | [step2_hwpx_storage.py](../../../step2_hwpx_storage.py) | MongoDB/GridFS 저장 및 활성 revision 처리 구현 확인 |
| 요구사항 추출 | [step3_ai_requirements.py](../../../step3_ai_requirements.py) | 모델이 선택한 블록 ID를 원문과 검증하고 결과를 저장하는 구현 확인 |
| 정성적 평가기준 | [step4_ai_criteria.py](../../../step4_ai_criteria.py) | 원문 기준표 또는 기본 서식에 따른 JSON 생성·검증 구현 확인 |
| 확인용 UI | [streamlit_main.py](../../../streamlit_main.py), [streamlit_page_preview.py](../../../streamlit_page_preview.py) | 업로드·이력·원문/추출 결과·페이지 미리보기 구현 확인 |
| 제안평가 지원 에이전트/챗봇 | 향후 검색·질의응답 API 및 챗봇 화면 | 계획 단계. 기존 요구사항·평가기준 추출 기능을 챗봇 완료로 간주하지 않음 |
| 실제 웹·업무 API 연결 | 향후 문서 API 및 웹 화면 | 이 로컬 체크아웃에서는 연결 구현을 확인하지 못함 |
| 공동 운영·배포 | 팀 환경·권한·배포 기록 | 별도 실제 환경 검증 필요 |

구현 확인은 소스가 존재한다는 뜻입니다. 실제 문서에서의 추출 정확도, 운영 DB 연결, 모델 호출 품질, 웹과의 전체 흐름이 검증되었다는 의미는 아닙니다. 현재 파서는 HWPX/HWP를 대상으로 하며 PDF·OCR 지원은 별도 개발 항목입니다.

## 실행과 개발 경계

현재 실행은 저장소 루트에서 진행합니다.

```sh
python -m pip install -r requirements.txt
streamlit run streamlit_main.py
```

MongoDB 연결은 서버 환경변수 또는 로컬 `.env`의 `MONGODB_URI`를 사용합니다. AI 추출 실행 시 `OPENAI_API_KEY`가 필요합니다. 세부 설정·CLI·출력 구조는 [기존 개발 안내](../../modules/document-parsing.md)에 보존했습니다.

루트의 `step*.py`, `streamlit*.py`는 상대 import, 작업자 파일, `.env`, `output/`, `doc/ai_criteria.md` 경로에 연결되어 있습니다. 지금은 이 실행 위치를 유지하며, 패키지 이동은 별도 PR에서 경로 변경과 회귀 검증을 함께 수행합니다. `doc/ai_criteria.md`는 프로그램이 읽는 입력 자료이므로 단순 안내 문서처럼 옮기지 않습니다.

현재 문서 저장은 MongoDB입니다. 계획 중인 업무 DB와 연결할 때 문서 데이터와 사업 메타데이터의 책임·참조 관계부터 합의합니다. DB 변경을 팀 폴더 정리와 한 번에 수행하지 않습니다.

## 다음 작업

1. 사업·문서 관계와 파서 입력/출력 계약을 API·화면 담당자와 확정합니다. 현재의 `document_id`, `source_revision`, `block_id`, 물리 페이지와 인쇄 쪽번호를 근거 참조에 활용합니다.
2. 문서 업로드부터 파싱 완료까지의 처리 상태와 실패·재시도 정책을 정의합니다. 처리 중, 완료, 검토 필요, 실패를 화면에서 구분할 수 있어야 합니다.
3. 새 문서 API에서 기존 파서를 호출하는 어댑터를 연결합니다. 문서 내용에 포함된 명령문은 분석 대상 데이터로 취급합니다.
4. 화면 담당자와 가상 응답으로 업로드·상태 조회·근거 열람을 먼저 연결한 뒤 실제 파서로 교체합니다.
5. 합성 문서 회귀 테스트와 팀 통합 시나리오를 PR에 함께 등록합니다. 모델 생성 결과는 검토·확정 단계를 거쳐 평가 기능에 전달합니다.
6. 제안평가 지원 에이전트/챗봇은 문서 검색과 근거 제시부터 개발합니다. 답변의 `document_id`, `source_revision`, `block_id`, 물리 페이지·인쇄 쪽번호를 원문 열람으로 연결하고, 근거가 없거나 현재 버전과 맞지 않으면 답변을 보류하고 검토 필요 상태를 표시합니다.
7. 인증·평가위원 기능 담당자와 역할 및 사업별 문서 접근 계약을 확정합니다. 검색 후보 필터, 원문 조회, 파일 다운로드 API 모두에서 접근 권한을 검사하며, 프롬프트의 주의 문구만으로 권한을 통제하지 않습니다. 챗봇은 평가자의 점수·제출·최종 승인 판단을 보조합니다.

## 검증과 완료 기준

- 합성 HWPX의 문단 순서, 병합 셀, 중첩 표, 이미지 참조가 기대 결과와 일치합니다.
- 물리 페이지와 인쇄 쪽번호를 구분하고, 매핑 실패·누락 이미지가 경고로 남습니다.
- 같은 입력을 재처리했을 때 식별자·revision이 일관되며, 저장 실패 결과가 활성 데이터로 공개되지 않습니다.
- 요구사항·평가기준 결과를 원문 문서와 버전에 연결하고, 오래된 결과나 잘못된 블록 참조를 거절합니다.
- 문서 업로드 → 파싱 상태 → 근거 열람 → 검토한 평가기준 연결의 공동 시나리오를 통과합니다.
- 챗봇 답변의 문서·revision·블록·페이지 근거를 확인할 수 있고, 권한 없는 사업이나 문서의 내용이 검색·답변·다운로드에 포함되지 않습니다. 이 기준은 향후 챗봇 개발의 완료 조건이며 현재 통과했다고 주장하지 않습니다.

로컬 회귀 테스트 실행 결과는 아래 개발 기록에 남기며, 실문서 렌더러·운영 DB·유료 모델 호출 시험과 구분합니다.

2026-10-10에는 로컬 Python 3.13 가상환경에서 아래 9개 모듈을 `unittest`로 불러 실행했습니다. 실행 중 소켓 연결과 DNS 조회를 차단했으며 DB·모델 호출은 기존 테스트의 mock을 사용했습니다.

저장소 루트에서 같은 차단 조건으로 재현하는 명령(macOS/Linux, 기존 `.venv` 사용):

```sh
.venv/bin/python -B - <<'PY'
import socket
import unittest
from unittest.mock import patch

names = [
    'test_ai_requirements', 'test_ai_criteria',
    'test_requirements_ui', 'test_criteria_ui',
    'tests.test_hwpx_parser', 'tests.test_hwpx_storage',
    'tests.test_document_view', 'tests.test_page_previews',
    'tests.test_streamlit_app',
]
with (
    patch.object(socket.socket, 'connect', side_effect=AssertionError('Network disabled for local unit audit')),
    patch.object(socket.socket, 'connect_ex', side_effect=AssertionError('Network disabled for local unit audit')),
    patch.object(socket, 'getaddrinfo', side_effect=AssertionError('Network disabled for local unit audit')),
):
    suite = unittest.defaultTestLoader.loadTestsFromNames(names)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    print('AUDIT_RESULT', {
        'run': result.testsRun, 'failures': len(result.failures),
        'errors': len(result.errors), 'skipped': len(result.skipped),
    })
    raise SystemExit(not result.wasSuccessful())
PY
```

최종 결과: **94개 테스트 모두 통과**. 처음 실행에서 발견한 오래된 테스트 참조 4건을 테스트 소스에서만 수정하고 같은 조건으로 재검증했습니다. import 실패로 불러오지 못했던 페이지 미리보기 테스트 3개도 실제 실행되어, 최초 실행의 로더 항목 92개와 최종 테스트 수가 다릅니다.

| 최초 발견 사항 | 원인 | 수정 및 검증 |
| --- | --- | --- |
| 페이지 미리보기 테스트 import 실패 1건 | `tests/test_page_previews.py`가 현재 없는 `page_preview_worker`를 import | 실제 파일 `streamlit_page_preview.py`를 import하여 쪽번호 제거·캐시 재사용·원본 해시 검증 실행 |
| Streamlit 이력 화면 테스트 오류 3건 | 이전 UI의 `history_choice_1_`, `history_search`, `refresh_history` 키를 기대 | 현재 문서 선택 키를 사용하고 재실행 후 선택 유지·표/이미지 열람·접속 실패/회복 동작 검증 |

실행 코드는 변경하지 않았습니다. 실제로 없는 검색·새로고침 UI를 테스트에서 호출하던 부분을 현재 화면의 사용자 동작에 맞췄으며, 새 문서가 추가되어도 선택한 문서가 유지되는지와 접속 회복 후 오류가 해제되는지도 확인합니다. 위 결과는 합성 입력과 mock 기반 로컬 회귀 검증이며 실문서 렌더러·운영 DB·유료 모델 품질 검증을 대신하지 않습니다.

## 개발 기록

| 날짜 | 작업 | 상태·근거 | 다음 조치 |
| --- | --- | --- | --- |
| 2026-10-10 | 기존 문서파싱 개발 내용과 팀 문서 분리 | 기존 README 전체를 `docs/modules/document-parsing.md`에 보존. 코드 이동 없음 | 문서 API 계약 및 팀 연결 작업을 이슈로 분리 |
| 2026-10-10 | 로컬 테스트 공유 상태 점검 | 테스트 소스 9개가 기존 `.gitignore`에 의해 제외됨 | 검토한 테스트 소스만 추적 대상으로 전환하고 실행 결과 기록 |
| 2026-10-10 | 기존 합성·mock 회귀 테스트 수리 및 실행 | 최초 92개 로더 항목 중 오류 4건 확인 → 테스트 참조 정합화 → 94개 모두 통과. 외부 연결 차단 상태 | 공동 CI에 같은 테스트를 연결하고 실제 시스템 통합은 별도 검증 |

이후 작업은 아래 항목을 추가합니다. 동일한 내용을 여러 문서에 복사하는 대신 Issue·PR·테스트 결과를 연결합니다.

```text
날짜 / Issue / PR:
변경한 기능·파일:
API·DB·문서 계약 영향:
검증 명령과 실제 결과:
남은 작업·필요한 협업:
```
