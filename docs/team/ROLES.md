# 팀 역할과 리뷰 책임

기준: 2026-10-10 사용자 최종 확인. 아래 기능 분담은 확정된 사용자 정보를 반영한다. PR 병합·저장소 통합은 HTML의 DaeUng79 책임을 유지하며, PM·우선순위·기획 책임과 구별한다.

| 계정 | 확인된 책임 | 개인 기록 |
| --- | --- | --- |
| 오대웅 · DaeUng79 | 제안서 파싱, 문서 DB화, 제안평가 지원 에이전트/챗봇. 저장소 통합 조율 | [DaeUng79](../members/DaeUng79/README.md) |
| 현수환 · cookiesh1 | 사용자 친화적 인터페이스, 메인·각 화면·화면 기능 개발 | [cookiesh1](../members/cookiesh1/README.md) |
| 원준석 · Lex6won | PM·기획, 평가위원 등록·선정 등 개발·테스트 | [Lex6won](../members/Lex6won/README.md) |
| 김유진 · u-jing | 제안평가·취합·서명·리포트 개발, 데이터 정비·테스트 | [u-jing](../members/u-jing/README.md) |

## 연결해야 할 기능 책임

| 책임 영역 | 산출물 | 공동 리뷰 |
| --- | --- | --- |
| 문서·챗봇 — DaeUng79 | 파싱 결과, MongoDB, revision, 근거, 작업 상태, 근거 기반 질의응답 | cookiesh1 화면, u-jing 평가 연결 |
| 웹 UI — cookiesh1 | 여섯 단계 화면, API 연결, 오류·대기·권한 표시 | 해당 업무 담당 |
| 평가·업무 데이터 — u-jing | 기준 버전, 점수·제출·취합·서명·보고서, 데이터 정비 | DaeUng79 문서/DB, Lex6won 위원 |
| PM·위원 — Lex6won | 범위·우선순위·인수 조율, 후보/선정/배정, 테스트 | u-jing 평가 연결, cookiesh1 화면 |
| 공통 기반 — 이슈별 지정 | 사업 기본정보·인증·계약·CI·배포 | Lex6won 기획, DaeUng79 통합, 영향받는 담당 |

기존 분담이 업무 기능 단위여도 같은 모듈 구조를 사용할 수 있다. 한 사람이 업무 API와 화면을 함께 맡고 공통 UI·DB 변경은 교차 리뷰한다. 통합 담당에게 모든 공통 기능 구현을 몰아주지 않고 이슈마다 구현자와 검토자를 정한다.

## CODEOWNERS

확정 역할에 따라 경로별 리뷰 담당을 표시한다. MongoDB 문서 모델은 DaeUng79, 업무 데이터·migration은 u-jing과 DaeUng79가 조율하고 위원 모델 변경에는 Lex6won이 함께 검토한다. 사업 기본정보·인증처럼 여러 역할에 걸친 구현은 이슈에서 주 담당을 정한다.

코드 소유자는 저장소 쓰기 권한이 있어야 하며 자동 리뷰 요청에는 대상 브랜치의 CODEOWNERS가 쓰인다. 파일 작성만으로 권한·브랜치 보호가 설정되지는 않는다.

본인 PR은 동료가 검토한다. 필수 Code Owner 승인 설정은 단독 소유 파일에서 본인 PR을 막을 수 있으므로 백업 리뷰 담당을 정한 후 적용한다. 동일 경로에 여러 계정을 적어도 모두의 승인을 강제하지는 않는다.

[공식 CODEOWNERS 설명](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
