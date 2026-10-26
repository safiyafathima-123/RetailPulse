from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db, utcnow
from ..models import Product, StockMovement
from ..services import stock_status

router = APIRouter(prefix="/api", tags=["products"])


def to_out(p: Product) -> schemas.ProductOut:
    out = schemas.ProductOut.model_validate(p)
    out.stock_status = stock_status(p.current_stock, p.reorder_threshold)
    return out


def _check_sku_free(db: Session, sku: str, exclude_id: int | None = None):
    existing = db.scalar(select(Product).where(Product.sku == sku))
    if existing and existing.id != exclude_id:
        raise HTTPException(409, f"SKU '{sku}' is already used by “{existing.name}”. SKUs must be unique.")


@router.get("/products", response_model=list[schemas.ProductOut])
def list_products(
    search: str | None = None,
    category: str | None = None,
    status: str = Query("active", pattern="^(active|archived|all)$"),
    stock: str | None = Query(None, pattern="^(ok|low|out)$"),
    db: Session = Depends(get_db),
):
    q = select(Product)
    if status == "active":
        q = q.where(Product.is_active.is_(True))
    elif status == "archived":
        q = q.where(Product.is_active.is_(False))
    if category:
        q = q.where(Product.category == category)
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.supplier_name.ilike(like)))
    products = db.scalars(q.order_by(Product.name)).all()
    out = [to_out(p) for p in products]
    if stock:
        out = [p for p in out if p.stock_status == stock]
    return out


@router.get("/categories", response_model=list[str])
def categories(db: Session = Depends(get_db)):
    return list(db.scalars(select(Product.category).distinct().order_by(Product.category)))


@router.post("/products", response_model=schemas.ProductOut, status_code=201)
def create_product(data: schemas.ProductCreate, db: Session = Depends(get_db)):
    _check_sku_free(db, data.sku)
    values = data.model_dump(exclude={"current_stock"})
    product = Product(**values, current_stock=data.current_stock)
    db.add(product)
    try:
        db.flush()
        if data.current_stock > 0:  # opening stock gets a history entry like any other change
            db.add(StockMovement(product_id=product.id, movement_type="adjustment",
                                 quantity_change=data.current_stock, stock_after=data.current_stock,
                                 reason="Opening stock", created_at=utcnow()))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"SKU '{data.sku}' is already used. SKUs must be unique.")
    db.refresh(product)
    return to_out(product)


@router.get("/products/{product_id}", response_model=schemas.ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found.")
    return to_out(product)


@router.put("/products/{product_id}", response_model=schemas.ProductOut)
def update_product(product_id: int, data: schemas.ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found.")
    _check_sku_free(db, data.sku, exclude_id=product_id)
    for key, value in data.model_dump().items():
        setattr(product, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"SKU '{data.sku}' is already used. SKUs must be unique.")
    db.refresh(product)
    return to_out(product)


def _set_active(db: Session, product_id: int, active: bool) -> schemas.ProductOut:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found.")
    product.is_active = active
    db.commit()
    db.refresh(product)
    return to_out(product)


@router.post("/products/{product_id}/archive", response_model=schemas.ProductOut)
def archive_product(product_id: int, db: Session = Depends(get_db)):
    return _set_active(db, product_id, False)


@router.post("/products/{product_id}/restore", response_model=schemas.ProductOut)
def restore_product(product_id: int, db: Session = Depends(get_db)):
    return _set_active(db, product_id, True)
