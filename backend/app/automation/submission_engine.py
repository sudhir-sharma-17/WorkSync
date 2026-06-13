"""
Playwright-based Google Form submission engine.

Field detection uses label-based auto-mapping with aliases.
No manual field configuration required in V1.
"""
import os
import uuid
import asyncio
import logging
import difflib
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from playwright.async_api import async_playwright, BrowserContext, Page, Locator

from app.db.models import UploadBatch, AttendanceRecord, SubmissionResult

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Alias table: maps internal system field -> list of accepted Google Form labels
# Case-insensitive partial matching is used.
# ──────────────────────────────────────────────────────────────────────────────
FIELD_ALIASES: Dict[str, List[str]] = {
    "attendance_date": [
        "date",
        "attendance date",
        "attandance date",
    ],
    "worker_name": [
        "name of labour",
        "labour name",
        "worker name",
        "employee name",
        "name",
    ],
    "project_name": [
        "project name",
        "project",
        "site name",
    ],
    "boq_category": [
        "boq category",
        "category",
        "work category",
        "work type",
    ],
    "duration": [
        "duration",
        "hours",
        "working hours",
        "time",
    ],
    "description": [
        "description",
        "remarks",
        "activity",
        "work description",
    ],
}

REQUIRED_SYSTEM_FIELDS = list(FIELD_ALIASES.keys())


def _match_label(label_text: str) -> Optional[str]:
    """
    Given a raw label from the Google Form, return the matching system field name
    or None if no alias matches. Prioritizes the longest matching alias.
    """
    normalized = label_text.strip().lower()
    best_match = None
    longest_alias = 0

    for sys_field, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in normalized or normalized in alias:
                if len(alias) > longest_alias:
                    best_match = sys_field
                    longest_alias = len(alias)
                    
    return best_match


async def detect_field_map(page: Page, form_url: str) -> Tuple[Dict[str, dict], List[str], List[str]]:
    """
    Opens the Google Form and reads each question label.
    Returns:
      field_map:  { system_field -> {"label": "safe_label", "type": "input_type"} }
      found:      list of system fields that were matched
      missing:    list of required system fields that were NOT found
    """
    await page.goto(form_url, wait_until="networkidle", timeout=30000)

    field_map: Dict[str, dict] = {}

    question_containers = await page.query_selector_all(
        '[data-params], .freebirdFormviewerViewItemsItemItem, div[jsmodel], .Qr7Oae, div[role="listitem"]'
    )

    for container in question_containers:
        title_el = await container.query_selector(
            '.freebirdFormviewerComponentsQuestionBaseTitle, .M7eMe, [role="heading"], span[dir="auto"]'
        )
        if not title_el:
            continue

        label_text = (await title_el.inner_text()).strip()
        if not label_text:
            continue

        sys_field = _match_label(label_text)
        if not sys_field or sys_field in field_map:
            continue

        # Detect the type of input within this container
        input_type = "unknown"
        if await container.query_selector('input[type="text"], input[type="date"], input[type="email"], input[type="url"], input:not([type="hidden"])'):
            input_type = "text"
        elif await container.query_selector('textarea'):
            input_type = "textarea"
        elif await container.query_selector('div[role="listbox"], [jsname="LgbsSe"]'):
            input_type = "listbox"
        elif await container.query_selector('div[role="radiogroup"]'):
            input_type = "radio"
        
        # Fallback: if we matched a valid system field but couldn't detect the type,
        # Google Forms dropdowns sometimes hide the listbox deep. Default to listbox.
        if input_type == "unknown" and sys_field:
            input_type = "listbox"

        if input_type == "unknown":
            continue

        safe_label = label_text.split('\n')[0].replace('"', '').strip()
        if safe_label.endswith('*'):
            safe_label = safe_label[:-1].strip()

        field_map[sys_field] = {
            "label": safe_label,
            "type": input_type
        }
        logger.info(f"[AutoMap] '{label_text}' -> {sys_field} | type: {input_type}")

    found = list(field_map.keys())
    missing = [f for f in REQUIRED_SYSTEM_FIELDS if f not in found]
    return field_map, found, missing


