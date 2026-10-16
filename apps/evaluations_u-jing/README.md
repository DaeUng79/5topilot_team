# 평가·결과 및 공통 기능 v2

김유진 담당 평가·공통 기능과 원준석 위원 모듈을 확정된 원본 화면에 연결했습니다. `web_cookiesh1/v2`의 HTML·CSS·공통 디자인 스크립트는 보존합니다. 별도 `binding.js`가 기존 버튼을 Python API와 연결합니다.

저장소 루트에서 `start_simsa_v2.cmd` 실행 → http://127.0.0.1:5190/ . 원본 입장 화면에서 역할을 선택하고 로그인하세요. 개발용 화면 목록은 `/v2/index.html`에 있습니다. HTML 파일만 열면 DB 기능은 동작하지 않습니다.

**2026-10-17 수정:** [평가위원 전체 업무 흐름 복구 결과](COMMITTEE_FLOW_FIX_2026-10-17.md). 사업 등록의 평가일, 일반 평가위원 로그인, 사업 ID를 유지하는 단계 이동, 서버 기준 참석·위원장·평가 권한을 연결했습니다. 실제 버튼을 따라 최종 결과까지 검증했습니다.

```powershell
apps/committee_Lex6won/.venv/Scripts/python.exe apps/evaluations_u-jing/run_web.py --demo --original-ui --port 5190 --samples "C:/coding/제안요청서, 제안서 샘플"
apps/committee_Lex6won/.venv/Scripts/python.exe -m pytest -q
```

- 총괄관리자 `super-demo`, 부서관리자 `web-demo` / 비밀번호 `DemoOnly!2026`
- 평가위원: 일반 입장에서 성명 `가상위원01`~`가상위원07`, 뒤 4자리 `0001`~`0007`. 복수 초청이면 사업 선택. `?project_id=demo-evaluation` 전용 링크도 지원.
- DB 기본 위치: `data/original-demo-v2/admin.sqlite3`, `evaluation.sqlite3`. `--data-dir`로 분리 가능. 기존 `data/integrated-demo-v2` 자료는 보존했습니다.
- `--demo`는 가상 명단·업체·승인 평가표를 생성합니다. 샘플 문서에서 실제 추출한 승인표가 아닙니다.
- SQL migration, 소스, 계약, seed를 공유합니다. 실행 DB·암호화 키·샘플 원문은 Git 제외입니다.
- 기존 위원 앱의 Python 3.11 가상환경을 사용했습니다. 패키지 추가·버전 변경은 없습니다. 다른 PC는 기관 패키지 게이트와 기존 의존성 안내를 따라 환경을 준비하세요.

[결과보고](RESULT_REPORT_2026-10-16.md) · [원본 화면별 연결](DESIGN_CONNECTION_STATUS.md) · [기능·DB 인계](IMPLEMENTATION_V2.md) · [매핑 지도](IMPLEMENTATION_MAP_V2.html) · [검증 기록](VERIFICATION_V2.md)

오대웅의 파싱·AI·문서 조회/비교·챗봇은 제외했습니다. 원본에 없는 버튼은 추가하지 않았습니다. 이전 별도 UI는 `prototypes/unapproved_web`에 보관하며 서버에서 제공하지 않습니다. 기존 `de.py`는 사용하지 않는 원본 초안으로 보존했습니다.
