"""Business rules: stock status, demand estimate, reorder maths, alerts, stock changes."""
import math
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .database import utcnow
from .models import Product, Sale, StockMovement

DEMAND_WINDOW_DAYS = 30        # recent period used for average daily demand
MIN_SALES_FOR_HISTORY = 3      # fewer sales records than this = "not enough history"
EXCESS_DAYS_OF_COVER = 90      # stock covering more than this many days of demand = excess
SLOW_MOVING_DAYS = 30          # no sales for this long (on an older product) = slow-moving

DEMAND_LABELS = {
    "sales_history": f"Recorded sales, last {DEMAND_WINDOW_DAYS} days",
    "manual_estimate": "Manual daily-demand estimate",
    "threshold_fallback": "Fallback: reorder threshold ÷ lead time (not a forecast)",
}


# ---------- pure calculations (unit-tested) ----------
def stock_status(stock: int, threshold: int) -> str:
    if stock <= 0:
        return "out"
    if stock <= threshold:
        return "low"
    return "ok"


def compute_reorder(daily_demand: float, lead_time_days: int, safety_stock: int, available: int) -> dict:
    """Reorder target = demand x lead time + safety stock; order = max(0, target - available).

    Target is rounded up to whole units (never under-order because of a fraction).
    """
    raw = daily_demand * lead_time_days + safety_stock
    target = math.ceil(round(raw, 6))
    suggested = max(0, target - available)
    formula = f"({daily_demand:.2f} × {lead_time_days}) + {safety_stock} = {target}"
    return {"target": target, "suggested_quantity": suggested, "formula": formula}


# ---------- demand ----------
def sales_stats(db: Session, since) -> dict[int, tuple[int, int]]:
    """product_id -> (units sold, number of sales) since a point in time."""
    rows = db.execute(
        select(Sale.product_id, func.sum(Sale.quantity), func.count(Sale.id))
        .where(Sale.sold_at >= since)
        .group_by(Sale.product_id)
    ).all()
    return {pid: (int(units), int(n)) for pid, units, n in rows}


def demand_for(product: Product, stats: dict[int, tuple[int, int]]) -> tuple[float, str, int]:
    units, n_sales = stats.get(product.id, (0, 0))
    if n_sales >= MIN_SALES_FOR_HISTORY:
        return units / DEMAND_WINDOW_DAYS, "sales_history", units
    if product.manual_daily_demand is not None:
        return product.manual_daily_demand, "manual_estimate", units
    return product.reorder_threshold / max(product.lead_time_days, 1), "threshold_fallback", units


def recommendation(product: Product, stats: dict[int, tuple[int, int]]) -> dict:
    daily, source, units = demand_for(product, stats)
    calc = compute_reorder(daily, product.lead_time_days, product.safety_stock, product.current_stock)
    status = stock_status(product.current_stock, product.reorder_threshold)
    if calc["suggested_quantity"] > 0:
        reason = (f"Target {calc['target']} units covers {product.lead_time_days} days of lead-time demand "
                  f"plus {product.safety_stock} safety stock; {product.current_stock} on hand, "
                  f"so order {calc['suggested_quantity']}.")
    else:
        reason = (f"{product.current_stock} on hand is at or above the target of {calc['target']}; "
                  f"no order needed.")
    return {
        "product_id": product.id, "sku": product.sku, "name": product.name,
        "supplier_name": product.supplier_name, "supplier_contact": product.supplier_contact,
        "available_stock": product.current_stock, "reorder_threshold": product.reorder_threshold,
        "lead_time_days": product.lead_time_days, "safety_stock": product.safety_stock,
        "daily_demand": round(daily, 4), "demand_source": source,
        "demand_source_label": DEMAND_LABELS[source],
        "units_sold_window": units, "window_days": DEMAND_WINDOW_DAYS,
        "stock_status": status, "needs_order": calc["suggested_quantity"] > 0, **calc, "reason": reason,
    }


