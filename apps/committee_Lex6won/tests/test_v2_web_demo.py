"""Local demo restart must preserve keys and user edits."""

import asyncio
from pathlib import Path

import pytest

from committee_app.v2_core import Context
from committee_app.v2_web_demo import local_runtime, seed_demo


def test_restart_preserves_keys_and_does_not_reseed_edited_candidates(tmp_path: Path) -> None:
    rt, code = local_runtime(tmp_path)
    asyncio.run(seed_demo(rt))
    with rt.connect(write=True) as conn:
        conn.execute("UPDATE evaluator_candidates SET active=0 WHERE name='가상위원01'")
        conn.execute(
            "UPDATE evaluator_candidates SET phone_lookup_hmac='changed' WHERE name='가상위원02'"
        )
    reopened, same_code = local_runtime(tmp_path)
    assert code == same_code
    assert rt.lookup("stable") == reopened.lookup("stable")
    asyncio.run(seed_demo(reopened))
    with reopened.connect() as conn:
        assert conn.execute("SELECT count(*) FROM evaluator_candidates").fetchone()[0] == 27
        assert (
            conn.execute(
                "SELECT active FROM evaluator_candidates WHERE name='가상위원01'"
            ).fetchone()[0]
            == 0
        )
        assert not conn.execute("PRAGMA foreign_key_check").fetchall()
        reopened.authorize(conn, Context("web-demo-admin"))
    (tmp_path / "keys.bin").unlink()
    with pytest.raises(ValueError, match="Restore"):
        local_runtime(tmp_path)


def test_bad_key_file_is_not_replaced(tmp_path: Path) -> None:
    (tmp_path / "keys.bin").write_bytes(b"incomplete")
    with pytest.raises(ValueError, match="Invalid"):
        local_runtime(tmp_path)
    assert (tmp_path / "keys.bin").read_bytes() == b"incomplete"
