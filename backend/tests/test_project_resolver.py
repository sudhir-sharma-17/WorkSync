import pytest
import pytest_asyncio
from app.services.project_resolver import normalize_name, get_tokens, ProjectResolver
from app.db.models import Base, ProjectAlias
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_attendance.db"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

@pytest_asyncio.fixture(scope="module", autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def db_session(setup_db):
    async with TestAsyncSessionLocal() as session:
        yield session

def test_normalize_name():
    assert normalize_name("SYCON 61") == "sycon61"
    assert normalize_name("SYCON_C61") == "syconc61"
    assert normalize_name("sycon-61") == "sycon61"
    assert normalize_name("sycon_61") == "sycon61"

def test_get_tokens():
    assert get_tokens("CENTREO CG-04") == ["centreo", "cg", "04"]
    assert get_tokens("SYCON_C61") == ["sycon", "c61"]

@pytest.mark.asyncio
async def test_resolver_matching_pipeline(db_session):
    # Mocking resolver with database connection
    resolver = ProjectResolver(db_session, "test_session")
    
    # Let's mock a catalog
    catalog = [
        "SYCON_C61",
        "CONCORDE ABODE",
        "BRIGADE COSMOPOLIS",
        "SALAPURIA MAGNIFICIA C-702",
        "CENTREO CG-04"
    ]
    
    # We will temporarily override get_project_catalog to return our mock catalog
    async def mock_catalog(*args, **kwargs):
        return catalog
    resolver.get_project_catalog = mock_catalog
    
    raw_records = [
        {"project_name": "SYCON 61"},
        {"project_name": "CONCORD"},
        {"project_name": "COSMOPOLIS"},
        {"project_name": "SALARPURIYA 702"},
        {"project_name": "CENTREO 04"}
    ]
    
    res = await resolver.resolve_projects(raw_records, "http://mockform.com")
    resolutions = {r["input_project"]: r for r in res["resolutions"]}
    
    assert resolutions["SYCON 61"]["resolved_project"] == "SYCON_C61"
    assert resolutions["CONCORD"]["resolved_project"] == "CONCORDE ABODE"
    assert resolutions["COSMOPOLIS"]["resolved_project"] == "BRIGADE COSMOPOLIS"
    assert resolutions["SALARPURIYA 702"]["resolved_project"] == "SALAPURIA MAGNIFICIA C-702"
    assert resolutions["CENTREO 04"]["resolved_project"] == "CENTREO CG-04"
    
    assert resolutions["SYCON 61"]["confidence"] >= 90
    assert resolutions["CONCORD"]["confidence"] >= 80
