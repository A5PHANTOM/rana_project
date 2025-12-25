from typing import Annotated, Optional # 🚨 Import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.db.models import User
from app.core.security import SECRET_KEY, ALGORITHM
from sqlmodel import Session, select
from database import get_session 

# OAuth2PasswordBearer will look for the 'Authorization: Bearer <token>' header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def get_current_user(
    session: Annotated[Session, Depends(get_session)],
    token: Annotated[str, Depends(oauth2_scheme)]
) -> User:
    """Decodes JWT and retrieves the user object."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id_str = None
    
    try:
        # 1. Decode the JWT token (will raise JWTError if expired/invalid signature)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # 2. Extract the required claims
        user_id_str = payload.get("sub") 
        
        if user_id_str is None:
            # If the required claims are missing
            raise credentials_exception
            
    except JWTError:
        # Catch JWT signature or expiration errors
        raise credentials_exception

    # 3. Fetch user from database
    try:
        user_id = int(user_id_str)
    except ValueError:
        raise credentials_exception
        
    user = session.exec(select(User).where(User.id == user_id)).first()
    
    if user is None:
        raise credentials_exception
        
    return user

# --- Existing Admin Dependency ---

def get_current_admin_user(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    """Enforces that the authenticated user must have the 'Admin' role."""
    if current_user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation forbidden: Admin privileges required."
        )
    return current_user

# ----------------------------------------------------------------------
# 🚨 NEW TEACHER DEPENDENCIES (Two-Stage Authentication)
# ----------------------------------------------------------------------

def get_current_teacher_identity(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    """
    Validates the long-lived Identity Token. 
    Allows Teacher or Admin roles to proceed to the QR scanning step.
    """
    if current_user.role not in ["Teacher", "Admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Identity token required for a Teacher or Admin user."
        )
    return current_user

def get_current_teacher_session(
    token: Annotated[str, Depends(oauth2_scheme)]
) -> tuple[int, int]:
    """
    Decodes the temporary TeacherSession token and extracts the user ID and class ID.
    This is used to protect the live camera feed endpoint.
    Returns: (user_id, class_id)
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid monitoring session token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        user_id_str = payload.get("sub") 
        token_role = payload.get("role") 
        class_id_raw = payload.get("class_id") # The specific class being monitored
        
        if token_role != "TeacherSession" or user_id_str is None or class_id_raw is None:
            raise credentials_exception
            
        user_id = int(user_id_str)
        class_id = int(class_id_raw)

    except (JWTError, ValueError):
        raise credentials_exception
        
    return user_id, class_id