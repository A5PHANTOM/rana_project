from datetime import datetime, timedelta
from typing import Any, Union, Optional
from jose import jwt

# 🚨 CHANGE THIS KEY! It's used to sign the JWT tokens.
SECRET_KEY = "a5d1a934e44ce6310402dde4701aa88d" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

# 🚨 FIX: Change the signature to accept the 'payload' dictionary directly
def create_access_token(
    payload: dict # Accepts the fully constructed dictionary payload
) -> str:
    """Creates a time-limited JWT access token using the provided dictionary payload."""
    
    # The payload dictionary (containing 'sub', 'role', and 'exp') 
    # is passed directly to the encoder.
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# NOTE: The helper methods for password hashing and verification are often defined in 
# app/db/models.py to keep security.py focused purely on tokens.