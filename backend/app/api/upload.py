"""
POST /api/upload/attendance
GET  /api/upload/diagnose     — dry-run parse without saving, shows what the parser sees
"""
import uuid
import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_db, get_session_id
from app.db.models import UploadBatch, AttendanceRecord, Worker
from app.parsers.excel_parser import ExcelParserService
from app.services.rules_engine import AttendanceRulesEngine

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/diagnose", status_code=200)
async def diagnose_excel(
    file: UploadFile = File(...),
    session_id: str = Depends(get_session_id),
):
    """
    Dry-run parse the Excel without saving anything.
    Returns a summary of what the parser sees so you can debug formatting issues.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    import io, pandas as pd

    try:
        xls = pd.ExcelFile(io.BytesIO(content), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Cannot open Excel: {e}")

    sheets_info = []
    for sheet_name in xls.sheet_names:
        try:
            df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
            sheets_info.append({
                "sheet_name": sheet_name,
                "rows": int(df.shape[0]),
                "cols": int(df.shape[1]),
                "first_5_rows": df.head(5).astype(str).values.tolist(),
                "column_headers_row0": df.iloc[0].astype(str).tolist() if len(df) > 0 else [],
                "column_headers_row1": df.iloc[1].astype(str).tolist() if len(df) > 1 else [],
            })
        except Exception as e:
            sheets_info.append({"sheet_name": sheet_name, "error": str(e)})

    # Also run the actual parser to show error samples
    parser = ExcelParserService(content)
    parsed = parser.parse()
    raw_records = parsed.get("records", [])
    parse_errors = parsed.get("errors", [])

    # Summarize unique error types
    from collections import Counter
    error_types = Counter(
        e.get("error", "Unknown error").split(";")[0].strip()
        for e in parse_errors
    )

    return {
        "sheets": sheets_info,
        "parser_result": {
            "valid_records_count": len(raw_records),
            "error_records_count": len(parse_errors),
            "valid_samples": raw_records[:5],
            "error_samples": parse_errors[:20],
            "top_error_types": dict(error_types.most_common(10)),
        }
    }


@router.post("/attendance", status_code=status.HTTP_201_CREATED)
async def upload_attendance(
    file: UploadFile = File(...),
    form_url: str = Form(...),
    db: AsyncSession = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    # 1. Read file bytes
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 2. Parse the Excel
    parser = ExcelParserService(content)
    parsed = parser.parse()
    raw_records = parsed.get("records", [])
    parse_errors = parsed.get("errors", [])

    total_cells_processed = len(raw_records) + len(parse_errors)

    if total_cells_processed == 0:
        raise HTTPException(
            status_code=422,
            detail="No attendance data found. Verify the Excel sheet format.",
        )

    # 3. Create the UploadBatch row
    batch = UploadBatch(
        id=str(uuid.uuid4()),
        session_id=session_id,
        form_url=form_url,
        status="Processing",
    )
    db.add(batch)
    await db.flush()

    # 3.5 Resolve project names dynamically
    from app.services.project_resolver import ProjectResolver
    resolver = ProjectResolver(db, session_id)
    resolution_result = await resolver.resolve_projects(raw_records, form_url)
    raw_records = resolution_result["resolved_records"]
    project_resolutions = resolution_result["resolutions"]

    # 3.6 Resolve worker names dynamically
    from app.services.worker_resolver import WorkerResolver
    worker_resolver = WorkerResolver(db, session_id)
    worker_res_result = await worker_resolver.resolve_workers(raw_records, form_url)
    raw_records = worker_res_result["resolved_records"]
    worker_resolutions = worker_res_result["resolutions"]

    # 4. Run rules engine (validates workers / BOQ mappings)
    engine = AttendanceRulesEngine(db, session_id)
    engine_result = await engine.process_batch(raw_records)
    valid_records = engine_result.get("valid_records", [])
    rule_errors = engine_result.get("errors", [])

    # 5. Bulk-fetch workers so we can store worker_id
    worker_names = {r["worker_name"] for r in valid_records if r.get("worker_name")}
    workers_by_name: dict = {}
    if worker_names:
        res = await db.execute(select(Worker).where(Worker.name.in_(worker_names), Worker.session_id == session_id))
        workers_by_name = {w.name: w for w in res.scalars().all()}

    # 6. Bulk-prepare and insert AttendanceRecord rows
    from sqlalchemy import insert
    current_year = datetime.datetime.utcnow().year
    records_to_insert = []
    for rec in valid_records:
        worker = workers_by_name.get(rec.get("worker_name", ""))
        if not worker:
            continue

        date_str = rec.get("attendance_date", "")  # "DD/MM" from rules engine
        try:
            att_date = datetime.datetime.strptime(f"{date_str}/{current_year}", "%d/%m/%Y").date()
        except ValueError:
            att_date = datetime.date.today()

        records_to_insert.append({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "batch_id": batch.id,
            "worker_id": worker.id,
            "project_name": rec.get("project_name", ""),
            "attendance_date": att_date,
            "duration": rec.get("duration", "8-10 Hours"),
            "status": "Pending",
        })

    if records_to_insert:
        await db.execute(insert(AttendanceRecord), records_to_insert)

    # Combine debug metrics
    parser_debug = parsed.get("debug", {})
    rules_debug = engine_result.get("debug", {})
    debug_meta = {
        "parser": parser_debug,
        "rules": rules_debug,
        "project_resolution": project_resolutions,
        "worker_resolution": worker_resolutions
    }
    batch.debug_meta = json.dumps(debug_meta)

    batch.status = "Pending"
    await db.commit()
    await db.refresh(batch)

    # Build friendly error summary
    from collections import Counter
    error_types = Counter(
        e.get("error", "Unknown").split(";")[0].strip()
        for e in parse_errors
    )

    return {
        "batch_id": batch.id,
        "total_records": total_cells_processed,
        "valid_records": len(valid_records),
        "issues": len(parse_errors) + len(rule_errors),
        "error_summary": dict(error_types.most_common(5)),
        "parse_errors": parse_errors[:10],
        "rule_errors": [
            {
                "worker": e.get("raw_record", {}).get("worker_name"),
                "reason": e.get("error_message"),
            }
            for e in rule_errors[:10]
        ],
    }
