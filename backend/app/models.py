"""SQLAlchemy models. Supplier details live on Product (Version 1 keeps the schema minimal)."""
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, utcnow


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("current_stock >= 0", name="ck_stock_non_negative"),
        CheckConstraint("cost_price >= 0 AND selling_price >= 0", name="ck_price_non_negative"),
        CheckConstraint("reorder_threshold >= 0 AND safety_stock >= 0 AND lead_time_days >= 0",
                        name="ck_settings_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True)  # stored trimmed + upper-case
    category: Mapped[str] = mapped_column(String(60), default="General", index=True)
    cost_price: Mapped[float] = mapped_column(Float, default=0)
    selling_price: Mapped[float] = mapped_column(Float, default=0)
    current_stock: Mapped[int] = mapped_column(Integer, default=0)  # whole units
    reorder_threshold: Mapped[int] = mapped_column(Integer, default=0)
    safety_stock: Mapped[int] = mapped_column(Integer, default=0)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=0)
    manual_daily_demand: Mapped[float | None] = mapped_column(Float, nullable=True)
    supplier_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    supplier_contact: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    movements: Mapped[list["StockMovement"]] = relationship(back_populates="product")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_sale_qty_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_selling_price: Mapped[float] = mapped_column(Float)
    unit_cost_price: Mapped[float] = mapped_column(Float, default=0)  # cost at time of sale, for profit reports
    sold_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)

    product: Mapped[Product] = relationship()


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint("movement_type IN ('sale','restock','adjustment')", name="ck_movement_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    movement_type: Mapped[str] = mapped_column(String(12), index=True)
    quantity_change: Mapped[int] = mapped_column(Integer)  # negative for sales
    stock_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    product: Mapped[Product] = relationship(back_populates="movements")
