"""
Security Tests: Multi-Tenant Data Isolation
============================================
Proves that User B cannot access User A's resources.

Run with:  python -m pytest tests/test_security.py -v
"""
import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import AsyncSessionLocal, engine
from app.db.models import Base, User, UploadBatch
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
API = "http://test"


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _create_user(db, email: str, password: str = "Test1234!") -> User:
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=pwd_ctx.hash(password),
        role="admin",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _login(client: AsyncClient, email: str, password: str = "Test1234!") -> str:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


async def _create_batch(db, user: User) -> UploadBatch:
    batch = UploadBatch(
        id=str(uuid.uuid4()),
        user_id=user.id,
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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db(setup_db):
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(setup_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=API) as c:
        yield c


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_user_b_cannot_preview_user_a_batch(client, db):
    """GET /api/records/preview/{batch_id} returns 403 for wrong user."""
    user_a = await _create_user(db, f"ua_{uuid.uuid4().hex[:8]}@test.com")
    user_b = await _create_user(db, f"ub_{uuid.uuid4().hex[:8]}@test.com")
    batch_a = await _create_batch(db, user_a)
    token_b = await _login(client, user_b.email)
    resp = await client.get(
        f"/api/records/preview/{batch_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_user_b_cannot_run_automation_on_user_a_batch(client, db):
    """POST /api/automation/run returns 403 for wrong user."""
    user_a = await _create_user(db, f"ua_{uuid.uuid4().hex[:8]}@test.com")
    user_b = await _create_user(db, f"ub_{uuid.uuid4().hex[:8]}@test.com")
    batch_a = await _create_batch(db, user_a)
    token_b = await _login(client, user_b.email)
    resp = await client.post(
        "/api/automation/run",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"batch_id": batch_a.id, "mode": "test"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_user_b_cannot_get_status_of_user_a_batch(client, db):
    """GET /api/automation/status/{batch_id} returns 403 for wrong user."""
    user_a = await _create_user(db, f"ua_{uuid.uuid4().hex[:8]}@test.com")
    user_b = await _create_user(db, f"ub_{uuid.uuid4().hex[:8]}@test.com")
    batch_a = await _create_batch(db, user_a)
    token_b = await _login(client, user_b.email)
    resp = await client.get(
        f"/api/automation/status/{batch_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_user_b_cannot_pause_user_a_batch(client, db):
    """POST /api/automation/pause/{batch_id} returns 403 for wrong user."""
    user_a = await _create_user(db, f"ua_{uuid.uuid4().hex[:8]}@test.com")
    user_b = await _create_user(db, f"ub_{uuid.uuid4().hex[:8]}@test.com")
    batch_a = await _create_batch(db, user_a)
    token_b = await _login(client, user_b.email)
    resp = await client.post(
        f"/api/automation/pause/{batch_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_user_b_cannot_cancel_user_a_batch(client, db):
    """POST /api/automation/cancel/{batch_id} returns 403 for wrong user."""
    user_a = await _create_user(db, f"ua_{uuid.uuid4().hex[:8]}@test.com")
    user_b = await _create_user(db, f"ub_{uuid.uuid4().hex[:8]}@test.com")
    batch_a = await _create_batch(db, user_a)
    token_b = await _login(client, user_b.email)
    resp = await client.post(
        f"/api/automation/cancel/{batch_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


async def test_batch_list_isolated_per_user(client, db):
    """GET /api/records/batches only returns current user's batches."""
    user_a = await _create_user(db, f"ua_{uuid.uuid4().hex[:8]}@test.com")
    user_b = await _create_user(db, f"ub_{uuid.uuid4().hex[:8]}@test.com")
    batch_a1 = await _create_batch(db, user_a)
    batch_a2 = await _create_batch(db, user_a)
    batch_b1 = await _create_batch(db, user_b)
    token_b = await _login(client, user_b.email)
    resp = await client.get(
        "/api/records/batches",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 200
    batch_ids = [b["id"] for b in resp.json()["batches"]]
    assert batch_b1.id in batch_ids, "User B's batch should be visible"
    assert batch_a1.id not in batch_ids, "User A's batch must not be visible to User B"
    assert batch_a2.id not in batch_ids, "User A's batch must not be visible to User B"


async def test_no_token_preview(client):
    """Unauthenticated preview request returns 401."""
    resp = await client.get("/api/records/preview/some-id")
    assert resp.status_code == 401


async def test_no_token_batches(client):
    """Unauthenticated batch list returns 401."""
    resp = await client.get("/api/records/batches")
    assert resp.status_code == 401


async def test_no_token_automation_run(client):
    """Unauthenticated automation run returns 401."""
    resp = await client.post("/api/automation/run", json={"batch_id": "x", "mode": "test"})
    assert resp.status_code == 401
