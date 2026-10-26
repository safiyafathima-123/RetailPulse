from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import all_alerts

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts")
def alerts(type: str = Query("all", pattern="^(all|low|out|slow|excess)$"), db: Session = Depends(get_db)):
    items = all_alerts(db)
    return items if type == "all" else [a for a in items if a["alert_type"] == type]
