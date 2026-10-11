# 웹 화면 방향 결정 (인터뷰 트랙)

작성: 2026-10-11 · cookiesh1 인터뷰 결과. 구현 위치 `apps/web_cookiesh1/`.

## 1. 결정 요약

| 주제 | 결정 | 이유 |
| --- | --- | --- |
| 화면 구조 | 로그인 후 **관리자(`/admin`)·평가위원(`/eval`)** 라우트 분리 | 데모 구조와 같고, 역할별 권한 표시(SEC·COM-03)를 자연스럽게 재현 |
| 미정 API | `src/api/contract.ts`에 **제안 계약**을 정의하고 mock으로 동작 | 담당자와 합의할 초안. 실제 서버에 없으면 "미연결"로 표시 |
| 데모와 인수기준 충돌 | **인수기준 우선** | 전원 제출 전 결과 차단(RES-01), 서명 이미지로 확정 처리 금지(RES-03) |
| 시각 방향 | **KRDS 토큰 + 토스식 여백**, 순수 CSS | 데모 레이아웃(네이비 사이드바·흰 카드) 유지, 발표용 완성도 |
| 글꼴 | Pretendard GOV 동적 서브셋을 앱에 포함(`public/fonts`, OFL) | 오프라인·내부망에서도 같은 화면 |
| 로그인 | **평가위원만 토스식 단계형**(이름→휴대폰→인증번호), 사업 진입 시 청렴서약 바텀시트 | 처음 접속하는 외부위원의 부담 감소. 관리자는 일반 아이디·비밀번호 |
| 저장 | **명시 저장 + 브라우저 임시보관**, 제출·로그아웃 시 삭제 | EVAL-04 미저장 입력 손실 감소, 공용 PC 고려 |
| 시연 | mock 전용 **시연 도구 패널**(느린 응답·서버 오류·저장 실패·빈 데이터·초기화) | 로딩·오류·빈 상태를 발표·검증 때 재현 |
| 사용 환경 | 평가위원은 **회의실 노트북·PC** 기준, 태블릿에서 깨지지 않는 수준 | 인터뷰 응답 |

이번 범위에서 **제외**: 통계, 완료 사업 이력, 관리자 계정·권한 관리.
**데모로만 표시**: SMS 본인확인(인증번호는 화면에 표시), 위원장 확인(전자서명 아님), 엑셀 등록은 CSV(엑셀에서 열고 저장 가능).

## 2. 타겟 사용자 가정 (검증 필요)

- 외부 평가위원: 교수·연구원·기술사, 평가 당일 처음 접속, 교육 없이 발표 10~20분·질의 5~10분 사이에 채점. → 큰 글씨(본문 17px), 기준·근거·점수를 한 화면, 저장 상태를 늘 표시.
- 간사(부서 담당 공무원): 반복 업무, 감사 대비 기록. → 표 중심, 상태를 한눈에, 출력.

## 3. 레퍼런스와 채택 규칙

