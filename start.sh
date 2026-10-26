#!/usr/bin/env bash
# One-command local start (macOS / Linux): installs dependencies, builds the UI if needed, runs on :8000.
set -e
cd "$(dirname "$0")"

python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -q -r backend/requirements.txt

if [ ! -d frontend/dist ] && command -v npm >/dev/null; then
  (cd frontend && npm install --no-audit --no-fund && npm run build)
fi

echo "RetailPulse running at http://localhost:8000"
cd backend && exec uvicorn app.main:app --port 8000
