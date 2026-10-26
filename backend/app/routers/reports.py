"""Reports: the same table feeds the on-screen preview and the CSV export."""
import csv
import io
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, utcnow
from ..models import Product, Sale
from ..services import all_alerts, stock_status

router = APIRouter(prefix="/api/reports", tags=["reports"])

ALERT_LABELS = {"out": "Out of stock", "low": "Low stock", "slow": "Slow-moving", "excess": "Excess stock"}


def _col(key, label, kind="text"):
    return {"key": key, "label": label, "kind": kind}  # kind: text | int | money


def _active_products(db: Session):
    return db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.name)).all()


def build_inventory(db, start, end):
    cols = [_col("sku", "SKU"), _col("name", "Product"), _col("category", "Category"),
            _col("supplier", "Supplier"), _col("stock", "Stock", "int"),
            _col("threshold", "Reorder threshold", "int"), _col("status", "Status"),
            _col("cost_price", "Cost price", "money"), _col("selling_price", "Selling price", "money")]
    names = {"ok": "In stock", "low": "Low stock", "out": "Out of stock"}
    rows = [{"sku": p.sku, "name": p.name, "category": p.category, "supplier": p.supplier_name or "",
             "stock": p.current_stock, "threshold": p.reorder_threshold,
             "status": names[stock_status(p.current_stock, p.reorder_threshold)],
             "cost_price": round(p.cost_price, 2), "selling_price": round(p.selling_price, 2)}
            for p in _active_products(db)]
    summary = [{"label": "Active products", "value": len(rows), "kind": "int"},
               {"label": "Total units", "value": sum(r["stock"] for r in rows), "kind": "int"}]
    return "Inventory list", False, cols, rows, summary


def build_alerts(db, start, end):
    cols = [_col("sku", "SKU"), _col("name", "Product"), _col("alert", "Alert"), _col("stock", "Stock", "int"),
            _col("threshold", "Reorder threshold", "int"), _col("supplier", "Supplier"), _col("reason", "Why flagged")]
    rows = [{"sku": a["sku"], "name": a["name"], "alert": ALERT_LABELS[a["alert_type"]],
             "stock": a["current_stock"], "threshold": a["reorder_threshold"],
             "supplier": a["supplier_name"] or "", "reason": a["reason"]} for a in all_alerts(db)]
    summary = [{"label": "Flagged products", "value": len(rows), "kind": "int"}]
    return "Stock-alert list", False, cols, rows, summary


def build_valuation(db, start, end):
    cols = [_col("sku", "SKU"), _col("name", "Product"), _col("stock", "Stock", "int"),
            _col("cost_price", "Cost price", "money"), _col("cost_value", "Value at cost", "money"),
            _col("selling_price", "Selling price", "money"), _col("retail_value", "Value at retail", "money"),
            _col("margin", "Potential margin", "money")]
    rows = []
    for p in _active_products(db):
        cv, rv = round(p.current_stock * p.cost_price, 2), round(p.current_stock * p.selling_price, 2)
        rows.append({"sku": p.sku, "name": p.name, "stock": p.current_stock,
                     "cost_price": round(p.cost_price, 2), "cost_value": cv,
                     "selling_price": round(p.selling_price, 2), "retail_value": rv,
                     "margin": round(rv - cv, 2)})
    summary = [{"label": "Inventory value (cost)", "value": round(sum(r["cost_value"] for r in rows), 2), "kind": "money"},
               {"label": "Value at retail", "value": round(sum(r["retail_value"] for r in rows), 2), "kind": "money"}]
    return "Inventory valuation", False, cols, rows, summary


def build_sales(db, start, end):
    lo, hi = datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)
    q = (select(Product.sku, Product.name, func.sum(Sale.quantity), func.count(Sale.id),
                func.sum(Sale.quantity * Sale.unit_selling_price), func.sum(Sale.quantity * Sale.unit_cost_price))
         .join(Product, Product.id == Sale.product_id)
         .where(Sale.sold_at >= lo, Sale.sold_at < hi)
         .group_by(Product.id).order_by(func.sum(Sale.quantity * Sale.unit_selling_price).desc()))
    cols = [_col("sku", "SKU"), _col("name", "Product"), _col("units", "Units sold", "int"),
            _col("sales", "Sales", "int"), _col("revenue", "Revenue", "money"),
            _col("cost", "Cost of goods", "money"), _col("profit", "Gross profit", "money")]
    rows = [{"sku": sku, "name": name, "units": int(u), "sales": int(n), "revenue": round(rev, 2),
             "cost": round(cost, 2), "profit": round(rev - cost, 2)} for sku, name, u, n, rev, cost in db.execute(q)]
    summary = [{"label": "Revenue", "value": round(sum(r["revenue"] for r in rows), 2), "kind": "money"},
               {"label": "Units sold", "value": sum(r["units"] for r in rows), "kind": "int"},
               {"label": "Gross profit", "value": round(sum(r["profit"] for r in rows), 2), "kind": "money"}]
    return "Sales summary", True, cols, rows, summary


BUILDERS = {"inventory": build_inventory, "alerts": build_alerts, "valuation": build_valuation, "sales": build_sales}


def _safe_cell(v):
    # Stop spreadsheet apps from treating text such as "=SUM(...)" as a formula.
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v
    return v


def _build(db, name, start, end):
    if name not in BUILDERS:
        raise HTTPException(404, f"Unknown report '{name}'.")
    end = end or utcnow().date()
    start = start or end - timedelta(days=29)
    if start > end:
        raise HTTPException(422, "Start date must be on or before the end date.")
    title, uses_dates, cols, rows, summary = BUILDERS[name](db, start, end)
    return {"key": name, "title": title, "uses_dates": uses_dates,
            "start": start.isoformat() if uses_dates else None, "end": end.isoformat() if uses_dates else None,
            "columns": cols, "rows": rows, "summary": summary}


@router.get("/{name}")
def get_report(name: str, start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    return _build(db, name, start, end)


@router.get("/{name}/csv")
def export_report(name: str, start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    r = _build(db, name, start, end)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([c["label"] for c in r["columns"]])
    for row in r["rows"]:
        writer.writerow([_safe_cell(row[c["key"]]) for c in r["columns"]])
    suffix = f"_{r['start']}_to_{r['end']}" if r["uses_dates"] else f"_{utcnow().date().isoformat()}"
    filename = f"retailpulse_{name}{suffix}.csv"
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
