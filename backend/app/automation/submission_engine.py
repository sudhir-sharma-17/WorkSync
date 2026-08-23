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


def extract_form_schema(form_url: str) -> Dict[str, List[str]]:
    """
    Parses Google Form HTML directly and extracts all question titles and their dropdown/radio options.
    Returns a dict mapping system field names to list of option strings.
    """
    import urllib.request
    import re
    import json
    schema: Dict[str, List[str]] = {}
    try:
        req = urllib.request.Request(
            form_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            html = response.read().decode('utf-8', errors='ignore')

        match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);</script>', html, re.DOTALL)
        if not match:
            return schema

        data = json.loads(match.group(1))
        questions = data[1][1]

        for q in questions:
            if not isinstance(q, list) or len(q) < 2:
                continue
            title = str(q[1]).strip() if q[1] else ""
            if not title:
                continue

            sys_field = _match_label(title)
            if not sys_field:
                continue

            options = []
            if len(q) > 4 and q[4]:
                sub = q[4][0]
                if len(sub) > 1 and sub[1]:
                    for opt in sub[1]:
                        if opt and isinstance(opt, list) and len(opt) > 0 and opt[0]:
                            opt_str = str(opt[0]).strip()
                            if opt_str and opt_str not in options:
                                options.append(opt_str)

            if sys_field not in schema or len(options) > len(schema[sys_field]):
                schema[sys_field] = options

    except Exception as e:
        logger.error(f"[FormSchemaExtractor] Error extracting schema from {form_url}: {e}")

    return schema



async def detect_field_map(page: Page, form_url: str) -> Tuple[Dict[str, dict], List[str], List[str]]:
    """
    Opens the Google Form and reads each question label.
    Returns:
      field_map:  { system_field -> {"label": "safe_label", "type": "input_type"} }
      found:      list of system fields that were matched
      missing:    list of required system fields that were NOT found
    """
    await page.goto(form_url, wait_until="domcontentloaded", timeout=30000)
    try:
        await page.wait_for_selector('.Qr7Oae, div[role="listitem"], div[jsmodel], [data-params]', timeout=5000)
    except Exception:
        pass

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


_active_login_connections = set()

def mark_connection_active(session_id: str):
    _active_login_connections.add(session_id)

def mark_connection_inactive(session_id: str):
    _active_login_connections.discard(session_id)

def is_connection_active(session_id: str) -> bool:
    return session_id in _active_login_connections


async def check_google_session_status(session_id: str) -> Dict[str, Any]:
    """
    Checks if there's a valid active Google login session for this session_id.
    """
    if is_connection_active(session_id):
        return {"connected": False, "email": None, "connecting": True}

    session_dir = os.path.abspath(f"playwright_sessions/{session_id}")
    if not os.path.exists(session_dir):
        return {"connected": False, "email": None}
    
    async with async_playwright() as p:
        context = None
        for launch_attempt in range(3):
            try:
                context = await p.chromium.launch_persistent_context(
                    user_data_dir=session_dir,
                    headless=True,
                    ignore_default_args=["--enable-automation"],
                    args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
                )
                break
            except Exception as e:
                if launch_attempt == 2:
                    return {"connected": False, "email": None}
                await asyncio.sleep(0.5)

        try:
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto("https://myaccount.google.com/email", wait_until="domcontentloaded", timeout=15000)
            
            url = page.url
            if "accounts.google.com" in url:
                await context.close()
                return {"connected": False, "email": None}

            
            email = None
            try:
                elements = await page.locator("text=@").all()
                for el in elements:
                    text = await el.inner_text()
                    if "@" in text and "." in text and len(text) < 100:
                        for word in text.split():
                            if "@" in word and "." in word:
                                email = word.strip("()<>[],;:")
                                break
                    if email:
                        break
            except Exception:
                pass
            
            await context.close()
            if email:
                return {"connected": True, "email": email}
            
            return {"connected": True, "email": "Connected Account"}
        except Exception as e:
            logger.warning(f"Error checking Google status for session {session_id}: {e}")
            return {"connected": False, "email": None}


async def validate_form(form_url: str, session_id: str) -> Dict[str, Any]:
    """
    Opens the Google Form, detects fields, returns a validation report.
    Does NOT submit anything.
    """
    session_dir = os.path.abspath(f"playwright_sessions/{session_id}")
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=session_dir,
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            page = context.pages[0] if context.pages else await context.new_page()
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
            await context.close()


