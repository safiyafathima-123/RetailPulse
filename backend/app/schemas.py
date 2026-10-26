"""Pydantic request/response schemas with validation rules."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MovementType = Literal["sale", "restock", "adjustment"]
StockStatus = Literal["ok", "low", "out"]


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sku: str = Field(min_length=1, max_length=40)
    category: str = Field(default="General", min_length=1, max_length=60)
    cost_price: float = Field(ge=0, le=10_000_000)
    selling_price: float = Field(ge=0, le=10_000_000)
    reorder_threshold: int = Field(ge=0, le=1_000_000)
    safety_stock: int = Field(ge=0, le=1_000_000)
    lead_time_days: int = Field(ge=0, le=365)
    manual_daily_demand: float | None = Field(default=None, ge=0, le=1_000_000)
    supplier_name: str | None = Field(default=None, max_length=120)
    supplier_contact: str | None = Field(default=None, max_length=120)

    @field_validator("name", "category", mode="before")
    @classmethod
    def _strip_required(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("sku", mode="before")
    @classmethod
    def _normalise_sku(cls, v):
        # SKU uniqueness is case-insensitive and ignores surrounding spaces.
        return v.strip().upper() if isinstance(v, str) else v

    @field_validator("supplier_name", "supplier_contact", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class ProductCreate(ProductBase):
    current_stock: int = Field(default=0, ge=0, le=10_000_000)


class ProductUpdate(ProductBase):
    """Stock is intentionally not editable here: use Inventory & Sales so history is kept."""


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    sku: str
    category: str
    cost_price: float
    selling_price: float
    current_stock: int
    reorder_threshold: int
    safety_stock: int
    lead_time_days: int
    manual_daily_demand: float | None
    supplier_name: str | None
    supplier_contact: str | None
    is_active: bool
    is_sample: bool
    created_at: datetime
    updated_at: datetime
    stock_status: StockStatus = "ok"


class SaleIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=1_000_000)
    unit_price: float | None = Field(default=None, ge=0, le=10_000_000)
    note: str | None = Field(default=None, max_length=200)


class RestockIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=1_000_000)
    reason: str | None = Field(default=None, max_length=200)


class AdjustmentIn(BaseModel):
    product_id: int
    quantity_change: int = Field(description="Positive adds stock, negative removes it", le=1_000_000, ge=-1_000_000)
    reason: str = Field(min_length=3, max_length=200)

    @field_validator("quantity_change")
    @classmethod
    def _non_zero(cls, v):
        if v == 0:
            raise ValueError("Quantity change cannot be zero")
        return v

    @field_validator("reason", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class MovementOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    sku: str
    movement_type: MovementType
    quantity_change: int
    stock_after: int
    reason: str | None
    sale_id: int | None
    created_at: datetime


class StockChangeResult(BaseModel):
    movement: MovementOut
    product: ProductOut


class SimulateIn(BaseModel):
    product_id: int
    daily_demand: float | None = Field(default=None, ge=0, le=1_000_000)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)
    safety_stock: int | None = Field(default=None, ge=0, le=1_000_000)
