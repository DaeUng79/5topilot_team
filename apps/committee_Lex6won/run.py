import argparse
import logging
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

import uvicorn

from committee_app.demo import seed_demo
from committee_app.main import Settings, create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Lex6won 평가위원 관리 로컬 앱")
    parser.add_argument("--port", type=int, default=5187)
    parser.add_argument("--db", type=Path)
    parser.add_argument("--local-admin", action="store_true", help="로컬 개발용 관리자 세션 사용")
    parser.add_argument("--demo-auth", action="store_true", help="문자 발송 없는 개발용 코드 확인")
    parser.add_argument("--demo-data", action="store_true", help="별도 시연 DB에 합성 후보 생성")
    parser.add_argument(
        "--lan-origin", default="", help="내부망 기기 테스트 주소 http://사설IP:포트"
    )
    args = parser.parse_args()
    if args.lan_origin:
        try:
            parsed = urlsplit(args.lan_origin)
            address = ip_address(parsed.hostname or "")
            if (
                parsed.scheme != "http"
                or parsed.port != args.port
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
                or address.version != 4
                or not address.is_private
                or address.is_loopback
                or address.is_unspecified
                or address.is_multicast
            ):
                raise ValueError("invalid LAN origin")
        except ValueError:
            parser.error("--lan-origin은 http://사설IPv4:실행포트 형식이어야 합니다.")
    if args.demo_data and args.db is not None:
        parser.error("--demo-data는 별도 demo.db에만 생성합니다. --db와 함께 사용하지 마세요.")
    db_path = args.db or Path(__file__).parent / "data" / (
        "demo.db" if args.demo_data else "committee.db"
    )
    if args.demo_data:
        seed_demo(db_path)
    settings = Settings(
        db_path=db_path,
        local_admin=args.local_admin,
        verification_mode="demo" if args.demo_auth else "disabled",
        port=args.port,
        demo_data=args.demo_data,
        public_origin=args.lan_origin,
    )
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.info("평가위원 관리: http://127.0.0.1:%s/ · DB: %s", args.port, db_path.resolve())
    logging.info(
        "운영 인증 미연결 · 로컬 관리자=%s · 개발용 인증=%s", args.local_admin, args.demo_auth
    )
    if args.lan_origin:
        logging.info("내부망 테스트 접속: %s · 관리자 로그인은 이 PC에서만 허용", args.lan_origin)
    uvicorn.run(
        create_app(settings),
        host="0.0.0.0" if args.lan_origin else "127.0.0.1",
        port=args.port,
        access_log=False,
    )


if __name__ == "__main__":
    main()
