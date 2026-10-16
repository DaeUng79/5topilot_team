# 심사임당 v2 (2026-10-16 회의 피벗)

기존 실험(`exp/desk-metaphor`)과 분리해 새 구조를 잡는 폴더다. 지금은 **문서와 빈 골격만** 있다. 코드는 화면 구성 합의 뒤에 채운다.

## 진행 순서
1. 전체 구조: [ARCHITECTURE](docs/ARCHITECTURE.md), [DB 경계](docs/DB_CONTRACT.md)
2. 화면 구성: [화면 지도](docs/SCREEN_MAP.md) → `docs/screens/` 화면 카드
3. 세부 기능: 버튼 단위로 `docs/features/` 기능 카드
진행 방법은 [WORKFLOW](docs/WORKFLOW.md), 결정은 [DECISIONS](docs/DECISIONS.md)에 남긴다.

## 폴더
```
v2/
├─ docs/                 기획 문서 (지금 단계)
│  ├─ templates/         화면 카드 · 기능 카드 · 테이블 계약 템플릿
│  ├─ screens/admin|eval 화면 카드
│  └─ features/          기능 카드 (버튼 단위)
├─ web/src/              웹 하나 (React)
│  ├─ app/               라우터 · 로그인 · 권한 분기
│  ├─ admin/             A 담당: 총괄·부서관리자
│  ├─ eval/              B 담당: 평가위원·위원장
│  └─ shared/            공용 UI · 문서 뷰어 · API 호출
├─ api/app/              API 서버 하나 (Python)
│  ├─ routers/           주소별 입구
│  ├─ services/          문서 변환 · 추첨 · 집계 · 챗봇 연결
│  └─ models/            DB 테이블 정의
└─ db/                   마이그레이션 · 시드
```
