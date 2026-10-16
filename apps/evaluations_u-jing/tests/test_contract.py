from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from db import Store

ROOT = Path(__file__).resolve().parents[1]


def test_evaluation_schema_matches_design() -> None:
    model = json.loads((ROOT / "contracts/schema_v2.json").read_text("utf8"))
    c = sqlite3.connect(":memory:")
    c.executescript(
        (ROOT / "migrations/20261016_yujin_evaluation_001.sql").read_text("utf8")
    )
    for table in (t for t in model["tables"] if t["db"] == "evaluation"):
        assert {
            r[1] for r in c.execute("PRAGMA table_info(" + table["name"] + ")")
        } == {f[0] for f in table["fields"]}
    assert c.execute("PRAGMA foreign_key_check").fetchall() == []
    c.close()


def test_workbook_scope() -> None:
    actions = json.loads((ROOT / "contracts/actions_v2.json").read_text("utf8"))[
        "actions"
    ]
    assert len(actions) == 73
    assert len([a for a in actions if a["in_scope"]]) == 48
    assert all("오대웅" not in a["owner"] for a in actions if a["in_scope"])


def test_all_owned_actions_have_handlers_and_design_folders() -> None:
    from committee_app.v2_gateway import ACTIONS as COMMITTEE
    from gateway import ACTIONS

    actions = json.loads((ROOT / "contracts/actions_v2.json").read_text("utf8"))[
        "actions"
    ]
    owned = {a["id"] for a in actions if a["in_scope"]}
    handlers = (
        set(ACTIONS)
        | set(COMMITTEE)
        | {"AUTH-01", "AUTH-02", "AUTH-03", "COM-03", "RES-05"}
    )
    assert owned <= handlers
    screen_root = ROOT.parent / "web_cookiesh1/src/screens"
    assert len(list(screen_root.glob("*/*/README.md"))) == 23


@pytest.mark.parametrize(
    "contract_name", ["original_design_v2.json", "excluded_daeung_v2.json"]
)
def test_protected_files_are_unchanged(contract_name: str) -> None:
    import hashlib

    contract = json.loads((ROOT / "contracts" / contract_name).read_text("utf8"))
    for name, expected in contract["files"].items():
        content = (ROOT.parents[1] / name).read_bytes()
        if expected["normalize_crlf"]:
            content = content.replace(b"\r\n", b"\n")
        assert hashlib.sha256(content).hexdigest() == expected["sha256"], name


def test_live_databases_match_columns_and_all_local_foreign_keys(store: Store) -> None:
    model = json.loads((ROOT / "contracts/schema_v2.json").read_text("utf8"))
    for database in ("admin", "evaluation"):
        with store.connect(database) as c:
            tables = [t for t in model["tables"] if t["db"] == database]
            assert len(tables) == (22 if database == "admin" else 27)
            actual = set()
            for table in tables:
                assert {
                    r[1] for r in c.execute("PRAGMA table_info(" + table["name"] + ")")
                } == {f[0] for f in table["fields"]}
                grouped: dict[int, list[sqlite3.Row]] = {}
                for r in c.execute("PRAGMA foreign_key_list(" + table["name"] + ")"):
                    grouped.setdefault(r[0], []).append(r)
                for group in grouped.values():
                    group.sort(key=lambda r: r[1])
                    actual.add(
                        (
                            table["name"],
                            tuple(r[3] for r in group),
                            group[0][2],
                            tuple(r[4] for r in group),
                        )
                    )
            expected = {
                (f["child"], tuple(f["cols"]), f["parent"], tuple(f["pcols"]))
                for f in model["singleFks"] + model["composites"]
                if f["db"] == database
            }
            assert expected <= actual, expected - actual
            assert c.execute("PRAGMA foreign_key_check").fetchall() == []
