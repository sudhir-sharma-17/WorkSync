import uuid
import logging
from typing import List, Dict, Any
from app.db.session import AsyncSessionLocal
from app.automation.submission_engine import PlaywrightSubmissionEngine
from app.db.models import UploadBatch

logger = logging.getLogger(__name__)

async def process_batch_task(batch_id: str, valid_records: List[Dict[str, Any]], mappings: Dict[str, str], form_url: str):
    """
    Background task wrapper. Runs outside the HTTP request lifecycle.
    Injects a dedicated DB session and executes the Playwright Engine batch.
    """
    async with AsyncSessionLocal() as session:
        # Mark batch as processing
        batch = await session.get(UploadBatch, uuid.UUID(batch_id))
        if batch:
            batch.status = "Processing"
            await session.commit()
        else:
            logger.error(f"Batch {batch_id} not found. Task aborted.")
            return
            
        engine = PlaywrightSubmissionEngine(db_session=session, batch_id=batch_id, mode="production")
        
        try:
            await engine.start_batch(valid_records, mappings, form_url)
            
            # Finalize Batch status
            await session.refresh(batch)
            if batch.status not in ["Cancelled", "Failed"]:
                batch.status = "Completed"
                await session.commit()
                logger.info(f"Batch {batch_id} processing completed successfully.")
                
        except Exception as e:
            # Handle catastrophic failure outside of the individual record loop
            logger.exception(f"Catastrophic failure processing batch {batch_id}: {str(e)}")
            if batch:
                batch.status = "Failed"
                await session.commit()
