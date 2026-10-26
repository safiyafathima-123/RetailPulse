# RetailPulse — Project Report

## 1. Problem
Small retailers often track stock in spreadsheets or in billing records that are separate from inventory. Low stock goes unnoticed, nobody can say why a number changed, and reorder quantities are guesses. RetailPulse is a focused prototype that keeps product records, stock movements, alerts and reorder guidance in one traceable place.

## 2. Scope
Built exactly to the PRD v1.0 module list: Dashboard, Products, Inventory & Sales, Stock Alerts, Reorder Recommendations (with an embedded What-if Simulator), Reports & CSV export. Deliberately excluded: AI chatbot, ML forecasting, multi-user roles, multi-branch, automated ordering, payments, tax/accounting, mobile app, camera barcode scanning. None of these appear as controls in the UI.

## 3. Design
**Navigation:** one left sidebar with six items; on narrow screens it becomes a slide-in menu. The simulator lives inside Reorder Recommendations.
**Visual:** white and soft-grey surfaces, navy text, restrained teal accent, one chart. Status uses consistent badges (green/amber/red/blue). Every list has loading, empty and error states; archive uses a confirmation dialog; actions confirm with a toast.
**Architecture:** React SPA → REST/JSON → FastAPI → SQLAlchemy → SQLite. All business rules (validation, stock changes, demand, reorder, alerts, reports) live in the backend so the UI cannot bypass them.

## 4. Data model
* **Product** — name, unique SKU, category, cost/selling price, current stock, reorder threshold, safety stock, lead time, optional manual daily demand, supplier name/contact (kept on the product per the PRD's "simplest" option), active flag, sample flag, timestamps.
* **Sale** — product, quantity, unit selling price, unit cost at time of sale (so profit reports stay correct if cost changes later), timestamp, note.
* **StockMovement** — product, type (sale/restock/adjustment), signed quantity change, stock after, reason, optional sale link, timestamp.

## 5. Calculations
```
target    = ceil(daily demand × lead time + safety stock)
suggested = max(0, target − available stock)
```
Demand source priority: (1) last-30-day sales ÷ 30 when ≥ 3 sales; (2) manual estimate; (3) reorder threshold ÷ max(lead time, 1), labelled as a non-forecast fallback. Each recommendation displays demand, lead time, safety stock, available stock, the substituted formula, and a sentence explaining the result. The PRD example (4 × 5 + 6 = 26; 26 − 10 = 16) is an automated test.

Alert rules: out = 0 units; low = stock ≤ threshold; slow-moving = product older than 30 days with no sales in 30 days; excess = more than 90 days of cover from sales-history demand. Slow/excess are only evaluated where that data exists.

## 6. Implementation notes
* Stock changes run in one transaction with a conditional UPDATE, making overselling impossible even under concurrent requests.
* Reports are built once and used for both the on-screen table and the CSV, so exports match what is shown.
* Validation errors are returned as a readable message plus a per-field map that the forms display next to the fields.
* Sample data is generated deterministically and kept internally consistent (opening stock + sales = current stock; last movement's "stock after" always equals current stock).

## 7. Testing
Automated (pytest, 20 tests) mapped to the PRD checklist:

| PRD test | Covered by |
|---|---|
| Create/edit/archive persists | `test_create_edit_archive_persist` |
| Duplicate SKU | `test_duplicate_sku_rejected_case_and_space_insensitive` |
| Record sale | `test_sale_reduces_stock_and_logs_movement` |
| Overselling | `test_overselling_rejected_stock_unchanged` (also checks no sale/movement row is written) |
| Restock / adjustment | `test_restock_and_adjustment` (reason required, no negative stock) |
| Stock alert | `test_alert_changes_with_stock` |
| Reorder calculation | `test_worked_example_from_prd`, `test_prd_worked_example_through_api` |
| What-if simulation | `test_simulation_changes_output_but_not_data` |
| CSV export | `test_csv_matches_report_rows` (all four reports) |
| Error/empty states | validation and date-range tests; UI states checked manually |

Browser checks (headless Chromium): duplicate-SKU message, oversell rejection, sale recorded, simulator recalculation, and no horizontal page scroll at 390 px width on any screen. Screenshots are in `docs/screenshots/`.

Not tested automatically: front-end components (no unit tests), persistence across a full process restart beyond SQLite file storage, and long-running concurrency.

## 8. Limitations
Single location; no authentication; UTC date boundaries; float money; the demand estimate is a simple 30-day average that ignores seasonality and stock-outs (a product that was out of stock sells nothing, so its demand can be understated); no purchase-order tracking, so a recommendation is not remembered after a restock other than via the movement log.

## 9. Future improvements
Purchase orders and supplier records, user login and roles, per-store timezone, integer/Decimal money, seasonality-aware demand, stock-out-adjusted demand, barcode scanning, multi-location, batch/expiry tracking, front-end component tests and CI.
