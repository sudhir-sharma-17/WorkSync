from typing import AsyncGenerator
from fastapi import Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

async def get_session_id(x_session_id: str = Header(None, alias="X-Session-ID")) -> str:
    if not x_session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session ID header (X-Session-ID) is missing.",
        )
    return x_session_id