async def validate_form(form_url: str) -> Dict[str, Any]:
    """
    Opens the Google Form, detects fields, returns a validation report.
    Does NOT submit anything.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            field_map, found, missing = await detect_field_map(page, form_url)
            passed = len(missing) == 0
            return {
                "passed": passed,
                "form_url": form_url,
                "fields_detected": len(found),
                "found": found,
                "missing": missing,
                "field_map": {k: v for k, v in field_map.items()},
                "message": (
                    "All required fields detected. Ready to submit."
                    if passed
                    else f"Missing fields: {', '.join(missing)}. Submission blocked."
                ),
            }
        except Exception as e:
            return {
                "passed": False,
                "form_url": form_url,
                "fields_detected": 0,
                "found": [],
                "missing": REQUIRED_SYSTEM_FIELDS,
                "field_map": {},
                "message": f"Validation error: {str(e)}",
            }
        finally:
            await browser.close()


class PlaywrightSubmissionEngine:
    def __init__(self, db_session: AsyncSession, batch_id: str, user_id: str, mode: str = "production"):
        self.db = db_session
        self.batch_id = batch_id
        self.user_id = user_id
        self.mode = mode  # 'production' | 'test_visible' | 'dry_run'
        os.makedirs("reports/errors", exist_ok=True)

    async def start_batch(
        self,
        valid_records: List[Dict[str, Any]],
        form_url: str,
        field_map: Optional[Dict[str, dict]] = None,
    ):
        headless = self.mode != "test_visible"

        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir="playwright_user_data",
                headless=headless,
                args=["--disable-blink-features=AutomationControlled"],
            )
            try:
                # Auto-detect field map if not pre-supplied
                if not field_map:
                    logger.info("[Engine] Auto-detecting field map from form...")
                    temp_page = await context.new_page()
                    field_map, found, missing = await detect_field_map(temp_page, form_url)
                    await temp_page.close()

                    if missing:
                        logger.error(f"[Engine] Cannot submit — missing fields: {missing}")
                        # Mark batch as failed
                        batch = await self.db.get(UploadBatch, self.batch_id)
                        if batch:
                            batch.status = "Failed"
                            await self.db.commit()
                        return

                for record in valid_records:
                    # Poll batch status (supports pause/cancel)
                    batch = await self.db.get(UploadBatch, self.batch_id)
                    if not batch:
                        break
                    while batch.status == "Paused":
                        await asyncio.sleep(5)
                        await self.db.refresh(batch)
                    if batch.status == "Cancelled":
                        break

                    await self._process_single_record(context, record, field_map, form_url)

            finally:
                await context.close()

    async def _process_single_record(
        self,
        context: BrowserContext,
        record: Dict[str, Any],
        field_map: Dict[str, dict],
        form_url: str,
    ):
        max_retries = 3
        for attempt in range(max_retries):
            page = await context.new_page()
            try:
                await page.goto(form_url, wait_until="networkidle", timeout=30000)

                for sys_field, field_info in field_map.items():
                    value = record.get(sys_field)
                    if not value:
                        continue
                    
                    label_text = field_info["label"]
                    input_type = field_info["type"]
                    
                    try:
                        # Find the container for this specific question
                        container = page.locator('.Qr7Oae, div[role="listitem"], div[jsmodel]').filter(has_text=label_text).last
                        await container.wait_for(state="visible", timeout=5000)

                        if input_type == "listbox":
                            # Open the dropdown
                            dropdown = container.locator('div[role="listbox"]')
                            await dropdown.click()
                            # Wait for the options to appear in the DOM (Google Forms renders them globally at the bottom)
                            await page.wait_for_timeout(500)
                            
                            val_str = str(value)
                            option = page.locator('div[role="option"]').filter(has_text=val_str).first
                            try:
                                await option.wait_for(state="visible", timeout=1000)
                                await option.click()
                            except:
                                # Fallback: grab all options and use difflib for smart fuzzy matching
                                options = await page.locator('div[role="option"]').all()
                                opt_map = {}
                                for opt in options:
                                    txt = await opt.inner_text()
                                    opt_map[txt.lower().strip()] = opt
                                
                                val_lower = val_str.lower().strip()
                                best_matches = difflib.get_close_matches(val_lower, list(opt_map.keys()), n=1, cutoff=0.4)
                                
                                if best_matches:
                                    await opt_map[best_matches[0]].click()
                                else:
                                    raise Exception(f"Option '{val_str}' not found in dropdown")
                                    
                            await page.wait_for_timeout(300)

                        elif input_type in ("text", "textarea"):
                            if sys_field == "attendance_date":
                                # Special handling for Google Forms date widgets which use multiple text inputs
                                parts = str(value).replace("-", "/").split("/")
                                if len(parts) >= 2:
                                    dd, mm = parts[0], parts[1]
                                    inputs = await container.locator('input[type="text"]').all()
                                    if len(inputs) >= 2:
                                        for inp in inputs:
                                            aria = await inp.get_attribute("aria-label") or ""
                                            if "Day" in aria or "day" in aria:
                                                await inp.fill(dd)
                                            elif "Month" in aria or "month" in aria:
                                                await inp.fill(mm)
                                            elif "Year" in aria and len(parts) >= 3:
                                                await inp.fill(parts[2])
                                        continue

                            input_el = container.locator('input[type="text"], input:not([type="hidden"]), textarea').first
                            await input_el.fill(str(value))

                        elif input_type == "radio":
                            option = container.locator(f'[data-value="{value}"], div[role="radio"]').filter(has_text=str(value)).first
                            await option.click()

                    except Exception as fill_err:
                        logger.warning(f"[Fill] Could not fill '{sys_field}' with value '{value}': {fill_err}")

                # Submit
                if self.mode != "dry_run":
                    submit_btn = page.locator(
                        'div[role="button"]:has-text("Submit"), '
                        'button:has-text("Submit")'
                    )
                    await submit_btn.first.click()
                    
                    try:
                        await page.wait_for_selector(
                            '.freebirdFormviewerViewResponseConfirmationMessage, .vHW8K',
                            timeout=5000,
                        )
                    except:
                        # Check if a form validation error appeared (e.g., "This is a required question")
                        error_el = await page.query_selector('.RxsGPe, div[role="alert"]')
                        if error_el and await error_el.is_visible():
                            err_txt = await error_el.inner_text()
                            raise Exception(f"Form rejected submission: {err_txt}")
                        raise Exception("Timeout waiting for submission confirmation")

                await self._log_result(record, form_url, "Success", None)
                await page.close()
                return

            except Exception as e:
                if attempt == max_retries - 1:
                    error_msg = str(e)
                    file_id = str(uuid.uuid4())
                    ss_path = f"reports/errors/{file_id}.png"
                    html_path = f"reports/errors/{file_id}.html"
                    try:
                        await page.screenshot(path=ss_path)
                        html_content = await page.content()
                        with open(html_path, "w", encoding="utf-8") as f:
                            f.write(html_content)
                    except Exception:
                        pass
                    await self._log_result(record, form_url, "Failed", f"{error_msg} | ss: {ss_path}")
                else:
                    await asyncio.sleep(2**attempt)
            finally:
                if not page.is_closed():
                    await page.close()

    async def _log_result(
        self,
        record: Dict[str, Any],
        form_url: str,
        status: str,
        error_msg: Optional[str],
    ):
        current_year = datetime.now().year
        date_str = record.get("attendance_date", "")
        try:
            parsed_date = datetime.strptime(f"{date_str}/{current_year}", "%d/%m/%Y").date()
        except ValueError:
            parsed_date = datetime.utcnow().date()

        # Update attendance record status
        from app.db.models import AttendanceRecord
        rec_id = record.get("id")
        if rec_id:
            att = await self.db.get(AttendanceRecord, str(rec_id))
            if att:
                att.status = "Submitted" if status == "Success" else "Failed"

        res = SubmissionResult(
            record_id=str(record.get("id", uuid.uuid4())),
            user_id=self.user_id,
            timestamp=datetime.utcnow(),
            attendance_date=parsed_date,
            worker_name=record.get("worker_name", "Unknown"),
            project_name=record.get("project_name", "Unknown"),
            duration=record.get("duration", ""),
            status=status,
            error_message=error_msg,
            form_url=form_url,
        )
        self.db.add(res)
        await self.db.commit()
