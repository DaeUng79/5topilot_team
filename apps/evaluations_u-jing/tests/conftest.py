import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "committee_Lex6won"))

from run_web import setup
from web_api import create_app


@pytest.fixture
def store(tmp_path):
    return asyncio.run(setup(tmp_path, True, None))


@pytest.fixture
def app(store):
    return create_app(store, demo=True)
