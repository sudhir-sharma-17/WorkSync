"""
POST /api/automation/validate          — open form, detect fields, return report
POST /api/automation/run               — kick off real Playwright submissions
GET  /api/automation/status/{batch_id} — poll live submission progress
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_db, get_current_user
from app.db.models import (
    User, UploadBatch, AttendanceRecord, WorkerMapping, SubmissionResult,
)
from app.automation.submission_engine import validate_form, PlaywrightSubmissionEngine

router = APIRouter(prefix="/automation", tags=["Automation"])
logger = logging.getLogger(__name__)

# Dedicated thread pool for Playwright.
# Each submitted job runs its own asyncio.run() → creates a fresh ProactorEventLoop
# on Windows, which supports subprocess creation (unlike uvicorn's SelectorEventLoop).
_playwright_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="playwright")


# ── Request schemas ──────────────────────────────────────────────────────────

class ValidateRequest(BaseModel):
    form_url: str


class RunRequest(BaseModel):
    batch_id: str
    mode: str = "test"          # "dry_run" | "test" | "production"
    limit: Optional[int] = None  # max records in test mode (default 5)


# ── Background task helper ───────────────────────────────────────────────────

async def _run_playwright_background(
    batch_id: str,
    records_payload: list,
    form_url: str,
    mode: str,
    user_id: str,
):
    """
    Async implementation — called inside a fresh asyncio.run() from the thread pool.
    Creates its own DB session outside the HTTP request lifecycle.
    """
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        batch = await session.get(UploadBatch, batch_id)
        if not batch:
            logger.error(f"[BG] Batch {batch_id} not found. Aborting.")
            return

        batch.status = "Running"
        await session.commit()

        engine = PlaywrightSubmissionEngine(
            db_session=session,
            batch_id=batch_id,
            user_id=user_id,
            mode=mode,
        )
        try:
            await engine.start_batch(records_payload, form_url)
            await session.refresh(batch)
            if batch.status not in ("Cancelled", "Failed"):
                batch.status = "Completed"
                await session.commit()
            logger.info(f"[BG] Batch {batch_id} completed.")
        except Exception as exc:
            logger.exception(f"[BG] Batch {batch_id} crashed: {exc}")
            await session.refresh(batch)
            batch.status = "Failed"
            await session.commit()


def _sync_playwright_background(batch_id: str, records_payload: list, form_url: str, mode: str, user_id: str):
    """
    Sync wrapper executed in the thread pool.
    asyncio.run() creates a fresh ProactorEventLoop on Windows — Playwright compatible.
    """
    asyncio.run(_run_playwright_background(batch_id, records_payload, form_url, mode, user_id))


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/validate")
async def validate_google_form(
    req: ValidateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Open the Google Form URL with Playwright, detect all question labels,
    match them against the alias table, and return a structured report.
    Playwright runs in a thread pool to avoid Windows asyncio subprocess errors.
    """
    if not req.form_url or not req.form_url.startswith("http"):
        raise HTTPException(status_code=400, detail="A valid form URL is required.")

    # Run validate_form in a dedicated thread → fresh asyncio.run() → ProactorEventLoop
    loop = asyncio.get_running_loop()
    report = await loop.run_in_executor(
        _playwright_pool,
        lambda: asyncio.run(validate_form(req.form_url)),
    )
    return report


