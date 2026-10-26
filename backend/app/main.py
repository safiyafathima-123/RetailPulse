"""RetailPulse API entry point."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from . import models  # noqa: F401  (register tables)
from .database import Base, SessionLocal, engine
from .routers import alerts, dashboard, inventory, products, reorder, reports


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    if os.getenv("RETAILPULSE_SEED_DEMO", "1") != "0":
        with SessionLocal() as db:
            if db.scalar(select(models.Product.id).limit(1)) is None:
                from .seed import seed_demo_data
                seed_demo_data(db)
    yield


app = FastAPI(title="RetailPulse API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def validation_handler(_req: Request, exc: RequestValidationError):
    """Turn Pydantic errors into one readable message plus a per-field map."""
    fields, messages = {}, []
    for err in exc.errors():
        loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
        field = loc[-1] if loc else "request"
        msg = err["msg"].removeprefix("Value error, ")
        fields.setdefault(field, msg)
        messages.append(f"{field.replace('_', ' ')}: {msg}")
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages), "fields": fields})


for module in (products, inventory, alerts, reorder, reports, dashboard):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Optional: serve the built frontend (frontend/dist) from the same port.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        candidate = DIST / full_path
        return FileResponse(candidate if candidate.is_file() else DIST / "index.html")
