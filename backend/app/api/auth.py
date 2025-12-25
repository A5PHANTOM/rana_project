from datetime import timedelta, datetime # 🚨 Required imports
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from app.db.models import User 
from app.core.security import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from database import get_session 

router = APIRouter(tags=["Authentication"])

@router.post("/token", response_model=dict)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)]
):
    """Handles user login and returns a JWT token."""
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    
    # 1. Verify User Exists
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 2. Verify Password
    if not user.verify_password(form_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Create JWT Token (Aligned with updated security logic)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire_time = datetime.utcnow() + access_token_expires
    
    # 🚨 FIX: Construct the payload dictionary exactly as expected by the encoder
    to_encode = {
        # 'sub' must be a simple string (the user ID)
        "sub": str(user.id),  
        "role": user.role,     # Store role directly in the payload
        "exp": expire_time     # Set expiration time
    }
    
    # 🚨 FIX: Call create_access_token with the full payload dictionary
    access_token = create_access_token(payload=to_encode)

    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_role": user.role,
        "username": user.username
    }