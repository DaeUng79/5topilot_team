# 팀 웹 화면

담당: **현수환 · cookiesh1**

메인·사업·문서·위원·평가·결과 화면

현재 상태: PR #1(Lex6won, `feat/team-development-foundation` @ `658748e`)의 `apps/web` React 시작 앱을 이 폴더로 옮기고, API 서버 없이 화면을 확인할 수 있는 mock 모드를 추가했습니다. 화면: 사업 관리, 평가위원 등록·추첨, 평가·제출·취합.

## 스택

React 19 + Vite + TypeScript, `openapi-fetch`(타입: `src/api/schema.d.ts`). `/api` 요청은 `127.0.0.1:8000`(apps/api)으로 프록시됩니다.

## 실행

Node 22.12 이상. 이 폴더에서 실행합니다.

```bash
npm install
npm run dev                  # 실제 API(127.0.0.1:8000) 연결
VITE_USE_MOCK=1 npm run dev  # API 없이 mock 데이터로 실행 (PowerShell: $env:VITE_USE_MOCK='1'; npm run dev)
npm run typecheck
npm run build
```

화면 주소: http://127.0.0.1:5173

## mock 모드

`src/api/mock.ts`가 API 경로를 메모리에서 흉내 냅니다. 합성 데이터(사업 1개, 평가항목 7개·80점, 제안사 3개, 후보 5명)를 쓰며 새로고침하면 초기화됩니다. 추첨 1회 제한, 배정 위원만 평가표 접근(403), 버전 충돌·제출 후 수정(409), 전원 제출 후 평균 공개를 재현합니다. mock 성공은 실제 서버 통합 성공과 별도로 기록합니다.

## 검증 기록

| 날짜 | 내용 | 결과 |
| --- | --- | --- |
| 2026-10-11 | `npm run typecheck`, `npm run build` | 통과 |
| 2026-10-11 | mock API 흐름 스크립트(추첨→저장→충돌→제출→잠금→취합) | 기대대로 동작 |
| 2026-10-11 | 브라우저 화면 확인 | 미실행 (dev 서버 200 응답만 확인) |
