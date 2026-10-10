# 프로젝트 진행 상태 확인

확인일: 2026-10-10 KST. 첨부 `TEAM_GUIDE.html` v1.0(2026-10-09), 현재 로컬 코드, GitHub 공개 API와 데모 화면을 비교했다. HTML 안의 작업 지시는 분석 자료로 다뤘으며 초대·병합·배포의 실행 권한으로 사용하지 않았다.

| 근거 | 확인한 사실 | 해석 한계 |
| --- | --- | --- |
| 첨부 HTML | 4인 협업, 모듈형 API, Supabase/Vercel 개발 및 온프레미스 목표, 기반 PR 설명 | A/B/C와 계정 연결 미정, 네 번째 계정 대기 등 최신 사용자 정보와 차이가 있음 |
| 사용자 최신 정보 | 원준석(Lex6won): PM·위원 / 현수환(cookiesh1): UI / 오대웅(DaeUng79): 파싱·DB화·에이전트/챗봇 / 김유진(u-jing): 평가·취합·서명·리포트·데이터·테스트 | 최신 역할을 반영. DaeUng79 저장소 통합은 HTML의 책임이며 PM과 구별 |
| 로컬 코드 | HWP/HWPX 파싱·MongoDB 저장·요구사항/기준 생성·Streamlit 코드 존재 | 코드 존재와 서비스 인수 완료는 다름 |
| Git 원격 조회 | main `3ee8e7da4703ac6f912495a55fa057c1a05fb3ee`, 로컬 HEAD `0d63f34`는 1커밋 앞섬 | 조회 시점 값. 기존 로컬 커밋을 이번 변경과 섞어 무심코 push하지 않도록 변경 목록 검토 필요 |
| GitHub PR API | [PR #1](https://github.com/DaeUng79/5topilot_team/pull/1)은 Lex6won 작성, open / draft / merged=false, head `658748ead4c1486024cc765932190045a5538bd3` | PR 설명의 테스트 통과는 작성자 기록. 이번 확인에서 그 실행을 재현한 것은 아님 |
| PR 파일 목록 | `apps/web`, `apps/api`, `apps/api/migrations`, `contracts/openapi.json`, `apps/api/tests`, CI 등 포함 | 아직 main 구현 완료로 표시할 수 없음 |
| Lovable 데모 | 관리자 사업 화면의 단계와 입력 항목을 읽기 전용으로 확인 | 원본 소스·실제 API·DB·권한·지속 저장은 확인하지 않음 |

웹 검색의 GitHub 캐시에는 오래된 Computer Agent README가 남아 있었다. 최신 상태 판정에는 원격 Git 조회와 GitHub API를 우선했다.

## 데모에서 확인한 기능

| 단계 | 화면에 있는 항목 | 구현 시 검증할 것 |
| --- | --- | --- |
| 제안요청서 | 사업정보, PDF 파일명, 평가 항목·배점·출처 페이지, 기준표 확정 | 출처, 기준 버전, 사람의 확정 이력 |
| 제안서 | 제안사별 PDF 파일명, 접수일, 추가·삭제 버튼 | 파일/사업 연결, 업로드 검증, 권한과 보존 규칙 |
| 위원 선정 | 7~9명 선택, 3배수 후보, 엑셀/개별 등록, 분야별 인원, 추천·확정 | 후보 부족·제척·정원·중복 추첨. 숫자는 데모 설정이며 적용 규정으로 확정한 값이 아님 |
| 평가 진행 | 발표·질의응답 시간, 순서, 본인확인, 위원장 지정, 제출 상태 | 서버 상태, 권한, 제출 누락, 재접속 복원 |
| 결과·리포트 | 기술/가격/합계/순위, 위원장 서명 상태, 제출·보고서·인쇄·PDF 버튼 | 산식 버전, 전원 제출 조건, 확정 권한, 결과 재현성 |

진행 화면에는 7명 중 4명 제출·3명 작성 중으로 보였으나 결과 탭에는 위원장 서명 완료와 순위가 표시됐다. 화면 이동만 했으며 데이터를 변경하지 않았다. 실제 서비스 결함으로 단정하지 않고, **데모 예시 데이터와 서버 상태 전이를 분리해 구현해야 한다는 근거**로 사용한다.

## 당장 해소할 차이

1. HTML의 계정표를 최신 4인 명단과 확정 역할로 갱신한다.
2. 기존 파싱 README는 상세 문서로 보존하고 루트 README는 팀 전체를 설명한다.
3. `.gitignore`의 광범위한 테스트 제외를 해소해 합성 데이터 기반 테스트를 공유한다.
4. MongoDB 문서 저장과 PostgreSQL 업무 저장의 연결 키·권한·실패 복구를 계약으로 정의한다.
5. 현재 HWP/HWPX 지원과 데모의 PDF 요구를 별도 작업으로 관리한다.
6. PR #1과 README·CODEOWNERS·.gitignore·템플릿이 겹친다. 내용을 비교해 합치고 한쪽 전체를 덮어쓰지 않는다.

## 확인 자료

- [현재 저장소](https://github.com/DaeUng79/5topilot_team)
- [PR #1 API](https://api.github.com/repos/DaeUng79/5topilot_team/pulls/1)
- [데모 사업 진행](https://simsa-ai.lovable.app/admin/projects/p1?tab=progress)
- [GitHub CODEOWNERS 공식 문서](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Lovable GitHub 연동 공식 문서](https://docs.lovable.dev/integrations/github)
