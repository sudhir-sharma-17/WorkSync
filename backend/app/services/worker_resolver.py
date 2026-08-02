import re
import json
import logging
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete

from app.db.models import FormProfile, FormField, FieldMapping, WorkerAlias, AttendanceRecord
from app.automation.submission_engine import detect_field_map, check_google_session_status

logger = logging.getLogger(__name__)

def normalize_name(name: str) -> str:
    """Removes all non-alphanumeric characters and converts to lowercase."""
    if not name:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', name).lower()

def get_tokens(name: str) -> List[str]:
    """Splits string into lowercase alphanumeric tokens."""
    if not name:
        return []
    return [t.lower().strip() for t in re.split(r'[^a-zA-Z0-9]', name) if t.strip()]

class WorkerResolver:
    def __init__(self, db_session: AsyncSession, session_id: str):
        self.db = db_session
        self.session_id = session_id

    async def get_worker_catalog(self, form_url: str, force_refresh: bool = False) -> List[str]:
        """
        Retrieves the worker names catalog for the given Google Form URL.
        First tries to read from cached FormProfile and FormField options in the DB.
        If not cached (or force_refresh=True), scrapes the form via Playwright and updates cache.
        """
        # 1. Try fetching from DB cache first (if not forcing refresh)
        if not force_refresh:
            stmt = select(FormField).join(FormProfile).where(
                FormProfile.url == form_url,
                FormField.label.like("%worker%") | FormField.label.like("%labour%") | FormField.label.like("%employee%") | FormField.label.like("%name%")
            )
            res = await self.db.execute(stmt)
            field = res.scalar_one_or_none()
            if field and field.options:
                try:
                    options = json.loads(field.options)
                    if options:
                        logger.info(f"[WorkerResolver] Catalog cache HIT for form: {form_url}")
                        return options
                except Exception as e:
                    logger.error(f"[WorkerResolver] Error decoding cached options: {e}")

        # 2. Cache miss or force refresh: Scrape Google Form directly
        logger.info(f"[WorkerResolver] Catalog cache MISS or Refresh. Scraping form: {form_url}")
        scraped_options = await self._scrape_worker_options(form_url)
        if not scraped_options:
            logger.warning("[WorkerResolver] Scraped zero workers from form.")
            return []

        # 3. Save / Update cache in DB
        # Look for existing profile
        res_profile = await self.db.execute(select(FormProfile).where(FormProfile.url == form_url))
        profile = res_profile.scalar_one_or_none()
        if not profile:
            profile = FormProfile(
                session_id=self.session_id,
                name=f"Profile for {form_url[:30]}...",
                url=form_url
            )
            self.db.add(profile)
            await self.db.flush()

        # Look for worker_name FormField or create one
        res_field = await self.db.execute(
            select(FormField).where(
                FormField.profile_id == profile.id,
                FormField.label.like("%worker%") | FormField.label.like("%labour%") | FormField.label.like("%employee%") | FormField.label.like("%name%")
            )
        )
        field = res_field.scalar_one_or_none()
        if not field:
            field = FormField(
                profile_id=profile.id,
                field_id=f"scraped_worker_{uuid_hex()[:8]}",
                label="Worker Name",
                field_type="listbox",
                is_required=True
            )
            self.db.add(field)

        field.options = json.dumps(scraped_options)
        await self.db.commit()
        logger.info(f"[WorkerResolver] Cached {len(scraped_options)} workers in DB.")
        return scraped_options

    async def _scrape_worker_options(self, form_url: str) -> List[str]:
        """Runs a headless browser to open the form and extract option labels for the worker dropdown/radios."""
        from app.api.automation import _playwright_pool
        loop = asyncio.get_running_loop()
        
        options = await loop.run_in_executor(
            _playwright_pool,
            lambda: asyncio.run(self._scrape_playwright_worker(form_url))
        )
        return options

    async def _scrape_playwright_worker(self, form_url: str) -> List[str]:
        session_dir = f"playwright_sessions/{self.session_id}"
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=session_dir,
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                field_map, found, missing = await detect_field_map(page, form_url)
                
                worker_info = field_map.get("worker_name")
                
                # Locate worker field container
                label_to_find = worker_info["label"] if worker_info else "Worker Name"
                container = page.locator('.Qr7Oae, div[role="listitem"], div[jsmodel]').filter(has_text=label_to_find).last
                try:
                    await container.wait_for(state="visible", timeout=8000)
                except:
                    # Fallback
                    container = page.locator('div[role="listbox"]').first
                    
                scraped = []
                # Handle dropdown/listbox options
                if await container.locator('div[role="listbox"]').count() > 0 or await container.locator('[jsname="LgbsSe"]').count() > 0:
                    dropdown = container.locator('div[role="listbox"], [jsname="LgbsSe"]').first
                    await dropdown.click()
                    await page.wait_for_timeout(1000)
                    
                    option_locators = page.locator('div[role="option"]')
                    count = await option_locators.count()
                    if count == 0:
                        option_locators = page.locator('.v37h1d div[role="option"], div[role="option"]')
                        count = await option_locators.count()
                        
                    for i in range(count):
                        opt_text = (await option_locators.nth(i).inner_text()).strip()
                        if opt_text and opt_text not in ("Choose", "Select", "— Choose —") and not opt_text.startswith("Choose"):
                            scraped.append(opt_text)
                
                # Handle radio options if no dropdown
                if not scraped and (await container.locator('div[role="radiogroup"]').count() > 0 or await container.locator('label').count() > 0):
                    radio_locators = container.locator('.freebirdFormviewerViewItemsRadioOption, label, div[role="radio"]')
                    count = await radio_locators.count()
                    for i in range(count):
                        opt_text = (await radio_locators.nth(i).inner_text()).strip()
                        if opt_text and opt_text not in scraped:
                            scraped.append(opt_text)
                            
                # Unique list preserving order
                seen = set()
                return [x for x in scraped if not (x in seen or seen.add(x))]
            except Exception as e:
                logger.error(f"[WorkerResolver Scraper] Failed to scrape worker options: {e}")
                return []
            finally:
                await context.close()

    async def resolve_workers(self, raw_records: List[Dict[str, Any]], form_url: str) -> Dict[str, Any]:
        """
        Processes raw parsed Excel records, extracts unique worker names, matches them against the catalog,
        and returns a dict:
        {
            "resolved_records": List[Dict],      # raw_records with worker_name updated to resolved names
            "resolutions": List[Dict]            # mapping information with confidence metrics
        }
        """
        # 1. Fetch catalog
        catalog = await self.get_worker_catalog(form_url)
        if not catalog:
            return {
                "resolved_records": raw_records,
                "resolutions": []
            }

        # 2. Extract unique worker names from raw_records
        unique_inputs = {(r.get("worker_name") or "").strip() for r in raw_records if r.get("worker_name")}
        unique_inputs = {w for w in unique_inputs if w}

        # 3. Load global alias mappings from WorkerAlias table
        alias_res = await self.db.execute(select(WorkerAlias))
        aliases = {a.input_worker: a.resolved_worker for a in alias_res.scalars().all()}

        # 4. Resolve unique worker names
        from rapidfuzz import fuzz
        resolutions = {}

        for inp in unique_inputs:
            # Check Learning Alias Dictionary first
            if inp in aliases:
                resolved = aliases[inp]
                if resolved in catalog:
                    resolutions[inp] = {
                        "input_worker": inp,
                        "resolved_worker": resolved,
                        "confidence": 100,
                        "status": "Auto-Accepted",
                        "match_type": "Learned Alias"
                    }
                    continue

            # Matching Pipeline
            best_candidates = []
            best_score = 0
            best_match_type = ""

            inp_norm = normalize_name(inp)
            inp_tokens = get_tokens(inp)

            for target in catalog:
                target_norm = normalize_name(target)
                target_tokens = get_tokens(target)

                # Level 1: Exact Match
                if inp.lower() == target.lower():
                    best_candidates = [target]
                    best_score = 100
                    best_match_type = "Exact Match"
                    break

                # Level 2: Normalized Match
                if inp_norm == target_norm:
                    if best_score < 95:
                        best_candidates = [target]
                        best_score = 95
                        best_match_type = "Normalized Match"
                    elif best_score == 95:
                        if target not in best_candidates:
                            best_candidates.append(target)
                    continue

                # Level 3 & 4: Token Overlap & Fuzzy Similarity
                # Compute token overlap
                matching_tokens = set(inp_tokens) & set(target_tokens)
                token_overlap_ratio = len(matching_tokens) / max(len(inp_tokens), 1)

                # Fuzzy matches via rapidfuzz
                fuzzy_ratio = fuzz.ratio(inp.lower(), target.lower())
                fuzzy_wratio = fuzz.WRatio(inp.lower(), target.lower())
                fuzzy_pratio = fuzz.partial_ratio(inp.lower(), target.lower())
                
                # Weighted score
                # If there's a strong token match (all input tokens match target), boost score heavily
                token_boost = 0
                if matching_tokens and len(matching_tokens) == len(inp_tokens):
                    token_boost = 30
                else:
                    # Check if there is a partial token match with high similarity (like UPENDER -> UPENDAR)
                    for itok in inp_tokens:
                        for ttok in target_tokens:
                            if fuzz.ratio(itok, ttok) >= 80:
                                token_boost = max(token_boost, 25)

                score = (fuzzy_ratio * 0.15) + (fuzzy_wratio * 0.35) + (fuzzy_pratio * 0.3) + (token_overlap_ratio * 10) + token_boost
                score = min(max(int(score), 0), 100)

                if score > best_score:
                    best_candidates = [target]
                    best_score = score
                    best_match_type = "Fuzzy / Weighted Match"
                elif score == best_score and score > 0:
                    if target not in best_candidates:
                        best_candidates.append(target)

            # Determine confidence status and Ambiguity Detection
            resolved_worker = inp
            if len(best_candidates) > 1:
                # Ambiguity detected, force review
                status = "Needs Review"
                resolved_worker = "Needs Review"
            elif len(best_candidates) == 1:
                resolved_worker = best_candidates[0]
                if best_score >= 95:
                    status = "Auto-Accepted"
                elif best_score >= 85:
                    status = "Smart Match"
                else:
                    status = "Needs Review"
            else:
                status = "Needs Review"

            resolutions[inp] = {
                "input_worker": inp,
                "resolved_worker": resolved_worker,
                "confidence": best_score if len(best_candidates) == 1 else 0,
                "status": status,
                "match_type": best_match_type if len(best_candidates) == 1 else "Ambiguous Match"
            }

        # 5. Apply resolutions to raw_records
        resolved_records = []
        for r in raw_records:
            rec_copy = dict(r)
            inp_work = (r.get("worker_name") or "").strip()
            if inp_work in resolutions:
                res_info = resolutions[inp_work]
                # Only automatically resolve if auto-accept or smart match (>= 85% confidence)
                if res_info["confidence"] >= 85 and res_info["resolved_worker"] != "Needs Review":
                    rec_copy["worker_name"] = res_info["resolved_worker"]
            resolved_records.append(rec_copy)

        return {
            "resolved_records": resolved_records,
            "resolutions": list(resolutions.values())
        }

def uuid_hex() -> str:
    import uuid
    return uuid.uuid4().hex
