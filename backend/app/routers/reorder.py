from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db, utcnow
from ..models import Product
from ..services import DEMAND_WINDOW_DAYS, compute_reorder, recommendation, sales_stats
from datetime import timedelta

router = APIRouter(prefix="/api/reorder", tags=["reorder"])


def _stats(db: Session):
    return sales_stats(db, utcnow() - timedelta(days=DEMAND_WINDOW_DAYS))


@router.get("/recommendations")
def recommendations(only_needed: bool = False, db: Session = Depends(get_db)):
    stats = _stats(db)
    products = db.scalars(select(Product).where(Product.is_active.is_(True))).all()
    recs = [recommendation(p, stats) for p in products]
    if only_needed:
        recs = [r for r in recs if r["needs_order"]]
    return sorted(recs, key=lambda r: (-r["suggested_quantity"], r["name"]))


@router.post("/simulate")
def simulate(data: schemas.SimulateIn, db: Session = Depends(get_db)):
    """What-if: read-only. Nothing is written to the database."""
    product = db.get(Product, data.product_id)
    if not product:
        raise HTTPException(404, "Product not found.")
    baseline = recommendation(product, _stats(db))
    demand = baseline["daily_demand"] if data.daily_demand is None else data.daily_demand
    lead = baseline["lead_time_days"] if data.lead_time_days is None else data.lead_time_days
    safety = baseline["safety_stock"] if data.safety_stock is None else data.safety_stock
    calc = compute_reorder(demand, lead, safety, product.current_stock)
    scenario = {"daily_demand": demand, "lead_time_days": lead, "safety_stock": safety,
                "available_stock": product.current_stock, **calc}
    return {
        "baseline": baseline, "scenario": scenario,
        "delta_target": calc["target"] - baseline["target"],
        "delta_suggested": calc["suggested_quantity"] - baseline["suggested_quantity"],
        "saved": False,
    }
