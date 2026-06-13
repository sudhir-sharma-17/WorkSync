from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Labour Attendance Automation System"
    API_V1_STR: str = "/api/v1"
    
    # SECURITY
    SECRET_KEY: str = "y0ur-5up3r-s3cr3t-k3y-f0r-jwt-t0k3n"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # SQLite — zero setup for local dev
    SQLALCHEMY_DATABASE_URI: str = "sqlite+aiosqlite:///./attendance.db"

    class Config:
        case_sensitive = True

settings = Settings()
