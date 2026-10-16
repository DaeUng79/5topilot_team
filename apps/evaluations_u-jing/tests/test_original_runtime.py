"""Original-screen checks; these do not substitute for browser interaction tests."""

import base64
import hashlib
import re

from design_runtime import SCRIPT, WEB, connected_html
from fastapi.testclient import TestClient
from web_api import create_app


def test_connected_original_keeps_markup_and_allows_its_scripts(store):
    relative = "사업담당자/PM-00-로그인/시안/login.html"
    original = (WEB / "v2" / relative).read_text("utf8")
    with TestClient(create_app(store, demo=True, original_ui=True)) as client:
        response = client.get("/v2/" + relative)
    assert response.status_code == 200
    assert "Live.begin(" in response.text
    # Only behavior scripts may differ: all layout, styles and content stay intact.
    assert SCRIPT.sub("", response.text).split() == SCRIPT.sub("", original).split()
    policy = response.headers["content-security-policy"]
    for match in SCRIPT.finditer(response.text):
        if not re.search(r"\bsrc\s*=", match[1], re.IGNORECASE) and match[2].strip():
            checksum = base64.b64encode(
                hashlib.sha256(match[2].encode()).digest()
            ).decode()
            assert "'sha256-" + checksum + "'" in policy
    assert "script-src 'self' 'unsafe-inline'" not in policy


def test_excluded_actions_are_not_local_handlers():
    import json

    from committee_app.v2_gateway import ACTIONS as COMMITTEE
    from gateway import ACTIONS

    actions = json.loads(
        (WEB.parent / "evaluations_u-jing/contracts/actions_v2.json").read_text("utf8")
    )["actions"]
    excluded = {a["id"] for a in actions if "오대웅" in a["owner"]}
    assert len(excluded) == 25
    assert excluded.isdisjoint(set(ACTIONS) | set(COMMITTEE))


def test_all_original_html_preserves_markup_and_hash_csp():
    checked = []
    for target in (WEB / "v2").rglob("*.html"):
        relative = target.relative_to(WEB / "v2").as_posix()
        response = connected_html(relative)
        assert response is not None, relative
        rendered = bytes(response.body).decode("utf8")
        assert (
            SCRIPT.sub("", rendered).split()
            == SCRIPT.sub("", target.read_text("utf8")).split()
        ), relative
        for match in SCRIPT.finditer(rendered):
            if (
                not re.search(r"\bsrc\s*=", match[1], re.IGNORECASE)
                and match[2].strip()
            ):
                checksum = base64.b64encode(
                    hashlib.sha256(match[2].encode()).digest()
                ).decode()
                assert (
                    "'sha256-" + checksum + "'"
                    in response.headers["content-security-policy"]
                )
        checked.append(relative)
    assert len(checked) == 25
