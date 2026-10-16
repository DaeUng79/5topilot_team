"""Read the supplied design/workbook without modifying either source."""

import hashlib
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DESIGN = Path("C:/coding/5topilot_team_backup_1016/docs/planning/2026-10-16")


def main() -> None:
    model = json.loads((DESIGN / "SCHEMA_ACTION_MODEL_V2.json").read_text("utf8"))
    out = ROOT / "contracts"
    out.mkdir(exist_ok=True)
    (out / "schema_v2.json").write_text(
        json.dumps(model, ensure_ascii=False, indent=2), "utf8"
    )
    workbook = Path("C:/coding/outputs/심사임당_v2_기능별_담당자_선정표.xlsx")
    wb = openpyxl.load_workbook(workbook, read_only=True, data_only=True)
    actions = []
    functions = {a["id"]: a for a in model["actions"]}
    for row in list(wb["기능별 담당"].values)[4:]:
        if not row[2]:
            continue
        action = functions[row[2]]
        actions.append(
            {
                "id": row[2],
                "label": row[3],
                "screens": row[7],
                "owner": row[9],
                "in_scope": "오대웅" not in str(row[9]),
                "module": action["module"],
                "function": action["fn"],
                "api": action["api"],
                "rule": row[6],
            }
        )
    evidence = {
        str(p): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [
            workbook,
            DESIGN / "diagrams_v2/index.html",
            DESIGN / "AUTOPILOT_DEVELOPMENT_HANDOFF_V2.html",
        ]
    }
    (out / "actions_v2.json").write_text(
        json.dumps(
            {
                "actions": actions,
                "sources": evidence,
                "owner_basis": "사용자 확인: 문서상 담당(참고) 기준, 김유진(제안) 공통 기능 포함; 기능 담당 선택 열은 공란",
            },
            ensure_ascii=False,
            indent=2,
        ),
        "utf8",
    )
    wb.close()
    migrations = ROOT / "migrations"
    migrations.mkdir(exist_ok=True)
    for db in ("admin", "evaluation"):
        tables = [
            t
            for t in model["tables"]
            if t["db"] == db
            and (
                db == "evaluation"
                or t["name"]
                in {
                    "departments",
                    "admin_users",
                    "admin_permissions",
                    "projects",
                    "project_vendors",
                    "auth_sessions",
                }
            )
        ]
        sql = [
            "-- Frozen v2 fields and local foreign keys. Never attach another database.",
            "PRAGMA foreign_keys=ON;",
        ]
        for t in tables:
            name = t["name"]
            cols = []
            for field, kind, desc in t["fields"]:
                typ = kind.split()[0].split("(")[0]
                col = f'"{field}" {typ}'
                if "!" in kind:
                    col += " NOT NULL"
                if "PRIMARY KEY" in kind:
                    col += " PRIMARY KEY"
                if "UNIQUE" in kind:
                    col += " UNIQUE"
                default = re.search(r"DEFAULT (\w+)", kind)
                if default:
                    col += " DEFAULT " + (
                        default[1] if default[1].isdigit() else "'" + default[1] + "'"
                    )
                if field in {"version", "source_version"}:
                    col += f" CHECK({field}>0)"
                if "(0/1)" in kind or field in {"active", "is_deleted", "is_scorable"}:
                    col += f" CHECK({field} IN (0,1))"
                if "CHECK >=0" in kind:
                    col += f" CHECK({field}>=0)"
                if "CHECK >=3" in kind:
                    col += f" CHECK({field}>=3)"
                if "CHECK >0" in kind and field not in {"version", "source_version"}:
                    col += f" CHECK({field}>0)"
                if "CHECK BETWEEN" in kind:
                    col += f" CHECK({field} BETWEEN 7 AND 9)"
                cols.append(col)
            unique = set(re.findall(r"UNIQUE\(([^)]+)\)", t.get("rules", "")))
            for u in model["uniques"]:
                d, n, c = u.split("|")
                if (d, n) == (db, name):
                    unique.add(c)
            for fk in model["singleFks"] + model["composites"]:
                if fk["db"] == db and fk["parent"] == name:
                    unique.add(",".join(fk["pcols"]))
            cols += ["UNIQUE(" + u + ")" for u in sorted(unique) if u != "id"]
            seen = set()
            for fk in model["singleFks"] + model["composites"]:
                if fk["db"] != db or fk["child"] != name:
                    continue
                clause = (
                    "FOREIGN KEY("
                    + ",".join(fk["cols"])
                    + ") REFERENCES "
                    + fk["parent"]
                    + "("
                    + ",".join(fk["pcols"])
                    + ") ON DELETE RESTRICT"
                )
                if clause not in seen:
                    cols.append(clause)
                    seen.add(clause)
            if name == "score_entries":
                cols.append("CHECK(score IS NULL OR score<=max_score_snapshot)")
            if name == "admin_users":
                cols.append(
                    "CHECK((role='SUPER_ADMIN' AND department_id IS NULL) OR (role='DEPARTMENT_ADMIN' AND department_id IS NOT NULL))"
                )
            sql.append(
                "CREATE TABLE IF NOT EXISTS "
                + name
                + " (\n  "
                + ",\n  ".join(cols)
                + "\n);"
            )
        (migrations / f"20261016_yujin_{db}_001.sql").write_text(
            "\n\n".join(sql) + "\n", "utf8"
        )


if __name__ == "__main__":
    main()
