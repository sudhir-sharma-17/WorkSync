"""
GET  /api/records/preview/{batch_id}   — preview table data
GET  /api/records/batches              — list all batches for current session
POST /api/records/session/reset        — delete all records for current session
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_session_id
from app.db.models import UploadBatch, AttendanceRecord, WorkerMapping
import json

router = APIRouter(prefix="/records", tags=["Records"])


@router.get("/preview/{batch_id}")
async def get_preview(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    """Return all attendance records for a batch, joined with BOQ mapping data."""
    # Verify batch session ownership
    batch_res = await db.execute(
        select(UploadBatch).where(UploadBatch.id == batch_id)
    )
    batch = batch_res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    if batch.session_id != session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have access to this batch.",
        )

    # Fetch attendance records with worker eagerly loaded
    records_res = await db.execute(
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.worker))
        .where(
            AttendanceRecord.batch_id == batch_id,
            AttendanceRecord.session_id == session_id
        )
        .order_by(AttendanceRecord.attendance_date)
    )
    att_records = records_res.scalars().all()

    # Bulk-fetch BOQ worker mappings (keyed by worker_type)
    mappings_res = await db.execute(
        select(WorkerMapping).where(WorkerMapping.session_id == session_id)
    )
    boq_map = {m.worker_type: m for m in mappings_res.scalars().all()}

    preview_records = []
    for idx, rec in enumerate(att_records):
        worker = rec.worker
        mapping = boq_map.get(worker.worker_type) if worker else None

        # Determine status label
        raw_status = (rec.status or "Pending").lower()
        if raw_status in ("submitted",):
            ui_status = "valid"
        elif raw_status in ("failed",):
            ui_status = "invalid"
        else:
            ui_status = "valid"  # Pending → valid (not yet submitted)

        preview_records.append({
            "id": rec.id,
            "attendance_date": rec.attendance_date.strftime("%d/%m") if rec.attendance_date else "",
            "worker_name": worker.name if worker else "Unknown",
            "worker_type": worker.worker_type if worker else "",
            "project_name": rec.project_name,
            "boq_category": mapping.boq_category if mapping else "",
            "description": mapping.description if mapping else "",
            "duration": rec.duration,
            "status": ui_status,
            "error_message": None,
        })

    debug_meta = {}
    if batch.debug_meta:
        try:
            debug_meta = json.loads(batch.debug_meta)
        except Exception:
            pass

    return {
        "batch_id": batch_id,
        "form_url": batch.form_url,
        "batch_status": batch.status,
        "total": len(preview_records),
        "records": preview_records,
        "debug_meta": debug_meta
    }


@router.get("/batches")
async def list_batches(
    db: AsyncSession = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    """List all upload batches for the current session, newest first."""
    result = await db.execute(
        select(UploadBatch)
        .where(UploadBatch.session_id == session_id)
        .order_by(UploadBatch.created_at.desc())
    )
    batches = result.scalars().all()
    return {
        "batches": [
            {
                "id": b.id,
                "status": b.status,
                "form_url": b.form_url,
                "created_at": b.created_at.isoformat() if b.created_at else None,
              }
            for b in batches
        ]
    }


@router.post("/session/reset")
async def reset_session(
    db: AsyncSession = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    """Purge all attendance records, submission results, mapping history, and upload batches for the current session."""
    from app.db.models import SubmissionResult, AttendanceRecord, UploadBatch, WorkerMapping, Worker, FormProfile

    # Delete related children and session records
    await db.execute(delete(SubmissionResult).where(SubmissionResult.session_id == session_id))
    await db.execute(delete(AttendanceRecord).where(AttendanceRecord.session_id == session_id))
    await db.execute(delete(UploadBatch).where(UploadBatch.session_id == session_id))
    await db.execute(delete(WorkerMapping).where(WorkerMapping.session_id == session_id))
    await db.execute(delete(Worker).where(Worker.session_id == session_id))
    await db.execute(delete(FormProfile).where(FormProfile.session_id == session_id))

    await db.commit()
    return {"message": "Session wiped successfully."}
