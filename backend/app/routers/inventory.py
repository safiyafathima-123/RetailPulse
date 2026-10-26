from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import Product, StockMovement
from ..services import change_stock, movement_out
from .products import to_out

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _result(movement, product) -> dict:
    return {"movement": movement_out(movement, product), "product": to_out(product)}


@router.post("/sales", response_model=schemas.StockChangeResult, status_code=201)
def record_sale(data: schemas.SaleIn, db: Session = Depends(get_db)):
    m, p = change_stock(db, data.product_id, -data.quantity, "sale", data.note or "Sale",
                        unit_price=data.unit_price, note=data.note)
    return _result(m, p)


@router.post("/restocks", response_model=schemas.StockChangeResult, status_code=201)
def record_restock(data: schemas.RestockIn, db: Session = Depends(get_db)):
    m, p = change_stock(db, data.product_id, data.quantity, "restock", (data.reason or "").strip() or "Restock")
    return _result(m, p)


@router.post("/adjustments", response_model=schemas.StockChangeResult, status_code=201)
def record_adjustment(data: schemas.AdjustmentIn, db: Session = Depends(get_db)):
    m, p = change_stock(db, data.product_id, data.quantity_change, "adjustment", data.reason)
    return _result(m, p)


@router.get("/movements", response_model=list[schemas.MovementOut])
def list_movements(
    product_id: int | None = None,
    movement_type: str | None = Query(None, pattern="^(sale|restock|adjustment)$"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = select(StockMovement, Product).join(Product, Product.id == StockMovement.product_id)
    if product_id:
        q = q.where(StockMovement.product_id == product_id)
    if movement_type:
        q = q.where(StockMovement.movement_type == movement_type)
    rows = db.execute(q.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit)).all()
    return [movement_out(m, p) for m, p in rows]