class PlaywrightSubmissionEngine:
    def __init__(self, db_session: AsyncSession, batch_id: str, session_id: str, mode: str = "production"):
        self.db = db_session
        self.batch_id = batch_id
        self.session_id = session_id
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
            context = None
            for launch_attempt in range(5):
                try:
                    context = await p.chromium.launch_persistent_context(
                        user_data_dir=f"playwright_sessions/{self.session_id}",
                        headless=headless,
                        args=[
                            "--disable-blink-features=AutomationControlled",
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-gpu",
                            "--disable-dev-shm-usage",
                        ],
                    )
                    break
                except Exception as e:
                    if launch_attempt == 4:
                        raise e
                    await asyncio.sleep(1.0)
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

                current_page_holder = [None]
                try:
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

                        try:
                            await self._process_single_record(context, record, field_map, form_url, current_page_holder)
                        except Exception as e:
                            err_str = str(e)
                            if "Connection closed" in err_str or "closed" in err_str or "driver" in err_str:
                                logger.warning(f"[Engine] Browser context died. Recreating context...")
                                try:
                                    await context.close()
                                except Exception:
                                    pass
                                context = None
                                for launch_attempt in range(5):
                                    try:
                                        context = await p.chromium.launch_persistent_context(
                                            user_data_dir=f"playwright_sessions/{self.session_id}",
                                            headless=headless,
                                            args=[
                                                "--disable-blink-features=AutomationControlled",
                                                "--no-sandbox",
                                                "--disable-setuid-sandbox",
                                                "--disable-gpu",
                                                "--disable-dev-shm-usage",
                                            ],
                                        )
                                        break
                                    except Exception as launch_err:
                                        if launch_attempt == 4:
                                            raise launch_err
                                        await asyncio.sleep(1.0)
                                current_page_holder[0] = None
                                await self._process_single_record(context, record, field_map, form_url, current_page_holder)
                            else:
                                pass
                finally:
                    if current_page_holder[0] and not current_page_holder[0].is_closed():
                        try:
                            await current_page_holder[0].close()
                        except Exception:
                            pass

            finally:
                if context:
                    await context.close()

    async def _process_single_record(
        self,
        context: BrowserContext,
        record: Dict[str, Any],
        field_map: Dict[str, dict],
        form_url: str,
        current_page_holder: list,
    ):
        max_retries = 3
        for attempt in range(max_retries):
            page = current_page_holder[0]
            try:
                if page is None or page.is_closed():
                    page = await context.new_page()
                    current_page_holder[0] = page
                    await page.goto(form_url, wait_until="domcontentloaded", timeout=30000)
                else:
                    submit_another_btn = page.locator('a:has-text("Submit another response"), a:has-text("Submit another")').first
                    try:
                        await submit_another_btn.wait_for(state="visible", timeout=1500)
                        await submit_another_btn.click()
                        await page.wait_for_selector('.Qr7Oae, div[role="listitem"], div[jsmodel], [data-params]', timeout=3000)
                    except Exception:
                        await page.goto(form_url, wait_until="domcontentloaded", timeout=30000)

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
                            # Wait for at least one option to become visible
                            try:
                                await page.locator('div[role="option"]').first.wait_for(state="visible", timeout=2000)
                            except Exception:
                                pass
                            
                            # Grab all visible options
                            options = await page.locator('div[role="option"]').all()
                            opt_map = {}
                            for opt in options:
                                if await opt.is_visible():
                                    txt = await opt.inner_text()
                                    opt_map[txt.strip()] = opt
                                    opt_map[txt.lower().strip()] = opt
                            
                            val_str = str(value).strip()
                            val_lower = val_str.lower()
                            
                            if val_str in opt_map:
                                await opt_map[val_str].click()
                            elif val_lower in opt_map:
                                await opt_map[val_lower].click()
                            else:
                                best_matches = difflib.get_close_matches(val_lower, list(opt_map.keys()), n=1, cutoff=0.4)
                                if best_matches:
                                    await opt_map[best_matches[0]].click()
                                else:
                                    raise Exception(f"Option '{val_str}' not found in dropdown")

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
                                                await inp.blur()
                                            elif "Month" in aria or "month" in aria:
                                                await inp.fill(mm)
                                                await inp.blur()
                                            elif "Year" in aria and len(parts) >= 3:
                                                await inp.fill(parts[2])
                                                await inp.blur()
                                        continue

                            input_el = container.locator('input[type="text"], input:not([type="hidden"]), textarea').first
                            await input_el.fill(str(value))
                            await input_el.blur()

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
                    ).first
                    
                    # Wait up to 2 seconds for the submit button to become enabled in the DOM
                    for _ in range(10):
                        aria_disabled = await submit_btn.get_attribute("aria-disabled")
                        if aria_disabled != "true":
                            break
                        await page.wait_for_timeout(200)

                    await submit_btn.click()
                    
                    try:
                        # Wait up to 10 seconds for any confirmation condition to match:
                        # 1. URL contains 'formResponse'
                        # 2. Confirmation CSS selectors appear
                        # 3. Success text appears on the page
                        await page.wait_for_function(
                            "() => window.location.href.includes('formResponse') || "
                            "document.querySelector('.freebirdFormviewerViewResponseConfirmationMessage, .vHW8K') !== null || "
                            "document.body.innerText.includes('Your response has been recorded') || "
                            "document.body.innerText.includes('Submit another response')",
                            timeout=10000
                        )
                    except:
                        # Check if a form validation error appeared (e.g., "This is a required question")
                        error_el = await page.query_selector('.RxsGPe, div[role="alert"]')
                        if error_el and await error_el.is_visible():
                            err_txt = await error_el.inner_text()
                            raise Exception(f"Form rejected submission: {err_txt}")
                        raise Exception("Timeout waiting for submission confirmation")

                await self._log_result(record, form_url, "Success", None)
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
                
                try:
                    await page.close()
                except Exception:
                    pass
                current_page_holder[0] = None

                if attempt < max_retries - 1:
                    await asyncio.sleep(2**attempt)

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
            session_id=self.session_id,
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
