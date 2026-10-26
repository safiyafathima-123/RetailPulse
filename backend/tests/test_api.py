"""Covers the PRD acceptance checklist (section 7)."""
import csv
import io

from app.services import compute_reorder, stock_status


def stock(client, pid):
    return client.get(f"/api/products/{pid}").json()["current_stock"]


# --- reorder maths ---
def test_worked_example_from_prd():
    r = compute_reorder(daily_demand=4, lead_time_days=5, safety_stock=6, available=10)
    assert r["target"] == 26 and r["suggested_quantity"] == 16


def test_no_order_when_stock_above_target():
    assert compute_reorder(1, 2, 1, 50)["suggested_quantity"] == 0


def test_float_noise_does_not_inflate_target():
    assert compute_reorder(1.1, 10, 0, 0)["target"] == 11


def test_status_boundaries():
    assert stock_status(0, 5) == "out" and stock_status(5, 5) == "low" and stock_status(6, 5) == "ok"


# --- products ---
def test_create_edit_archive_persist(client, make_product):
    p = make_product()
    assert p["sku"] == "W-1" and p["current_stock"] == 10
    r = client.put(f"/api/products/{p['id']}", json={**p, "name": "Widget Pro", "reorder_threshold": 9})
    assert r.status_code == 200 and r.json()["name"] == "Widget Pro"
    assert client.get(f"/api/products/{p['id']}").json()["reorder_threshold"] == 9
    assert client.post(f"/api/products/{p['id']}/archive").json()["is_active"] is False
    assert client.get("/api/products").json() == []
    assert len(client.get("/api/products?status=archived").json()) == 1
    assert client.post(f"/api/products/{p['id']}/restore").json()["is_active"] is True


def test_duplicate_sku_rejected_case_and_space_insensitive(client, make_product):
    make_product(sku="ABC-1")
    r = client.post("/api/products", json={"name": "Other", "sku": "  abc-1 ", "category": "x", "cost_price": 1,
                                           "selling_price": 2, "reorder_threshold": 1, "safety_stock": 1,
                                           "lead_time_days": 1})
    assert r.status_code == 409 and "already used" in r.json()["detail"]


def test_validation_rejects_negatives(client):
    r = client.post("/api/products", json={"name": "Bad", "sku": "b", "cost_price": -1, "selling_price": 2,
                                           "reorder_threshold": 1, "safety_stock": -3, "lead_time_days": 1})
    assert r.status_code == 422 and "cost_price" in r.json()["fields"] and "safety_stock" in r.json()["fields"]


def test_opening_stock_creates_movement(client, make_product):
    p = make_product(current_stock=7)
    m = client.get(f"/api/inventory/movements?product_id={p['id']}").json()
    assert len(m) == 1 and m[0]["quantity_change"] == 7 and m[0]["stock_after"] == 7


# --- inventory ---
def test_sale_reduces_stock_and_logs_movement(client, make_product):
    p = make_product()
    r = client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 4})
    assert r.status_code == 201 and r.json()["product"]["current_stock"] == 6
    m = client.get(f"/api/inventory/movements?product_id={p['id']}&movement_type=sale").json()
    assert len(m) == 1 and m[0]["quantity_change"] == -4 and m[0]["stock_after"] == 6


def test_overselling_rejected_stock_unchanged(client, make_product):
    p = make_product(current_stock=3)
    r = client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 4})
    assert r.status_code == 409 and "Not enough stock" in r.json()["detail"]
    assert stock(client, p["id"]) == 3
    assert client.get(f"/api/inventory/movements?product_id={p['id']}&movement_type=sale").json() == []
    assert client.get("/api/reports/sales").json()["rows"] == []


def test_sale_of_exact_stock_allowed_to_zero(client, make_product):
    p = make_product(current_stock=3)
    assert client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 3}).status_code == 201
    assert stock(client, p["id"]) == 0


def test_restock_and_adjustment(client, make_product):
    p = make_product()
    assert client.post("/api/inventory/restocks", json={"product_id": p["id"], "quantity": 5}).json()["product"]["current_stock"] == 15
    r = client.post("/api/inventory/adjustments", json={"product_id": p["id"], "quantity_change": -2, "reason": "Damaged"})
    assert r.json()["product"]["current_stock"] == 13
    assert client.post("/api/inventory/adjustments", json={"product_id": p["id"], "quantity_change": -2, "reason": ""}).status_code == 422
    assert client.post("/api/inventory/adjustments", json={"product_id": p["id"], "quantity_change": 0, "reason": "none"}).status_code == 422
    assert client.post("/api/inventory/adjustments", json={"product_id": p["id"], "quantity_change": -99, "reason": "Lost"}).status_code == 409
    assert stock(client, p["id"]) == 13


def test_archived_product_cannot_be_sold(client, make_product):
    p = make_product()
    client.post(f"/api/products/{p['id']}/archive")
    assert client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 1}).status_code == 409


