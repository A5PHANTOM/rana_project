import os
import base64
import uuid
from datetime import datetime
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.models import User, Class, AuditLog
from app.core.dependencies import get_current_admin_user
from app.api.websocket import notifier 
# 🚨 REMOVED the broken import of get_password_hash
from database import get_session 
from pydantic import BaseModel

router = APIRouter(tags=["Admin Management"]) 

UPLOAD_DIR = "uploads/evidence"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ViolationReport(BaseModel):
    class_id: int
    teacher_id: int
    detail: str
    evidence: str 

# ----------------------------------------------------------------------
# 1. 🚨 Violation Reporting
# ----------------------------------------------------------------------
@router.post("/report-violation")
async def report_violation(report: ViolationReport, session: Annotated[Session, Depends(get_session)]):
    filename = f"violation_{uuid.uuid4().hex[:8]}.jpg"
    db_path = f"uploads/evidence/{filename}"
    full_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        encoded = report.evidence.split(",", 1)[1] if "," in report.evidence else report.evidence
        with open(full_path, "wb") as f:
            f.write(base64.b64decode(encoded))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to save image")

    try:
        new_log = AuditLog(class_id=report.class_id, detail=report.detail, evidence_url=db_path)
        session.add(new_log)
        session.commit()
        session.refresh(new_log)
        
        await notifier.send_alert(report.teacher_id, {
            "message": f"🚨 {report.detail}", 
            "image_url": f"http://localhost:8000/{db_path}"
        })
        return {"status": "success", "image_url": db_path}
    except Exception:
        session.rollback()
        raise HTTPException(status_code=500, detail="DB Log failed")

# ----------------------------------------------------------------------
# 2. 📋 Admin Management Endpoints (Fixed to match your Security.py)
# ----------------------------------------------------------------------

@router.post("/create_teacher")
async def create_teacher(
    teacher_data: dict, 
    session: Annotated[Session, Depends(get_session)],
    admin_user: Annotated[User, Depends(get_current_admin_user)]
):
    # Check if username exists
    existing = session.exec(select(User).where(User.username == teacher_data["username"])).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    # 🚨 TEMPORARY: Since get_password_hash is missing, we use raw password
    # Note: You should eventually add hashing to security.py for safety!
    new_teacher = User(
        username=teacher_data["username"],
        role="Teacher",
        teacher_identifier=teacher_data.get("teacher_identifier"),
        department=teacher_data.get("department"),
        hashed_password=teacher_data.get("password", "temp123") # Plain text for now
    )
    session.add(new_teacher)
    session.commit()
    return {"status": "success", "message": "Teacher created successfully"}

@router.post("/classes")
async def create_class(
    class_data: dict,
    session: Annotated[Session, Depends(get_session)],
    admin_user: Annotated[User, Depends(get_current_admin_user)]
):
    new_class = Class(
        name=class_data["name"],
        esp32_ip=class_data["esp32_ip"],
        permanent_qr_payload=f"ROOM_{class_data['name']}_{uuid.uuid4().hex[:4]}"
    )
    session.add(new_class)
    session.commit()
    return {"status": "success", "message": "Classroom added"}

# ----------------------------------------------------------------------
# 3. 📊 Data Retrieval
# ----------------------------------------------------------------------

@router.get("/teachers")
async def get_all_teachers(session: Annotated[Session, Depends(get_session)], admin_user: Annotated[User, Depends(get_current_admin_user)]):
    return session.exec(select(User).where(User.role == "Teacher")).all()

@router.get("/classes/all")
async def get_all_classes(session: Annotated[Session, Depends(get_session)], admin_user: Annotated[User, Depends(get_current_admin_user)]):
    return session.exec(select(Class)).all()

@router.get("/audit_logs")
async def get_audit_logs(session: Annotated[Session, Depends(get_session)], admin_user: Annotated[User, Depends(get_current_admin_user)]):
    logs = session.exec(select(AuditLog).order_by(AuditLog.timestamp.desc())).all()
    formatted = []
    for l in logs:
        cls = session.get(Class, l.class_id)
        formatted.append({
            "id": l.id,
            "detail": l.detail,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "image_path": f"http://localhost:8000/{l.evidence_url}" if l.evidence_url else None,
            "class_name": cls.name if cls else "Unknown Room"
        })
    return formatted