"""Local integrated web host. Explicit synthetic mode, no external API calls."""

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "committee_Lex6won"))

from committee_app.v2_web_demo import local_runtime
from db import Store


async def setup(folder: Path, demo: bool, samples: Path | None) -> Store:
    runtime, _ = local_runtime(folder)
    store = Store(runtime, folder / "evaluation.sqlite3")
    await store.initialize()
    if demo:
        from demo_data import seed

        await seed(store, samples)
    return store


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Create isolated synthetic accounts and fixtures",
    )
    parser.add_argument("--port", type=int, default=5190)
    parser.add_argument(
        "--original-ui",
        action="store_true",
        default=True,
        help="Attach separate API bindings to immutable original design screens",
    )
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data/original-demo-v2")
    parser.add_argument("--samples", type=Path)
    args = parser.parse_args()
    store = asyncio.run(setup(args.data_dir.resolve(), args.demo, args.samples))
    import uvicorn
    from web_api import create_app

    uvicorn.run(
        create_app(store, demo=args.demo, port=args.port, original_ui=args.original_ui),
        host="127.0.0.1",
        port=args.port,
    )


if __name__ == "__main__":
    main()
