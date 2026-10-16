"""Offline, human-readable ownership/action/schema map from frozen source contracts."""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    model = json.loads((ROOT / "contracts/schema_v2.json").read_text("utf8"))
    manifest = json.loads((ROOT / "contracts/actions_v2.json").read_text("utf8"))
    modules = {m["code"]: m for m in model["modules"]}
    esc = lambda value: html.escape(str(value))
    actions = "".join(
        "<tr>"
        + "".join(
            "<td>" + esc(value) + "</td>"
            for value in [
                a["id"],
                a["label"],
                a["screens"],
                a["owner"],
                modules[a["module"]]["file"],
                a["function"],
                "/api/v2/actions/" + a["id"]
                if a["in_scope"] and a["id"] != "COM-03"
                else "/committee-v2/api/imports/preview"
                if a["id"] == "COM-03"
                else "기존 담당 모듈 연계 대상",
            ]
        )
        + "</tr>"
        for a in manifest["actions"]
    )
    schemas = []
    for db in ("admin", "evaluation"):
        tables = [t for t in model["tables"] if t["db"] == db]
        details = []
        for t in tables:
            fields = "".join(
                "<tr>" + "".join("<td>" + esc(v) + "</td>" for v in f) + "</tr>"
                for f in t["fields"]
            )
            fks = [
                f
                for f in model["singleFks"] + model["composites"]
                if f["db"] == db and f["child"] == t["name"]
            ]
            relations = "".join(
                "<li>"
                + esc(
                    ", ".join(f["cols"])
                    + " → "
                    + f["parent"]
                    + " ("
                    + ", ".join(f["pcols"])
                    + ")"
                )
                + "</li>"
                for f in fks
            )
            details.append(
                f"<details><summary>{esc(t['name'])} · {len(t['fields'])}개 컬럼</summary><table><thead><tr><th>속성</th><th>타입·필수·키</th><th>의미</th></tr></thead><tbody>{fields}</tbody></table><h4>외래키</h4><ul>{relations or '<li>로컬 FK 없음</li>'}</ul><p>{esc(t.get('rules', ''))}</p></details>"
            )
        schemas.append(
            f"<section><h2>{db}.sqlite3 · {len(tables)}개 테이블</h2>"
            + "".join(details)
            + "</section>"
        )
    doc = (
        """<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>심사임당 v2 구현·연계 지도</title><style>
body{font-family:Malgun Gothic,system-ui,sans-serif;background:#f4f5f6;color:#1e2124;margin:0;line-height:1.65}header{background:#172c4a;color:white;padding:48px max(24px,5vw)}h1{font-size:34px;margin:8px 0}main{margin:30px auto;max-width:1400px;padding:0 24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}.card,section{background:white;border:1px solid #cdd1d5;border-radius:10px;padding:24px;margin-bottom:24px}.metric{font-size:38px;color:#0b50d0;font-weight:800}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px;border:1px solid #d9dee5;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#ecf2fe}details{border:1px solid #cdd1d5;border-radius:6px;padding:14px;margin:10px 0}summary{font-weight:700;cursor:pointer}.scroll{overflow:auto}.note{border-left:4px solid #c29400;padding:12px 16px;background:#fff8df}a{color:#0b50d0}code{font-size:14px}input{font:inherit;padding:12px;width:min(100%,600px);border:1px solid #89939d;border-radius:6px}small{color:#58616a}svg{max-width:100%;height:auto}li{margin:6px 0}@media print{header{background:white;color:black}details{break-inside:avoid}main{padding:0}section{border:0}}</style></head><body><header><small style="color:#c1d6fb">2026-10-16 · IMPLEMENTATION V2</small><h1>심사임당 구현·연계 지도</h1><p>원준석 · 김유진 담당 기능 / 화면과 Python API, SQLite의 연결</p></header><main>
<div class="grid"><div class="card">담당 기능<div class="metric">48</div>참고 열 기준·공통 기능 포함 확정</div><div class="card">화면 코드 폴더<div class="metric">23</div>PM-01 목록·상세 포함 24항목</div><div class="card">두 업무 DB<div class="metric">52</div>설계 49 + 원본 입력값 확장 3</div><div class="card">외부 담당 연계<div class="metric">25</div>오대웅 소스·DB 유지</div></div>
<section><h2>실행과 코드 위치</h2><p><code>start_simsa_v2.cmd</code> 실행 → <a href="http://127.0.0.1:5190/">통합 웹 열기</a></p><p>원본: <code>apps/web_cookiesh1/v2/</code> · 연결: <code>apps/web_cookiesh1/src/screens/*/*/binding.js</code><br>위원 기능: <code>apps/committee_Lex6won/</code><br>공통·평가 기능: <code>apps/evaluations_u-jing/</code></p><p class="note">SQLite 파일과 SQL을 화면 폴더에 넣지 않습니다. Git에서는 소스·migration·계약·seed를 합치고, 각자 DB를 생성합니다. 원본 문서·키·실행 DB는 Git 제외입니다.</p><p><a href="IMPLEMENTATION_V2.md">개발 인계 상세</a> · <a href="VERIFICATION_V2.md">검증 기록 및 제한 사항</a></p></section>
<section><h2>업무 흐름과 데이터 책임</h2><svg viewBox="0 0 1100 190" role="img" aria-label="사업과 위원은 admin DB, 참석과 평가 결과는 evaluation DB가 관리하며 문서 기준은 별도 계약으로 수신"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#256ef4"/></marker></defs><g fill="#ecf2fe" stroke="#90b5f5"><rect x="10" y="20" width="270" height="135" rx="10"/><rect x="410" y="20" width="280" height="135" rx="10"/><rect x="820" y="20" width="270" height="135" rx="10"/></g><g fill="#172c4a" font-size="19" font-family="sans-serif" text-anchor="middle"><text x="145" y="55">admin.sqlite3</text><text x="145" y="90">사업·업체·관리자</text><text x="145" y="125">후보 풀·추첨·초청 확정</text><text x="550" y="55">evaluation의 ref 테이블</text><text x="550" y="90">로컬 FK · 버전 고정</text><text x="550" y="125">inbox / ACK</text><text x="955" y="55">evaluation.sqlite3</text><text x="955" y="90">참석·위원장·점수·서명</text><text x="955" y="125">집계·최종 확정</text></g><g stroke="#256ef4" stroke-width="2" marker-end="url(#arrow)"><path d="M285 85 H400"/><path d="M695 85 H810"/></g><g fill="#58616a" font-size="14" font-family="sans-serif" text-anchor="middle"><text x="345" y="70">계약·outbox</text><text x="750" y="70">같은 DB의 FK</text><text x="550" y="184">문서 담당 DB → rfp.bound / criteria.approved / proposal.ready → 평가 고정본</text></g></svg><p>최종 결과의 <code>result.finalized</code> 수신 후 admin 사업이 완료됩니다. 문서 담당 수신기가 없는 documents 대상 메시지는 PENDING으로 유지합니다.</p></section>
<section><h2>73개 버튼의 담당·화면·함수 매핑</h2><p>48개 담당 기능은 통합 API로 연결했습니다. 외부 담당 25개는 원본 기능을 보존하고 연계 대상임을 표시합니다.</p><input id="filter" aria-label="버튼·담당자·화면 검색" placeholder="예: PM-05, 원준석, SCO-02"><div class="scroll"><table id="actions"><thead><tr><th>Action ID</th><th>기능</th><th>화면</th><th>담당 기준</th><th>기능 모듈</th><th>함수</th><th>실행 연결</th></tr></thead><tbody>"""
        + actions
        + """</tbody></table></div></section>"""
        + "".join(schemas)
        + """<section><h2>원본 화면 입력값 확장 테이블</h2><table><tr><th>DB / 테이블</th><th>속성</th><th>외래키</th></tr><tr><td>admin / project_evaluation_dates</td><td>project_id PK, evaluation_date, updated_at</td><td>project_id → projects.id</td></tr><tr><td>admin / admin_password_requirements</td><td>admin_id PK, must_change 0/1</td><td>admin_id → admin_users.id</td></tr><tr><td>evaluation / score_sheet_opinions</td><td>sheet_id PK, opinion 최대 4000자</td><td>sheet_id → score_sheets.id</td></tr></table><p>기존 설계의 속성을 바꾸지 않고 추가 migration으로 적용합니다. 제출 후 의견은 변경할 수 없고 서명 해시에 포함됩니다.</p></section><section><h2>문서 담당 영역의 경계</h2><p>문서 업로드·파싱·AI 추출·기준 승인·근거 매핑·챗봇은 기존 담당 소스를 변경하지 않았습니다. 현재 시연의 승인 평가표는 가상 자료이며 실제 문서 추출·사람 승인 결과가 아닙니다. 사용자 제공 원문 샘플은 로컬에서만 열람합니다.</p><p>전체 인수 완료 판정과 gg verify 상태는 검증 기록을 확인하세요.</p></section></main><script>document.getElementById('filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#actions tbody tr').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(q));});</script></body></html>"""
    )
    (ROOT / "IMPLEMENTATION_MAP_V2.html").write_text(doc, "utf8")


if __name__ == "__main__":
    main()
