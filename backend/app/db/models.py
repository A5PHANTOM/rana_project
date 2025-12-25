from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

class UserClassLink(SQLModel, table=True):
    user_id: Optional[int] = Field(default=None, primary_key=True, foreign_key="user.id")
    class_id: Optional[int] = Field(default=None, primary_key=True, foreign_key="class.id")

    user_obj: "User" = Relationship(back_populates="links")
    class_obj: "Class" = Relationship(back_populates="links")

class Class(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)  
    esp32_ip: str 
    permanent_qr_payload: Optional[str] = Field(default=None, unique=True)
  
    links: List["UserClassLink"] = Relationship(back_populates="class_obj")
    # 🚨 String-based relationship for AuditLog
    logs: List["AuditLog"] = Relationship(back_populates="class_obj")

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    role: str = "Teacher"
    
    teacher_identifier: Optional[str] = Field(default=None, unique=True) 
    department: Optional[str] = None
    
    links: List["UserClassLink"] = Relationship(back_populates="user_obj")
    
    def verify_password(self, password: str) -> bool:
        return pwd_context.verify(password, self.hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)

class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    class_id: int = Field(foreign_key="class.id")
    detail: str 
    evidence_url: Optional[str] = None 
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # 🚨 String-based relationship for Class
    class_obj: "Class" = Relationship(back_populates="logs")