@router.post("/run")
async def run_automation(
    req: RunRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger real Playwright form submissions for a batch.
    The submission runs in the background; poll /status/{batch_id} for progress.

    Modes:
      dry_run    — count only, no real submissions
      test       — submit up to `limit` records (default 5)
      production — submit all pending records
    """
    # Verify batch ownership
    batch_res = await db.execute(
        select(UploadBatch).where(UploadBatch.id == req.batch_id)
    )
    batch = batch_res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    form_url = batch.form_url

    # Fetch pending records with worker info
    records_res = await db.execute(
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.worker))
        .where(
            AttendanceRecord.batch_id == req.batch_id,
            AttendanceRecord.status == "Pending",
        )
        .order_by(AttendanceRecord.attendance_date)
    )
    pending = records_res.scalars().all()

    if not pending:
        return {
            "message": "No pending records to process.",
            "submitted": 0,
            "mode": req.mode,
            "batch_id": req.batch_id,
        }

    # Dry run — no Playwright, just count
    if req.mode == "dry_run":
        return {
            "mode": "dry_run",
            "message": "Dry run complete — no submissions made.",
            "would_submit": len(pending),
            "batch_id": req.batch_id,
        }

    # Apply limit for test mode
    if req.mode == "test":
        cap = req.limit or 5
        pending = pending[:cap]

    # Bulk-fetch BOQ mappings
    mappings_res = await db.execute(select(WorkerMapping))
    boq_map = {m.worker_type: m for m in mappings_res.scalars().all()}

    # Build serialisable records list for the background task
    records_payload = []
    for rec in pending:
        worker = rec.worker
        mapping = boq_map.get(worker.worker_type) if worker else None
        records_payload.append({
            "id": str(rec.id),
            "attendance_date": rec.attendance_date.strftime("%d/%m") if rec.attendance_date else "",
            "worker_name": worker.name if worker else "",
            "worker_type": worker.worker_type if worker else "",
            "project_name": rec.project_name or "",
            "boq_category": mapping.boq_category if mapping else "",
            "description": mapping.description if mapping else "",
            "duration": rec.duration or "",
        })

    # Launch Playwright in thread pool — HTTP returns immediately
    background_tasks.add_task(
        _sync_playwright_background,
        req.batch_id,
        records_payload,
        form_url,
        req.mode,
        current_user.id,
    )

    return {
        "mode": req.mode,
        "batch_id": req.batch_id,
        "queued": len(records_payload),
        "message": f"{len(records_payload)} records queued for submission. Poll /status/{req.batch_id} for live progress.",
    }


@router.post("/pause/{batch_id}")
async def pause_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = await db.get(UploadBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    batch.status = "Paused"
    await db.commit()
    return {"batch_id": batch_id, "status": "Paused"}


@router.post("/cancel/{batch_id}")
async def cancel_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = await db.get(UploadBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    batch.status = "Cancelled"
    await db.commit()
    return {"batch_id": batch_id, "status": "Cancelled"}


@router.get("/status/{batch_id}")
async def get_batch_status(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll the live submission progress of a batch."""
    batch_res = await db.execute(
        select(UploadBatch).where(UploadBatch.id == batch_id)
    )
    batch = batch_res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    if batch.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    records_res = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.batch_id == batch_id)
    )
    records = records_res.scalars().all()
    total = len(records)
    n_submitted = sum(1 for r in records if r.status == "Submitted")
    n_failed = sum(1 for r in records if r.status == "Failed")
    n_pending = sum(1 for r in records if r.status == "Pending")

    # Fetch recent submission results for live logs
    results_res = await db.execute(
        select(SubmissionResult)
        .where(SubmissionResult.record_id.in_([str(r.id) for r in records]))
        .order_by(SubmissionResult.timestamp.desc())
        .limit(20)
    )
    recent_results = results_res.scalars().all()
    logs = []
    for r in reversed(recent_results):
        if r.status == "Success":
            logs.append(f"[PLAYWRIGHT]: ✓ {r.worker_name} @ {r.project_name} ({r.attendance_date})")
        else:
            logs.append(f"[ERROR]: ✗ {r.worker_name} — {r.error_message or 'Unknown error'}")

    return {
        "batch_id": batch_id,
        "batch_status": batch.status,
        "total": total,
        "submitted": n_submitted,
        "failed": n_failed,
        "pending": n_pending,
        "progress_pct": round((n_submitted + n_failed) / total * 100) if total > 0 else 0,
        "logs": logs,
    }
