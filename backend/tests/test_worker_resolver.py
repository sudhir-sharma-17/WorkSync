import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.worker_resolver import WorkerResolver, normalize_name, get_tokens

def test_normalize_name():
    assert normalize_name("CARPENTER NARESH") == "carpenternaresh"
    assert normalize_name("NARESH_CARPENTER-1") == "nareshcarpenter1"
    assert normalize_name("") == ""

def test_get_tokens():
    assert get_tokens("CARPENTER NARESH") == ["carpenter", "naresh"]
    assert get_tokens("NARESH-CARPENTER_1") == ["naresh", "carpenter", "1"]
    assert get_tokens("") == []

@pytest.mark.asyncio
async def test_worker_resolver_matching():
    db_mock = AsyncMock()
    # Mocking select(WorkerAlias) results to be empty
    exec_mock = AsyncMock()
    exec_mock.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    db_mock.execute.return_value = exec_mock

    resolver = WorkerResolver(db_mock, "test-session")
    
    # Mock catalog retrieval
    resolver.get_worker_catalog = AsyncMock(return_value=[
        "CARPENTER NARESH",
        "CARPENTER UPENDAR",
        "PAINTER RAMESH",
        "POLISHER SHIVA"
    ])

    raw_records = [
        {"worker_name": "NARESH"},
        {"worker_name": "UPENDER"},
        {"worker_name": "CARP NARESH"},
        {"worker_name": "RAMESH P"}
    ]

    result = await resolver.resolve_workers(raw_records, "http://fake-form-url")
    
    resolutions = result["resolutions"]
    resolved_records = result["resolved_records"]

    # NARESH should token match "CARPENTER NARESH"
    naresh_res = next(r for r in resolutions if r["input_worker"] == "NARESH")
    assert naresh_res["resolved_worker"] == "CARPENTER NARESH"
    assert naresh_res["confidence"] >= 85

    # UPENDER should fuzzy match "CARPENTER UPENDAR"
    upender_res = next(r for r in resolutions if r["input_worker"] == "UPENDER")
    assert upender_res["resolved_worker"] == "CARPENTER UPENDAR"
    assert upender_res["confidence"] >= 85

    # RAMESH P should token/fuzzy match "PAINTER RAMESH"
    ramesh_res = next(r for r in resolutions if r["input_worker"] == "RAMESH P")
    assert ramesh_res["resolved_worker"] == "PAINTER RAMESH"

@pytest.mark.asyncio
async def test_ambiguity_detection():
    db_mock = AsyncMock()
    exec_mock = AsyncMock()
    exec_mock.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    db_mock.execute.return_value = exec_mock

    resolver = WorkerResolver(db_mock, "test-session")
    resolver.get_worker_catalog = AsyncMock(return_value=[
        "PAINTER RAMESH",
        "POLISHER RAMESH",
        "CARPENTER RAMESH"
    ])

    raw_records = [
        {"worker_name": "RAMESH"}
    ]

    result = await resolver.resolve_workers(raw_records, "http://fake-form-url")
    resolutions = result["resolutions"]
    
    ramesh_res = next(r for r in resolutions if r["input_worker"] == "RAMESH")
    assert ramesh_res["resolved_worker"] == "Needs Review"
    assert ramesh_res["status"] == "Needs Review"
