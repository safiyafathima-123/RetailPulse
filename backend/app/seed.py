"""Sample data. Every seeded product is flagged is_sample=True and shown as "Sample" in the UI.

Run manually (wipes the database first):  python -m app.seed --reset
"""
import random
import sys
from datetime import timedelta

from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, utcnow
from .models import Product, Sale, StockMovement

# name, sku, category, cost, price, final stock, threshold, safety, lead, daily rate, supplier, manual demand
DEMO = [
    ("Basmati Rice 5kg", "DEMO-RICE-5", "Grocery", 310, 395, 10, 12, 6, 5, 4.0, "Sunrise Traders", None),
    ("Sunflower Oil 1L", "DEMO-OIL-1", "Grocery", 118, 149, 0, 15, 8, 4, 5.0, "Sunrise Traders", None),
    ("Toor Dal 1kg", "DEMO-DAL-1", "Grocery", 112, 145, 48, 20, 10, 4, 3.0, "Sunrise Traders", None),
    ("Tea Powder 500g", "DEMO-TEA-5", "Grocery", 165, 215, 9, 10, 5, 3, 2.0, "Green Leaf Co.", None),
    ("Whole Wheat Bread", "DEMO-BRD-1", "Bakery", 28, 40, 14, 15, 10, 1, 9.0, "City Bakes", None),
    ("Notebook A5 (pack of 5)", "DEMO-NB-A5", "Stationery", 95, 140, 60, 20, 10, 7, 2.5, "PaperWorks", None),
    ("Ball Pen Blue (box of 50)", "DEMO-PEN-50", "Stationery", 180, 260, 22, 8, 4, 7, 0.8, "PaperWorks", None),
    ("Laundry Detergent 1kg", "DEMO-DET-1", "Household", 98, 130, 7, 10, 6, 6, 1.6, "CleanHome Supplies", None),
    ("Dish Soap 500ml", "DEMO-DSH-5", "Household", 52, 75, 36, 12, 6, 6, 1.4, "CleanHome Supplies", None),
    ("LED Bulb 9W", "DEMO-LED-9", "Electrical", 70, 110, 140, 15, 8, 10, 0.2, "BrightLine", None),
    ("Extension Cord 3m", "DEMO-EXT-3", "Electrical", 210, 320, 18, 6, 3, 10, 0.0, "BrightLine", None),
    ("Phone Charging Cable", "DEMO-CBL-1", "Electrical", 85, 175, 3, 8, 4, 12, 0.0, "BrightLine", 0.7),
    ("Hand Sanitizer 250ml", "DEMO-SAN-2", "Household", 64, 99, 25, 10, 5, 5, 1.0, "CleanHome Supplies", None),
    ("Biscuits Family Pack", "DEMO-BIS-1", "Grocery", 24, 35, 70, 25, 12, 3, 5.5, "Green Leaf Co.", None),
]


def seed_demo_data(db: Session, history_days: int = 45) -> None:
    rng = random.Random(42)
    now = utcnow()
    first_day = now - timedelta(days=history_days)
    for (name, sku, cat, cost, price, final_stock, thr, safety, lead, rate, supplier, manual) in DEMO:
        # Plan the last 30 days of sales first, so opening stock can be set to land on `final_stock`.
        plan = []
        if rate > 0:
            for d in range(29, -1, -1):  # 30 calendar days, ending today
                if rate < 1:  # slow sellers: occasional single-unit sales
                    qty = 1 if rng.random() < rate else 0
                else:
                    qty = max(0, round(rng.gauss(rate, rate * 0.45)))
                if qty:
                    plan.append((d, qty))
        total = sum(q for _, q in plan)
        product = Product(name=name, sku=sku, category=cat, cost_price=cost, selling_price=price,
                          current_stock=final_stock + total, reorder_threshold=thr, safety_stock=safety,
                          lead_time_days=lead, supplier_name=supplier, supplier_contact=f"orders@{supplier.split()[0].lower()}.example",
                          manual_daily_demand=manual, is_sample=True, created_at=first_day, updated_at=first_day)
        db.add(product)
        db.flush()
        stock = product.current_stock
        db.add(StockMovement(product_id=product.id, movement_type="adjustment", quantity_change=stock,
                             stock_after=stock, reason="Opening stock (sample data)", created_at=first_day))
        for days_ago, qty in plan:
            if days_ago == 0:  # today's sales must not be in the future
                when = now - timedelta(minutes=rng.randint(5, 240))
            else:
                when = (now - timedelta(days=days_ago)).replace(hour=rng.randint(9, 20), minute=rng.randint(0, 59))
            sale = Sale(product_id=product.id, quantity=qty, unit_selling_price=price, unit_cost_price=cost,
                        sold_at=when, note="Sample sale")
            db.add(sale)
            db.flush()
            stock -= qty
            db.add(StockMovement(product_id=product.id, movement_type="sale", quantity_change=-qty,
                                 stock_after=stock, reason="Sample sale", sale_id=sale.id, created_at=when))
        assert stock == final_stock
        product.current_stock = final_stock
    db.commit()


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        seed_demo_data(session)
    print("Sample data loaded.")
