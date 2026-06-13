from pydantic import BaseModel, EmailStr
from uuid import UUID

class UserBase(BaseModel):
    email: EmailStr
    role: str = "admin"
    is_active: bool = True

class UserResponse(UserBase):
    id: UUID

    class Config:
        from_attributes = True
