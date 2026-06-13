from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import engine
from app.db.models import Base

# Routers
from app.api import auth as auth_router
from app.api import upload as upload_router
from app.api import records as records_router
from app.api import automation as automation_router


async def init_db():
    """Create all tables on first run (SQLite dev convenience)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        openapi_url="/api/openapi.json",
        docs_url="/docs",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def on_startup():
        await init_db()

    # ── API Routers ─────────────────────────────────────────────
    app.include_router(auth_router.router,       prefix="/api")
    app.include_router(upload_router.router,     prefix="/api")
    app.include_router(records_router.router,    prefix="/api")
    app.include_router(automation_router.router, prefix="/api")

    @app.get("/health", tags=["Health"])
    async def health_check():
        return {"status": "ok", "app": settings.PROJECT_NAME}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
