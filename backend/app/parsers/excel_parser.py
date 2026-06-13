import io
import pandas as pd
from typing import Dict, List, Any

class ExcelParserService:
    def __init__(self, file_bytes: bytes):
        self.file_bytes = file_bytes
        self.valid_codes = {"P", "P.5", "PP", "A"}

    def parse(self) -> Dict[str, Any]:
        results = {"records": [], "errors": [], "debug": {
            "total_extracted_raw": 0,
            "unique_workers": set(),
            "worker_columns": [],
            "sheets_processed": 0,
            "records_per_sheet": {},
            "attendance_codes": {"P": 0, "P.5": 0, "PP": 0, "A": 0}
        }}
        
        try:
            xls = pd.ExcelFile(io.BytesIO(self.file_bytes), engine="openpyxl")
        except Exception as e:
            results["errors"].append({
                "error": f"Failed to open Excel file: {str(e)}",
                "sheet_name": "GLOBAL"
            })
            return results

        for sheet_name in xls.sheet_names:
            try:
                df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
                
                # Check for empty dataframe
                if df.empty or len(df.columns) < 2:
                    continue
                
                # We will only process the first sheet that successfully parses as an attendance report
                # to prevent duplicating data if multiple sheets are identical or older months.
                if results["debug"]["sheets_processed"] > 0:
                    break
                
                # Find the header row (contains 'DATES')
                header_row_idx = -1
                for idx, row in df.iterrows():
                    first_cell = str(row.iloc[0]).strip().upper()
                    if first_cell == "DATES":
                        header_row_idx = idx
                        break
                        
                if header_row_idx == -1:
                    results["errors"].append({
                        "error": "Could not find 'DATES' header row",
                        "sheet_name": sheet_name
                    })
                    continue
                    
                # Extract worker names from header row
                header_row = df.iloc[header_row_idx]
                
                workers = []
                for col_idx in range(1, len(header_row)):
                    val = str(header_row.iloc[col_idx]).strip()
                    if val and val.lower() not in ['nan', 'none', 'nat'] and "Unnamed" not in val:
                        # Exclude common total/summary columns
                        if val.upper() in ["TOTAL", "GRAND TOTAL", "RATE", "REMARKS", "DATES"]:
                            continue
                            
                        workers.append({
                            "name": val,
                            "status_col": col_idx,
                            "project_col": col_idx + 1 if col_idx + 1 < len(header_row) else None
                        })
                        results["debug"]["unique_workers"].add(val)
                        results["debug"]["worker_columns"].append(val)
                
                results["debug"]["sheets_processed"] += 1
                sheet_records = 0
                
                for row_idx in range(header_row_idx + 1, len(df)):
                    row = df.iloc[row_idx]
                    raw_date = row.iloc[0]
                    
                    str_date = str(raw_date).strip().upper()
                    if str_date in ["TOTAL", "RATE", "GRAND TOTAL"] or not str_date or str_date.lower() in ['nan', 'nat', 'none']:
                        if str_date in ["TOTAL", "RATE", "GRAND TOTAL"]:
                            break
                        continue
                        
                    for worker in workers:
                        worker_name = worker["name"]
                        status_col = worker["status_col"]
                        project_col = worker["project_col"]
                        
                        raw_status = str(row.iloc[status_col]).strip()
                        raw_project = str(row.iloc[project_col]).strip() if project_col is not None else ""
                        
                        if not raw_status or raw_status.lower() in ['nan', 'nat', 'none']:
                            continue
                            
                        status_code = raw_status.upper()
                        # Clean up basic attendance codes with unexpected spaces
                        status_code = status_code.replace(" ", "")
                        
                        results["debug"]["total_extracted_raw"] += 1
                        if status_code in results["debug"]["attendance_codes"]:
                            results["debug"]["attendance_codes"][status_code] += 1
                        
                        # In case project is 'A' or 'nan' for Absent records, map to None
                        project_name = raw_project if raw_project.lower() not in ['nan', 'nat', 'none', 'a'] else None
                        
                        date_str = str(raw_date)[:10] if not isinstance(raw_date, pd.Timestamp) else raw_date.strftime('%Y-%m-%d')
                        
                        record = {
                            "date": date_str,
                            "worker_name": worker_name,
                            "attendance_code": status_code,
                            "project_name": project_name,
                            "sheet_name": sheet_name,
                            "raw_value": f"{raw_status} | {raw_project}"
                        }
                        
                        validation_errors = self._validate_record(record)
                        
                        if validation_errors:
                            record["error"] = "; ".join(validation_errors)
                            results["errors"].append(record)
                        else:
                            del record["raw_value"]
                            results["records"].append(record)
                            sheet_records += 1
                            
                results["debug"]["records_per_sheet"][sheet_name] = sheet_records
                            
            except Exception as e:
                 results["errors"].append({
                     "error": f"Error processing sheet: {str(e)}",
                     "sheet_name": sheet_name
                 })
                 
        # Convert set to list for JSON serialization
        results["debug"]["unique_workers"] = list(results["debug"]["unique_workers"])
        return results

    def _parse_cell(self, raw_value: str) -> Dict[str, str]:
        # Legacy method in case it's called somewhere else
        parts = [p.strip() for p in raw_value.split("+", 1)]
        code = parts[0].upper()
        project = parts[1] if len(parts) > 1 else None
        return {"code": code, "project": project}

    def _validate_record(self, record: Dict[str, Any]) -> List[str]:
        errors = []
        
        if not record["worker_name"] or "Unnamed" in record["worker_name"]:
            errors.append("Invalid or empty worker name")
            
        if record["attendance_code"] not in self.valid_codes:
            errors.append(f"Invalid attendance code '{record['attendance_code']}'")
            
        if record["attendance_code"] in ["P", "P.5", "PP"] and not record["project_name"]:
            errors.append("Project missing for active attendance")
            
        # Basic date check
        try:
            pd.to_datetime(record["date"])
        except ValueError:
            errors.append("Unrecognized date format")
            
        return errors
