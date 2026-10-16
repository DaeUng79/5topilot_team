# 팀 웹 화면

담당: **현수환 · cookiesh1**

기능명세 v2 기준 화면입니다. 이전 웹 앱(React, 10/12 버전)은 지웠고, 팀 작업은 이 폴더의 v2 화면으로 합니다.

## 보기

```bash
npm install
npm run dev     # http://127.0.0.1:5173 → v2 화면이 바로 열려요
```

서버 없이 `v2/index.html`을 브라우저로 열어도 됩니다.
원격 보기: https://raw.githack.com/DaeUng79/5topilot_team/main/apps/web_cookiesh1/v2/index.html

## 폴더

- `v2/` 화면 시안과 기획 (화면 지도 `v2/README.md`, 결정 `v2/_공통/DECISIONS.md`)
- `src/screens/` 화면 ID별 코드 폴더 (구현 예정)
- `public/fonts/` Pretendard GOV 글꼴

`/api`는 127.0.0.1:8000, `/document-api`는 127.0.0.1:8001로 프록시됩니다.
