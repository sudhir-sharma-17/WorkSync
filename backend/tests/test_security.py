"""
Security Tests: Multi-Tenant Session-Based Data Isolation
=========================================================
Proves that Session B cannot access Session A's resources,
and that session reset deletes only the target session's data.

Run with:  python -m pytest tests/test_security.py -v
"""
import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_db
from app.db.models import Base, UploadBatch
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

API = "http://test"
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_attendance.db"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=True,
    connect_args={"check_same_thread": False},
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def override_get_db():
    async with TestAsyncSessionLocal() as session:
        yield session


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _create_batch(db, session_id: str) -> UploadBatch:
    batch = UploadBatch(
        id=str(uuid.uuid4()),
        session_id=session_id,
        form_url="https://example.com/form",
        status="Pending",
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return batch


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    """Drop and recreate all tables for a clean test database."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db(setup_db):
    async with TestAsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(setup_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=API) as c:
        yield c


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_session_b_cannot_preview_session_a_batch(client, db):
    """GET /api/records/preview/{batch_id} returns 403 for wrong session."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a = await _create_batch(db, sid_a)
    
    resp = await client.get(
        f"/api/records/preview/{batch_a.id}",
        headers={"X-Session-ID": sid_b},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_session_b_cannot_run_automation_on_session_a_batch(client, db):
    """POST /api/automation/run returns 403 for wrong session."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a = await _create_batch(db, sid_a)
    
    resp = await client.post(
        "/api/automation/run",
        headers={"X-Session-ID": sid_b},
        json={"batch_id": batch_a.id, "mode": "test"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_session_b_cannot_get_status_of_session_a_batch(client, db):
    """GET /api/automation/status/{batch_id} returns 403 for wrong session."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a = await _create_batch(db, sid_a)
    
    resp = await client.get(
        f"/api/automation/status/{batch_a.id}",
        headers={"X-Session-ID": sid_b},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_session_b_cannot_pause_session_a_batch(client, db):
    """POST /api/automation/pause/{batch_id} returns 403 for wrong session."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a = await _create_batch(db, sid_a)
    
    resp = await client.post(
        f"/api/automation/pause/{batch_a.id}",
        headers={"X-Session-ID": sid_b},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_session_b_cannot_cancel_session_a_batch(client, db):
    """POST /api/automation/cancel/{batch_id} returns 403 for wrong session."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a = await _create_batch(db, sid_a)
    
    resp = await client.post(
        f"/api/automation/cancel/{batch_a.id}",
        headers={"X-Session-ID": sid_b},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_batch_list_isolated_per_session(client, db):
    """GET /api/records/batches only returns current session's batches."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a1 = await _create_batch(db, sid_a)
    batch_a2 = await _create_batch(db, sid_a)
    batch_b1 = await _create_batch(db, sid_b)
    
    resp = await client.get(
        "/api/records/batches",
        headers={"X-Session-ID": sid_b},
    )
    assert resp.status_code == 200
    batch_ids = [b["id"] for b in resp.json()["batches"]]
    assert batch_b1.id in batch_ids, "Session B's batch should be visible"
    assert batch_a1.id not in batch_ids, "Session A's batch must not be visible to Session B"
    assert batch_a2.id not in batch_ids, "Session A's batch must not be visible to Session B"


async def test_no_session_header_returns_400(client):
    """Missing X-Session-ID header returns 400."""
    resp = await client.get("/api/records/batches")
    assert resp.status_code == 400
    assert "Session ID header (X-Session-ID) is missing." in resp.text


async def test_session_reset_purges_only_own_session(client, db):
    """POST /api/records/session/reset deletes only current session records."""
    sid_a = f"sess_a_{uuid.uuid4().hex[:8]}"
    sid_b = f"sess_b_{uuid.uuid4().hex[:8]}"
    batch_a = await _create_batch(db, sid_a)
    batch_b = await _create_batch(db, sid_b)

    # Reset session A
    resp = await client.post(
        "/api/records/session/reset",
        headers={"X-Session-ID": sid_a},
    )
    assert resp.status_code == 200

    from sqlalchemy.future import select
    # Use select queries to bypass session cache and avoid greenlet errors
    res_a = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_a.id))
    batch_a_deleted = res_a.scalar_one_or_none()

    res_b = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_b.id))
    batch_b_remains = res_b.scalar_one_or_none()
    
    assert batch_a_deleted is None
    assert batch_b_remains is not None
