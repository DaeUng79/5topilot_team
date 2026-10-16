import json
from pathlib import Path
from tempfile import TemporaryDirectory

from committee_app.main import Settings, create_app


def main() -> None:
    target = Path(__file__).parent / "contracts" / "openapi.json"
    target.parent.mkdir(exist_ok=True)
    with TemporaryDirectory() as folder:
        app = create_app(Settings(db_path=Path(folder) / "schema.db"))
        target.write_text(
            json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
