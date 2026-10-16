"""Local v2 web/API entry point; leaves legacy run.py and real databases alone."""

import argparse
import asyncio
import logging
from pathlib import Path

import uvicorn

from committee_app.v2_http import WebSettings, create_app
from committee_app.v2_web_demo import local_runtime, seed_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="위원 v2 로컬 웹 연결 (실제 DB와 분리)")
    parser.add_argument(
        "--demo",
        action="store_true",
        required=True,
        help="합성 사업·위원을 사용하는 로컬 연결 모드 명시",
    )
    parser.add_argument("--port", type=int, default=5188)
    parser.add_argument("--web-port", type=int, default=5173)
    parser.add_argument(
        "--data-dir", type=Path, default=Path(__file__).resolve().parent / "data/web-v2"
    )
    args = parser.parse_args()
    if not all(1024 <= p <= 65535 for p in (args.port, args.web_port)):
        parser.error("포트는 1024~65535 범위여야 합니다.")
    runtime, code = local_runtime(args.data_dir)
    asyncio.run(seed_demo(runtime))
    settings = WebSettings(
        "web-demo-admin",
        code,
        synthetic_data=True,
        origins=tuple(
            f"http://{host}:{port}"
            for host in ("127.0.0.1", "localhost")
            for port in {args.port, args.web_port}
        ),
    )
    logging.basicConfig(level=logging.INFO)
    logging.info("연결 코드 파일: %s", args.data_dir.resolve() / "access-code.txt")
    uvicorn.run(
        create_app(runtime, settings),
        host="127.0.0.1",
        port=args.port,
        proxy_headers=False,
        access_log=False,
    )


if __name__ == "__main__":
    main()
