# 현수환 · cookiesh1

[프로젝트 소개](../../README.MD) · [웹 개발 공간](../../apps/web_cookiesh1/) · [GitHub](https://github.com/cookiesh1)

담당: **사용자 친화적 인터페이스, 메인·각 화면 개발 및 화면 기능 개발**. 2026-10-10 사용자 확인 기준입니다.

## 작업 문서

| 문서 | 확인할 내용 |
| --- | --- |
| [웹 시작 앱 이관·mock 모드](WEB_FOUNDATION.md) | PR #3에서 올린 파일 구조, 화면별 기능·API, mock 규칙, 검증 결과, 남은 작업 |

## 개발 내용

- 코드 등록 경로: `apps/web_cookiesh1/`
- 산출물: 6단계 화면, 공통 UI, API 연결, 로딩·빈 화면·오류·권한 표시
- 현재 상태: PR #1의 웹 시작 앱(사업·위원·평가 화면)을 이관하고 mock 모드를 추가해 main에 병합했습니다(PR #3). 상세는 [작업 기록](WEB_FOUNDATION.md).
- 첫 작업 순서: API 계약과 mock으로 화면 개발 → 실제 API 연결 → 새로고침·실패·모바일 화면 검증
- 연결 담당: Lex6won(원준석 PM): 기획/위원, DaeUng79: 문서/챗봇 응답·근거 표시, u-jing: 평가/결과

화면 변경은 cookiesh1과 공동 리뷰합니다. 기획·우선순위·인수 조율은 Lex6won, 저장소 통합은 DaeUng79가 맡습니다. 다른 영역 변경도 이슈에 범위를 알리고 관련 담당자의 검토를 받습니다.

## 실행과 테스트

웹 앱은 `apps/web_cookiesh1/`에서 `npm install` 후 `npm run dev`로 실행합니다. API 서버가 없으면 `VITE_USE_MOCK=1`로 mock 데이터를 사용합니다. 실행 방법은 [웹 README](../../apps/web_cookiesh1/README.md)를 따릅니다.

[인수검증표](../testing/ACCEPTANCE.md)를 사용합니다. 본인의 기능 테스트는 이 문서 작성으로 실행된 것이 아닙니다. 실제 검증 시 아래 기록을 채웁니다.

## 개발 기록

| 날짜 | Issue / PR | 기능·파일 | 상태 | 실행 명령·결과 | 동료 리뷰 / 남은 작업 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-10 | 아직 없음 | 역할·코드 경로·문서 체계 등록 | 문서 작성 | 제품 검증 미실행 | 기능별 작은 이슈와 PR 등록 |
| 2026-10-11 | 브랜치 `feat/web-interview-track` | 인터뷰로 방향 결정([UI_DIRECTION](UI_DIRECTION.md)) → 적대적 검토 반영 → 6단계 화면·공통 UI·상태 표시·제안 계약 mock 구현 (`apps/web_cookiesh1/src/**`) | 로컬 완료 | typecheck·build 통과, `npm test` 16개 통과, mock 브라우저 시나리오 21개 통과 | 실제 API 연결 미실행, 인수 시나리오 미실행. 제안 계약 담당자 합의 필요, 동료 리뷰 필요 |
| 2026-10-11 | [PR #3](https://github.com/DaeUng79/5topilot_team/pull/3) | PR #1 웹 시작 앱을 `apps/web_cookiesh1/`로 이관, mock 모드(`src/api/mock.ts`) 추가 | main 병합 | `npm run typecheck`·`npm run build` 통과, mock 흐름 스크립트 통과 | 브라우저 확인 미실행, 실제 API 연결 미실행. PR #1 병합 시 `apps/web/` 제외 협의 |
| 2026-10-12~13 | 이번 PR | 디자인 시안 반영, 첫 화면·Toss식 로그인(가상 위원 바로 입장), 평가위원 왼쪽 칸, 관리자 사업 화면을 공동 흐름 7단계로 재구성(제안요청서·제안서 등록 포함), 업체·일정·완료 제안 계약 mock 추가 | PR 검토 대기 | typecheck·build 통과, `npm test` 21개 통과, mock 브라우저 시나리오 28개 통과, 실제 빌드에 시연 문구 없음 확인 | 실제 API 연결 미실행(공동 API 서버 없음), 인수 시나리오 미실행. 제안 계약 담당자 합의 필요 |

```text
담당 기능:
입력/출력 및 변경 파일:
API·DB·계약 변경:
선행 이슈와 관련 담당:
완료 조건:
실행 환경·커밋·테스트 명령:
실제 결과·증거:
미실행 항목·다음 작업:
```
