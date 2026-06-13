"""
GET  /api/records/preview/{batch_id}   — preview table data
GET  /api/records/batches              — list all batches for current user
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_user
from app.db.models import User, UploadBatch, AttendanceRecord, WorkerMapping
import json

router = APIRouter(prefix="/records", tags=["Records"])


@router.get("/preview/{batch_id}")
async def get_preview(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all attendance records for a batch, joined with BOQ mapping data."""
    # Verify batch ownership
    batch_res = await db.execute(
        select(UploadBatch).where(UploadBatch.id == batch_id)
    )
    batch = batch_res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    if batch.user_id != current_user.id:
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
            AttendanceRecord.user_id == current_user.id
        )
        .order_by(AttendanceRecord.attendance_date)
    )
    att_records = records_res.scalars().all()

    # Bulk-fetch BOQ worker mappings (keyed by worker_type)
    mappings_res = await db.execute(
        select(WorkerMapping).where(WorkerMapping.user_id == current_user.id)
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
    current_user: User = Depends(get_current_user),
):
    """List all upload batches for the current user, newest first."""
    result = await db.execute(
        select(UploadBatch)
        .where(UploadBatch.user_id == current_user.id)
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
