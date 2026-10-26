import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["RETAILPULSE_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["RETAILPULSE_DATA_DIR"] = _tmp
os.environ["RETAILPULSE_SEED_DEMO"] = "0"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def make_product(client):
    def _make(**over):
        body = {"name": "Widget", "sku": "w-1", "category": "General", "cost_price": 10, "selling_price": 15,
                "current_stock": 10, "reorder_threshold": 5, "safety_stock": 6, "lead_time_days": 5}
        body.update(over)
        r = client.post("/api/products", json=body)
        assert r.status_code == 201, r.text
        return r.json()
    return _make