| 레퍼런스 | 채택한 규칙 |
| --- | --- |
| [KRDS 토큰](https://github.com/KRDS-uiux/krds-uiux) · [타이포그래피](https://www.krds.go.kr/html/site/style/style_03.html) | primary-50 `#256ef4`, 상태색은 배경 5단계·글자 60단계, 본문 최소 16px(17px 사용), 줄간격 150% 이상, 글자색은 50단계 이상 |
| 협상에 의한 계약(국가계약법 시행령 제43조) | 배점·산식은 사업마다 다름 → 화면에 산식을 고정하지 않고 "적용 정책"을 표시(RES-02) |
| 나라장터 제안평가 | 공개 자료로 평가위원 화면 절차를 찾지 못함. 위원 경험자·기관 매뉴얼 확인이 남음 |
| [Toss (Mobbin)](https://mobbin.com/flows/9efb5be3-24ca-4607-993e-6650be126a24) | 한 화면 한 질문, 굵은 두 줄 제목, 하단 꽉 찬 버튼, "꼭 필요한 동의만" 바텀시트 |
| [Workable](https://mobbin.com/screens/f1dec1f4-f366-4173-af70-a3fd4087ad94) · [15Five](https://mobbin.com/screens/04493c71-204e-4854-b311-bb16f372104b) | 평가표 하단 고정 바: 마지막 저장 시각 + 저장 + 제출, 제출 후 공개 대상 안내 |
| [Klaviyo 제출 점검](https://mobbin.com/screens/02359910-64f7-4f23-8280-f1bf18c8e95f) | 제출 전 점검 화면: 항목별 완료·누락 표시, 수정 불가 경고 |
| [Deel 상태 카드](https://mobbin.com/screens/439ce0f8-de4e-4210-8844-8c778baf587e) | 진행 화면 상태별 카운트 카드(제출·작성 중·미시작) |
| [Mistral Document AI](https://mobbin.com/screens/9d1334ff-fc93-4b2a-99b3-f16e2deedd10) · [Dovetail](https://mobbin.com/screens/b0539367-3968-4598-b566-a8899a50440b) | 원문과 추출·답변을 좌우 배치, 문장마다 쪽 번호 인용 칩, 칩을 누르면 원문 위치 강조 |
| [Elicit](https://mobbin.com/screens/6b7e1d2e-50e7-4414-b2b6-b542449be72f) · [Aboard](https://mobbin.com/screens/d15cd548-a758-4743-8944-99c825340019) | 파싱 작업 단계 표시, AI 후보를 사람이 검토·확정하는 패널 |

## 4. 미저장 입력 보호 동작 (EVAL-04 합의안)

| 상황 | 동작 |
| --- | --- |
| 저장 실패(네트워크·서버 오류) | 입력 유지, "저장 안 됨 · 다시 시도" 표시. 성공으로 표시하지 않음 |
| 새로고침·탭 닫힘 | 입력 즉시 브라우저(localStorage)에 임시보관 → 다시 열면 복원/버리기 선택 |
| 버전 충돌(EVAL-02) | 서버 값과 내 입력을 나란히 비교 → 서버 값 사용 또는 내 입력으로 다시 저장 |
| 저장하지 않고 이동 | 이동 전 경고 |
| 공용 PC | 서버 저장 성공·제출·로그아웃 시 임시보관 삭제, 24시간 지나면 자동 폐기 |

## 5. 제안 계약 (담당자 합의 필요)

`apps/web_cookiesh1/src/api/contract.ts`에 타입이 있습니다. 실제 API가 생기면 OpenAPI 생성 타입으로 교체합니다.

| 경로 | 용도 | 합의 대상 | 상태 |
| --- | --- | --- | --- |
| `POST /api/v1/auth/login`, `/auth/evaluator/otp`, `/auth/evaluator/verify` | 관리자 로그인, 평가위원 본인확인 | u-jing(SEC-01) | 제안 |
| `GET /api/v1/me/assignments` | 평가위원 배정 사업(예비위원 표시 포함) | Lex6won | 제안 |
| `GET/POST /projects/{id}/pledge/me` | 사업별 청렴서약 | Lex6won | 제안 |
| `GET/POST /projects/{id}/documents`, `GET /documents/{doc_id}` | 업로드·작업 상태·원문 블록 | DaeUng79(DOC-01·02) | 제안 |
| `GET /projects/{id}/criteria`, `POST /criteria/confirm` | AI 후보 기준 검토·사람 확정 | DaeUng79·u-jing(DOC-03) | 제안 |
| `GET /projects/{id}/matches` | 평가기준별 제안서 근거 | DaeUng79 | 제안 |
| `POST /projects/{id}/ask` | 근거 기반 질의응답 | DaeUng79(AI-01·02) | 제안 |
| `POST /projects/{id}/committee/draw`에 `exclusions` 추가, `GET /committee/exclusions`, `PUT /committee/chair` | 제척 사유 기록, 위원장 지정 | Lex6won(COM-01·03) | 제안 |
| `GET /projects/{id}/progress` | 진행 현황 | u-jing·Lex6won(PROG-01) | 제안 |
| `GET /projects/{id}/results/detail`, `POST /results/confirm` | 위원별 합계, 위원장 확인 기록(기존 `/results` 보완) | u-jing(RES-01·03) | 제안 |

근거 참조 필드는 문서 파이프라인(`documents_daeung`)의 `block_id`·`physical_page_numbers`에 맞췄습니다. 물리 쪽을 모르면 `null`로 두고 화면은 "쪽 미확인"으로 표시합니다(DOC-02).


## 6. 적대적 검토 반영 (2026-10-11)

- 실제 모드에서 인증 API가 없으면 차단 안내만 하고, 개발용 신원으로 우회하지 않습니다.
- 데모 요소(mock, 시드, 시연 도구, OTP 표시, 데모 계정)는 `VITE_USE_MOCK=1` 빌드에만 포함됩니다.
- mock에서 담당자 규칙(산식, 제척, 결과 접근, 기준 재확정)을 흉내 낸 부분에는 "mock 가정" 라벨을 붙였습니다.
- 기존 `/results`를 기준으로 하고 `/report` 신설은 철회했습니다.
- 시연용 "남은 위원 일괄 제출" 버튼 대신 "전원 제출 시드 전환"을 씁니다.
- 위원장의 결과 조회·확인 권한(전원 제출 후, 관리자+위원장)은 mock 가정이며 담당자 합의가 필요합니다.
