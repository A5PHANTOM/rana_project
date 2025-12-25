from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select, SQLModel
from app.db.models import User, Class
# 🚨 UserClassLink import removed as it's no longer used for authorization
from app.core.security import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.dependencies import get_current_teacher_identity 
from database import get_session
from datetime import timedelta, datetime

# 🚨 Import the notifier instance to manage real-time alerts
from app.api.websocket import notifier 

router = APIRouter(tags=["Teacher Authentication"])

class QRScanRequest(SQLModel):
    qr_payload: str

# ----------------------------------------------------------------------
# 1. IDENTITY LOGIN (Step 1: Long-Lived Token)
# ----------------------------------------------------------------------
@router.post("/login", response_model=dict)
async def teacher_identity_login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)]
):
    """
    Grants a long-lived Identity Token using username/password.
    """
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    
    # Authenticate credentials and verify teacher role
    if not user or not user.verify_password(form_data.password) or user.role != "Teacher":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or user is not a teacher.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire_time = datetime.utcnow() + access_token_expires
    
    to_encode = {
        "sub": str(user.id),
        "role": "TeacherIdentity",
        "exp": expire_time
    }
    
    access_token = create_access_token(payload=to_encode)

    return {
        "message": f"Welcome, {user.username}. Identity token granted.",
        "access_token": access_token, 
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role
    }

# ----------------------------------------------------------------------
# 2. QR SCAN / SESSION SIGN-IN (Step 2: Open Access)
# ----------------------------------------------------------------------
@router.post("/sign-in", response_model=dict)
async def teacher_qr_sign_in(
    scan_data: QRScanRequest, 
    current_teacher: Annotated[User, Depends(get_current_teacher_identity)], 
    session: Annotated[Session, Depends(get_session)]
):
    """
    Uses the Identity Token and QR payload to create a temporary 
    Monitoring Session Token. Open access: any teacher can scan any QR.
    """
    user = current_teacher
    
    # 1. Locate Class by QR Payload
    target_class = session.exec(
        select(Class).where(Class.permanent_qr_payload == scan_data.qr_payload)
    ).first()
    
    if not target_class:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid QR code payload.")

    # 🚨 AUTH CHECK REMOVED: Any authenticated teacher can now scan and gain access.

    # 2. Create Session Token (Temporary/Limited Access)
    SESSION_TOKEN_EXPIRE_MINUTES = 60 
    session_expires = timedelta(minutes=SESSION_TOKEN_EXPIRE_MINUTES)
    expire_time = datetime.utcnow() + session_expires
    
    to_encode = {
        "sub": str(user.id),
        "role": "TeacherSession", 
        "class_id": target_class.id, 
        "exp": expire_time
    }
    
    access_token = create_access_token(payload=to_encode)

    # 3. Push a "Session Started" alert to the teacher dashboard via WebSocket
    await notifier.send_alert(user.id, f"✅ Monitoring session started for {target_class.name}")

    return {
        "message": f"Monitoring session established for {target_class.name}.",
        "session_token": access_token,
        "token_type": "bearer",
        "class_name": target_class.name,
        "class_ip": target_class.esp32_ip,
    }