# --- alerts ---
def test_alert_changes_with_stock(client, make_product):
    p = make_product(current_stock=8, reorder_threshold=5)
    assert client.get("/api/alerts").json() == []
    client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 3})  # 5 -> low
    a = client.get("/api/alerts").json()
    assert len(a) == 1 and a[0]["alert_type"] == "low" and "threshold" in a[0]["reason"]
    client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 5})  # 0 -> out
    assert client.get("/api/alerts?type=out").json()[0]["alert_type"] == "out"
    client.post("/api/inventory/restocks", json={"product_id": p["id"], "quantity": 20})
    assert client.get("/api/alerts").json() == []


# --- reorder + simulator ---
def test_reorder_uses_fallback_then_sales_history(client, make_product):
    p = make_product(reorder_threshold=10, lead_time_days=5, safety_stock=6, current_stock=100)
    rec = client.get("/api/reorder/recommendations").json()[0]
    assert rec["demand_source"] == "threshold_fallback" and rec["daily_demand"] == 2.0  # 10 / 5
    # manual estimate takes over the fallback
    client.put(f"/api/products/{p['id']}", json={**p, "manual_daily_demand": 4, "reorder_threshold": 10})
    rec = client.get("/api/reorder/recommendations").json()[0]
    assert rec["demand_source"] == "manual_estimate" and rec["target"] == 26 and rec["suggested_quantity"] == 0
    # 3+ sales: history wins. 90 units sold in window / 30 days = 3/day
    for _ in range(3):
        client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 30})
    rec = client.get("/api/reorder/recommendations").json()[0]
    assert rec["demand_source"] == "sales_history" and rec["daily_demand"] == 3.0
    assert rec["target"] == 3 * 5 + 6 and rec["suggested_quantity"] == 21 - 10  # 100 - 90 sold = 10 left


def test_prd_worked_example_through_api(client, make_product):
    p = make_product(current_stock=10, lead_time_days=5, safety_stock=6, manual_daily_demand=4)
    rec = client.get("/api/reorder/recommendations").json()[0]
    assert (rec["target"], rec["suggested_quantity"]) == (26, 16)
    assert rec["formula"] == "(4.00 × 5) + 6 = 26"


def test_simulation_changes_output_but_not_data(client, make_product):
    p = make_product(current_stock=10, lead_time_days=5, safety_stock=6, manual_daily_demand=4)
    before = client.get(f"/api/products/{p['id']}").json()
    movements_before = client.get("/api/inventory/movements").json()
    r = client.post("/api/reorder/simulate", json={"product_id": p["id"], "daily_demand": 6, "lead_time_days": 7,
                                                   "safety_stock": 10}).json()
    assert r["baseline"]["target"] == 26 and r["scenario"]["target"] == 52 and r["scenario"]["suggested_quantity"] == 42
    assert r["delta_suggested"] == 26 and r["saved"] is False
    assert client.get(f"/api/products/{p['id']}").json() == before
    assert client.get("/api/inventory/movements").json() == movements_before
    assert client.get("/api/reorder/recommendations").json()[0]["target"] == 26


# --- reports / CSV ---
def test_csv_matches_report_rows(client, make_product):
    a = make_product(sku="A-1", name="Alpha")
    make_product(sku="B-1", name='=Evil("x")')
    client.post("/api/inventory/sales", json={"product_id": a["id"], "quantity": 2})
    for name in ("inventory", "alerts", "valuation", "sales"):
        rep = client.get(f"/api/reports/{name}").json()
        raw = client.get(f"/api/reports/{name}/csv")
        assert raw.status_code == 200 and "attachment" in raw.headers["content-disposition"]
        rows = list(csv.reader(io.StringIO(raw.text.lstrip("\ufeff"))))
        assert rows[0] == [c["label"] for c in rep["columns"]]
        assert len(rows) - 1 == len(rep["rows"])
        for csv_row, row in zip(rows[1:], rep["rows"]):
            for cell, col in zip(csv_row, rep["columns"]):
                v = row[col["key"]]
                assert cell == ("'" + v if isinstance(v, str) and v and v[0] in "=+-@" else str(v))
    sales = client.get("/api/reports/sales").json()
    assert sales["rows"][0]["units"] == 2 and sales["rows"][0]["revenue"] == 30
    val = client.get("/api/reports/valuation").json()
    assert val["summary"][0]["value"] == 8 * 10 + 10 * 10


def test_report_date_validation(client):
    assert client.get("/api/reports/sales?start=2026-02-01&end=2026-01-01").status_code == 422
    assert client.get("/api/reports/nope").status_code == 404


def test_dashboard(client, make_product):
    p = make_product(current_stock=2, reorder_threshold=5)
    client.post("/api/inventory/sales", json={"product_id": p["id"], "quantity": 1})
    d = client.get("/api/dashboard?days=7").json()
    assert d["active_products"] == 1 and d["low_stock_count"] == 1 and d["sales"]["units"] == 1
    assert len(d["trend"]) == 7 and d["trend"][-1]["revenue"] == 15 and d["urgent"][0]["alert_type"] == "low"
