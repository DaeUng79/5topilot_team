# 심사임당 — 공공 제안평가 업무 지원

사업·제안요청서 준비, 평가위원 선정, 제안평가, 결과 취합과 보고를 하나의 흐름으로 연결하는 4인 팀 프로젝트입니다. AI는 문서와 근거를 찾아 정리하며, 평가기준 확정과 점수·의견·최종 승인은 사람이 담당합니다.

- [팀 저장소](https://github.com/DaeUng79/5topilot_team)
- [목표 화면 데모](https://simsa-ai.lovable.app/admin/projects/p1?tab=progress)
- [진행 상태와 확인 근거](docs/STATUS_REVIEW.md)
- [폴더 구조와 코드 등록 방법](docs/REPOSITORY_LAYOUT.md)
- [개발 계획](docs/team/DEVELOPMENT_PLAN.md) · [공동 작업 규칙](docs/team/WORKFLOW.md) · [인수 테스트](docs/testing/ACCEPTANCE.md)

## 목표 업무 흐름

```text
제안요청서 등록·파싱 → 평가기준 검토·확정 → 제안서 등록
    → 평가위원 선정·배정 → 개별 평가·제출
    → 결과 취합·위원장 확정 → 보고·보관
```

## 현재 상태 — 2026-10-10 확인

| 구분 | 확인된 내용 | 다음 단계 |
| --- | --- | --- |
| 문서 처리 | HWP/HWPX 파싱, MongoDB/GridFS 저장, 요구사항 추출, 정성적 평가기준 생성, Streamlit 확인 화면 코드가 있음 | 웹 업무 API와 연결, 사업·문서 권한 및 버전 계약 구현 |
| 웹·업무 API 기반 | [PR #1](https://github.com/DaeUng79/5topilot_team/pull/1)에 React·FastAPI·위원·평가·migration·테스트가 제안됨. 확인 시점에는 **열린 Draft, 미병합** | 현재 main과 병합 영향 검토, 동료 리뷰·CI 후 통합 |
| Lovable 데모 | 관리자 화면에서 제안요청서·제안서·위원 선정·평가 진행·결과·완료 단계 확인 | 화면별 요구사항과 서버 검증으로 구현·인수 |
| 이번 폴더 정리 | 공통/개인 문서 및 기능별 등록 경로 준비 | 빈 경로의 README는 개발 안내이며 실행 코드 완성을 뜻하지 않음 |
| 실제 서비스 | 데모의 DB 영속성·인증·계산·운영 배포는 이번 확인에서 검증하지 않음 | 가짜 데이터 통합 환경에서 검증 후 배포 |

데모의 PDF 파일 표시는 현재 파서의 PDF 지원을 뜻하지 않습니다. 현재 HWP/HWPX 처리 경로와 PDF·OCR 추가 개발을 구분합니다.

## 팀과 개인 개발 문서

| 계정 | 담당 확인 상태 | 개인 개발 기록 |
| --- | --- | --- |
| [오대웅 · DaeUng79](https://github.com/DaeUng79) | 제안서 파싱·DB화, 평가 지원 에이전트/챗봇, 저장소 통합 | [DaeUng79](docs/members/DaeUng79/README.md) |
| [현수환 · cookiesh1](https://github.com/cookiesh1) | 사용자 친화적 UI, 메인·각 화면 및 화면 기능 | [cookiesh1](docs/members/cookiesh1/README.md) |
| [원준석 · Lex6won](https://github.com/Lex6won) | PM·기획, 평가위원 등록·선정 개발·테스트 | [Lex6won](docs/members/Lex6won/README.md) |
| [김유진 · u-jing](https://github.com/u-jing) | 제안평가·취합·서명·리포트, 데이터 정비·테스트 | [u-jing](docs/members/u-jing/README.md) |

코드는 **기능별 폴더**에, 설명과 개발 실적은 **계정별 문서**에 기록합니다. 역할은 품질·리뷰 책임이며 다른 팀원의 수정 제안을 막는 경계가 아닙니다. 상세 내용은 [역할표](docs/team/ROLES.md)를 따릅니다.

## 저장소 구조

```text
README.MD                          팀 대표 소개
docs/members/<GitHub ID>/README.md 개인 담당·진행·테스트·PR 기록
docs/modules/                     기능별 상세 설명
docs/team/                        역할·개발 계획·협업 규칙
docs/testing/                     인수 기준
docs/contracts/                   문서 처리 연계 설계
contracts/                         공통 API 명세·예제 경로
apps/web/                          팀 웹 화면 (기반 PR 통합 예정)
apps/api/app/modules/              documents/ai/projects/committee/evaluations/results
services/document-parser/          기존 파서의 작업자·어댑터 경계
tests/                             기존 문서 처리 회귀 테스트
.github/                           이슈·PR·리뷰 담당 규칙
step*.py, streamlit*.py             현재 동작 코드; 점진적으로 분리
doc/ai_criteria.md                  현재 코드에서 읽는 기준표 서식
```

기존 파일은 내부 import·상대경로·작업자 호출을 유지하기 위해 우선 현재 위치에 둡니다. 목표 경로로 이동할 때는 코드·실행 명령·테스트를 함께 변경합니다.

## 지금 실행할 수 있는 문서 처리 앱

저장소 루트에서 실행합니다. MongoDB 연결 정보 등은 개인 `.env`에 설정하며 Git에 올리지 않습니다.

```sh
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell에서는 .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
streamlit run streamlit_main.py
```

설정·처리 흐름·JSON·DB·CLI 상세 설명은 [문서 파싱 개발 문서](docs/modules/document-parsing.md)에 있습니다. 요구사항·기준 생성에는 설정된 AI API 호출 비용이 발생할 수 있습니다. 웹 앱 실행은 기반 PR 통합 후 해당 실행 문서와 package 설정을 따릅니다.

## 기여와 완료 기준

1. 이슈에 기능, 담당, 변경 파일, 선행 작업, 완료 조건을 적습니다.
2. 최신 기준 브랜치에서 작은 기능 브랜치를 만들고 Draft PR로 공유합니다.
3. API 계약·DB 변경·테스트·개인 개발 문서를 함께 갱신합니다.
4. 동료 리뷰와 실제 실행한 검증을 확인한 뒤 DaeUng79가 통합을 조율합니다.
5. 공동 환경에서 재현 결과를 남긴 기능만 완료 처리합니다.

원문 제안서·실제 개인정보·API 키·DB 접속정보·생성 산출물은 저장소에 넣지 않습니다. 공유 테스트에는 합성 데이터를 사용합니다.
