"""Run from apps/api using its virtualenv; output is deterministic and committed."""

import json
from pathlib import Path

from app.main import app

target = Path(__file__).resolve().parents[1] / "contracts" / "openapi.json"
target.parent.mkdir(exist_ok=True)
target.write_text(
    json.dumps(app.openapi(), ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
)
print(target)