# ---------- alerts ----------
def alert_for(product: Product, stats: dict[int, tuple[int, int]], now=None) -> dict | None:
    """Return an alert dict or None. Excess / slow-moving only when the data supports it."""
    now = now or utcnow()
    status = stock_status(product.current_stock, product.reorder_threshold)
    base = {"product_id": product.id, "sku": product.sku, "name": product.name, "category": product.category,
            "current_stock": product.current_stock, "reorder_threshold": product.reorder_threshold,
            "supplier_name": product.supplier_name}
    if status == "out":
        return {**base, "alert_type": "out", "reason": "Out of stock: 0 units on hand."}
    if status == "low":
        return {**base, "alert_type": "low",
                "reason": f"Low stock: {product.current_stock} on hand, at or below the threshold of "
                          f"{product.reorder_threshold}."}
    units, n_sales = stats.get(product.id, (0, 0))
    old_enough = product.created_at <= now - timedelta(days=SLOW_MOVING_DAYS)
    if units == 0 and old_enough:
        return {**base, "alert_type": "slow",
                "reason": f"Slow-moving: no sales in the last {SLOW_MOVING_DAYS} days with "
                          f"{product.current_stock} units on hand."}
    if n_sales >= MIN_SALES_FOR_HISTORY and units > 0:
        daily = units / DEMAND_WINDOW_DAYS
        cover = product.current_stock / daily
        if cover > EXCESS_DAYS_OF_COVER:
            return {**base, "alert_type": "excess",
                    "reason": f"Excess: {product.current_stock} units is about {cover:.0f} days of cover at "
                              f"{daily:.2f} units/day (limit {EXCESS_DAYS_OF_COVER} days)."}
    return None


def all_alerts(db: Session) -> list[dict]:
    stats = sales_stats(db, utcnow() - timedelta(days=DEMAND_WINDOW_DAYS))
    products = db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.name)).all()
    order = {"out": 0, "low": 1, "slow": 2, "excess": 3}
    alerts = [a for p in products if (a := alert_for(p, stats))]
    return sorted(alerts, key=lambda a: (order[a["alert_type"]], a["current_stock"], a["name"]))


# ---------- stock changes (single transaction) ----------
def movement_out(m: StockMovement, product: Product) -> dict:
    return {"id": m.id, "product_id": m.product_id, "product_name": product.name, "sku": product.sku,
            "movement_type": m.movement_type, "quantity_change": m.quantity_change,
            "stock_after": m.stock_after, "reason": m.reason, "sale_id": m.sale_id, "created_at": m.created_at}


def change_stock(db: Session, product_id: int, delta: int, movement_type: str, reason: str | None,
                 unit_price: float | None = None, note: str | None = None) -> tuple[StockMovement, Product]:
    """Validate, update stock and write the movement (and sale) in ONE transaction.

    The stock update is a conditional UPDATE (`current_stock + delta >= 0`), so even two
    simultaneous requests cannot push stock below zero. On any failure nothing is saved.
    """
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    if not product.is_active:
        raise HTTPException(409, f"{product.name} is archived. Restore it before recording stock changes.")
    try:
        result = db.execute(
            update(Product)
            .where(Product.id == product_id, Product.is_active.is_(True),
                   Product.current_stock + delta >= 0)
            .values(current_stock=Product.current_stock + delta, updated_at=utcnow())
        )
        if result.rowcount == 0:
            db.rollback()
            db.refresh(product)
            if movement_type == "sale":
                raise HTTPException(409, f"Not enough stock for {product.name}: "
                                         f"{product.current_stock} available, {-delta} requested. Stock unchanged.")
            raise HTTPException(409, f"Adjustment would make stock negative for {product.name}: "
                                     f"{product.current_stock} on hand, change of {delta}. Stock unchanged.")
        db.refresh(product)
        sale_id = None
        if movement_type == "sale":
            sale = Sale(product_id=product_id, quantity=-delta,
                        unit_selling_price=product.selling_price if unit_price is None else unit_price,
                        unit_cost_price=product.cost_price, sold_at=utcnow(), note=note)
            db.add(sale)
            db.flush()
            sale_id = sale.id
        movement = StockMovement(product_id=product_id, movement_type=movement_type, quantity_change=delta,
                                 stock_after=product.current_stock, reason=reason, sale_id=sale_id,
                                 created_at=utcnow())
        db.add(movement)
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise
    db.refresh(product)
    return movement, product
