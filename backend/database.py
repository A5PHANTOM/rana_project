# monitor-server/database.py (Using a more robust try/except/finally structure)

from typing import Optional
from sqlmodel import Field, SQLModel, Session, create_engine, select
# Import User model from the new location
from app.db.models import User, pwd_context 

sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url, echo=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def create_initial_admin():
    # Helper function to create an initial Admin user if the DB is empty
    with Session(engine) as session:
        # 🚨 FIX: Use SQLModel's select() instead of deprecated query()
        admin_user = session.exec(select(User).where(User.username == "admin")).first()
        if not admin_user:
            print("--- Creating initial Admin user ---")
            hashed_pwd = User.get_password_hash("adminpassword") # Use a secure password!
            admin = User(username="admin", hashed_password=hashed_pwd, role="Admin")
            session.add(admin)
            session.commit()
            print("--- Admin created (U: admin, P: adminpassword) ---")
        else:
            print(f"--- Admin user already exists: {admin_user.username} ---")

# 🚨 FINAL ATTEMPT: Use an explicit try/except/finally block for maximum control
def get_session():
    session = Session(engine) 
    try:
        yield session
    except Exception:
        # NOTE: If an error happens *before* commit, this can handle the rollback. 
        # But crucially, the finally block ensures closure regardless of success/failure.
        session.rollback() 
        raise # Re-raise the exception to be handled by FastAPI
    finally:
        # Ensure the session is closed. This is the main goal.
        session.close() 

# Call setup functions at the bottom of the file
create_db_and_tables()
create_initial_admin()