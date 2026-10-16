import asyncio

from committee_app.excel import MAX_BYTES
from committee_app.limits import BodyLimitMiddleware


def test_streamed_request_without_content_length_is_bounded() -> None:
    invoked = False
    sent = []
    messages = iter(
        [
            {"type": "http.request", "body": b"x" * MAX_BYTES, "more_body": True},
            {"type": "http.request", "body": b"x" * 65537, "more_body": False},
        ]
    )

    async def downstream(scope, receive, send) -> None:
        nonlocal invoked
        invoked = True

    async def receive():
        return next(messages)

    async def send(message):
        sent.append(message)

    asyncio.run(BodyLimitMiddleware(downstream)({"type": "http", "method": "POST"}, receive, send))
    assert not invoked
    assert sent[0]["status"] == 413


def test_valid_body_replayed_once() -> None:
    bodies = []

    async def downstream(scope, receive, send) -> None:
        bodies.append(await receive())

    async def receive():
        return {"type": "http.request", "body": b"payload", "more_body": False}

    async def send(message):
        pass

    asyncio.run(BodyLimitMiddleware(downstream)({"type": "http", "method": "POST"}, receive, send))
    assert bodies == [{"type": "http.request", "body": b"payload", "more_body": False}]
