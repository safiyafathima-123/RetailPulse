from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, utcnow
from ..models import Product, Sale
from ..services import all_alerts

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def dashboard(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    today = utcnow().date()
    start = today - timedelta(days=days - 1)
    active = Product.is_active.is_(True)

    product_count, stock_value, units_on_hand = db.execute(
        select(func.count(Product.id), func.coalesce(func.sum(Product.current_stock * Product.cost_price), 0),
               func.coalesce(func.sum(Product.current_stock), 0)).where(active)).one()

    alerts = all_alerts(db)
    low = sum(a["alert_type"] == "low" for a in alerts)
    out = sum(a["alert_type"] == "out" for a in alerts)

    revenue, units, n_sales = db.execute(
        select(func.coalesce(func.sum(Sale.quantity * Sale.unit_selling_price), 0),
               func.coalesce(func.sum(Sale.quantity), 0), func.count(Sale.id))
        .where(func.date(Sale.sold_at) >= start.isoformat())).one()

    daily = dict(db.execute(
        select(func.date(Sale.sold_at), func.sum(Sale.quantity * Sale.unit_selling_price))
        .where(func.date(Sale.sold_at) >= start.isoformat()).group_by(func.date(Sale.sold_at))).all())
    trend = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        trend.append({"date": d, "revenue": round(float(daily.get(d, 0)), 2)})

    return {
        "period_days": days, "start": start.isoformat(), "end": today.isoformat(),
        "active_products": product_count, "inventory_value": round(float(stock_value), 2),
        "units_on_hand": int(units_on_hand), "low_stock_count": low, "out_of_stock_count": out,
        "sales": {"revenue": round(float(revenue), 2), "units": int(units), "count": int(n_sales)},
        "trend": trend,
        "urgent": [a for a in alerts if a["alert_type"] in ("out", "low")][:6],
    }
