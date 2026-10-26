# RetailPulse

Smart inventory management and reorder recommendations for small retail businesses.
A standalone educational prototype built from the RetailPulse PRD v1.0 — not a deployed commercial product.

**Stack:** React + TypeScript + Vite + Tailwind CSS + Recharts · Python FastAPI · SQLite via SQLAlchemy

## What you can do

| Screen | What it does |
|---|---|
| Dashboard | Inventory value, period sales, low/out-of-stock counts, one daily-sales trend, urgent items |
| Products | Add, edit, search, filter and archive products (unique SKU, prices, threshold, safety stock, supplier, lead time) |
| Inventory & Sales | Record a sale, restock or adjustment (reason required). Overselling is rejected. Full movement history |
| Stock Alerts | Out of stock, low stock, plus slow-moving / excess where sales history supports it — each with a reason |
| Reorder Recommendations | Target and suggested quantity with the exact numbers and formula, plus an embedded What-if Simulator that never saves anything |
| Reports | Inventory list, stock alerts, valuation, sales summary (date range) with CSV export |

## Quick start

You need **Python 3.10+**. Node.js 18+ is only needed if you want to rebuild or develop the UI.

### Option A — one process on http://localhost:8000 (UI already built in `frontend/dist`)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Open http://localhost:8000. macOS/Linux shortcut: `./start.sh`.

### Option B — development with hot reload

```bash
# terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api to :8000)
```

To rebuild the UI served by Option A: `cd frontend && npm run build`.

### Run the tests

```bash
cd backend && pytest -q        # 20 tests covering the PRD acceptance checklist
```

## Data and sample data

* The SQLite file is created at `backend/data/retailpulse.db` and persists across restarts.
* On first launch with an empty database, **14 clearly labelled sample products** and 30 days of sample sales are loaded
  (SKUs start with `DEMO-`, shown with a "Sample" badge). To start empty: `RETAILPULSE_SEED_DEMO=0`.
* Reset to fresh sample data: stop the server, then `cd backend && python -m app.seed --reset`.
* Delete `backend/data/` to wipe everything.

## Configuration (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `RETAILPULSE_DATA_DIR` | `backend/data` | Where the SQLite file lives |
| `RETAILPULSE_DATABASE_URL` | SQLite in data dir | Override the database URL |
| `RETAILPULSE_SEED_DEMO` | `1` | `0` disables automatic sample data |
| `VITE_CURRENCY` / `VITE_LOCALE` | `INR` / `en-IN` | Currency display, set when building the UI (e.g. `VITE_CURRENCY=USD VITE_LOCALE=en-US npm run build`) |

## How reorder recommendations work

```
Reorder target   = ceil( average daily demand × lead time (days) + safety stock )
Suggested order  = max(0, reorder target − available stock)
```

Worked example from the PRD: demand 4/day × 5 days + 6 safety = **26**; with 10 on hand → order **16**.

Average daily demand comes from the first source that applies, and the screen always says which one was used:

1. **Recorded sales** — units sold in the last 30 days ÷ 30, when there are at least 3 sales records in that window.
2. **Manual estimate** — the product's optional "daily demand estimate".
3. **Fallback** — reorder threshold ÷ lead time (min 1 day). Labelled "not a forecast".

The target is rounded up to whole units. No machine learning or external AI is used.

Other rules:
* **Low stock**: stock ≤ reorder threshold (and > 0). **Out of stock**: 0.
* **Slow-moving**: product older than 30 days with zero sales in the last 30 days.
* **Excess**: demand from sales history and stock covers more than 90 days.

## Data integrity

* SKU is trimmed and upper-cased, with a unique database index; duplicates return a clear message.
* A sale uses one transaction and a conditional `UPDATE … WHERE current_stock + change >= 0`, so stock cannot go negative even with simultaneous requests. A rejected sale changes nothing.
* Every sale, restock and adjustment writes a `StockMovement` (with stock-after). Opening stock on a new product is logged as an adjustment.
* Stock is changed only through Inventory & Sales (not by editing a product), so history always explains the number.
* The simulator endpoint is read-only.
* Database `CHECK` constraints also block negative stock, prices, lead time and safety stock.
* CSV cells starting with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection.

## API overview

`GET/POST /api/products` · `GET/PUT /api/products/{id}` · `POST /api/products/{id}/archive|restore` · `GET /api/categories`
`POST /api/inventory/sales|restocks|adjustments` · `GET /api/inventory/movements`
`GET /api/alerts` · `GET /api/reorder/recommendations` · `POST /api/reorder/simulate`
`GET /api/reports/{inventory|alerts|valuation|sales}` and `.../csv` · `GET /api/dashboard`
Interactive docs at http://localhost:8000/docs.

## Project layout

```
backend/app/       models.py  schemas.py  services.py (business rules)  seed.py  main.py  routers/
backend/tests/     pytest suite
frontend/src/      pages/ (six screens)  components/  lib/ (api client, formatting)
docs/              PROJECT_REPORT.md  screenshots/
```

## Known limits (by design for Version 1)

Single store, no login or roles, no payments/tax/accounting, no automated supplier ordering, no camera barcode scanning,
no ML forecasting. Timestamps are stored in UTC, so "today" follows UTC. Prices are stored as 2-decimal floats, which is fine for a
prototype but a production system should use integer minor units or `Decimal`.
