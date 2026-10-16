"""Attach behavior to immutable design HTML; never replace CSS or screen markup."""

from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import HTMLResponse

ROOT = Path(__file__).resolve().parent
WEB = ROOT.parent / "web_cookiesh1"
SCRIPT = re.compile(r"(<script\b[^>]*>)([\s\S]*?)(</script>)", re.IGNORECASE)


def connected_html(relative: str) -> HTMLResponse | None:
    """Opt-in served adapter. The tracked original is checked and remains untouched."""
    target = (WEB / "v2" / relative).resolve()
    if not target.is_relative_to((WEB / "v2").resolve()):
        raise HTTPException(404)
    if target.suffix != ".html" or not target.is_file():
        return None
    parts = relative.split("/")
    screen = (
        "ENTRY"
        if "00-입장" in parts
        else next((p[:5] for p in parts if re.match(r"(?:SA|PM|EV)-\d\d-", p)), "")
    )
    key = screen + ("-overview" if target.name == "overview.html" else "")
    folders = list((WEB / "src/screens").glob("*/" + screen + "-*"))
    binding = (
        (
            folders[0]
            / ("overview-binding.js" if key.endswith("-overview") else "binding.js")
        )
        if len(folders) == 1
        else WEB / "missing-binding"
    )
    if screen in {"PM-03", "PM-08", "EV-03", "EV-04", "EV-05"}:
        binding = WEB / "src/bindings/external-boundary.js"
    protected = json.loads(
        (ROOT / "contracts/original_design_v2.json").read_text("utf8")
    )
    file_key = "apps/web_cookiesh1/v2/" + relative
    content = target.read_bytes().replace(b"\r\n", b"\n")
    if hashlib.sha256(content).hexdigest() != protected["files"][file_key]["sha256"]:
        raise HTTPException(409, "원본 디자인 기준이 달라 연결을 중단했습니다.")
    html = content.decode("utf8")
    if not screen or not binding.is_file():
        return html_response(html)
    scripts = [m for m in SCRIPT.finditer(html) if "src=" not in m[1] and m[2].strip()]
    if not scripts:
        raise HTTPException(409, "원본 기능 스크립트를 확인하세요.")
    main = scripts[-1]
    source = main[2].strip()
    # These are prototype data constants, not markup or styling. The binding
    # replaces their values with the current session's authoritative data.
    if screen == "PM-05":
        source = source.replace("const CAP=7,MIN=5;", "let CAP=7,MIN=5;")
    if screen == "PM-06":
        source = source.replace("const N=7;", "let N=7;")
        source = source.replace("x.toFixed(1)", "x.toFixed(2)")
    if screen == "PM-07":
        source = source.replace("r.field===ff", "r.field.split(', ').includes(ff)")
    # Expose the original renderer's lexical data only inside its own function.
    source = re.sub(r"^\(function\s*\([^)]*\)\s*\{", "", source)
    if source != main[2].strip():
        source = re.sub(r"\}\)\(\);?\s*$", "", source)
    code = binding.read_text("utf8")
    wrapped = (
        '<script src="/src/bindings/common.js"></script>\n<script>\n'
        "(async function(){try{await Live.begin("
        + json.dumps(key)
        + ");\n"
        + source
        + "\n"
        + code
        + "\nLive.finish();}catch(error){Live.fail(error);}})();\n</script>"
    )
    rendered = html[: main.start()] + wrapped + html[main.end() :]
    return html_response(rendered)


def html_response(rendered: str) -> HTMLResponse:
    """Permit only the exact inline scripts in the verified, served document."""
    hashes = {
        "'sha256-"
        + base64.b64encode(hashlib.sha256(m[2].encode("utf8")).digest()).decode("ascii")
        + "'"
        for m in SCRIPT.finditer(rendered)
        if not re.search(r"\bsrc\s*=", m[1], re.IGNORECASE) and m[2].strip()
    }
    return HTMLResponse(
        rendered,
        headers={
            "Content-Security-Policy": "default-src 'self'; script-src 'self' "
            + " ".join(sorted(hashes))
            + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; "
            "base-uri 'none'; form-action 'self'"
        },
    )
