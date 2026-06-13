import datetime
from typing import Dict, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.models import Worker, WorkerMapping

class AttendanceRulesEngine:
    def __init__(self, db_session: AsyncSession, session_id: str):
        self.db = db_session
        self.session_id = session_id

    async def process_batch(self, parsed_records: List[Dict[str, Any]]) -> Dict[str, Any]:
        results = {"valid_records": [], "errors": [], "debug": {
            "duplicates_detected": 0,
            "total_after_expansion": 0
        }}
        
        # 1. Extract unique worker names
        worker_names = {record.get("worker_name") for record in parsed_records if record.get("worker_name")}
        
        if not worker_names:
            return results
            
        # 2. Bulk fetch workers from DB
        workers_stmt = select(Worker).where(Worker.name.in_(worker_names), Worker.session_id == self.session_id)
        workers_result = await self.db.execute(workers_stmt)
        workers = workers_result.scalars().all()
        
        worker_lookup = {w.name: w for w in workers}
        
        # Auto-create missing workers
        missing_workers = []
        for w_name in worker_names:
            if w_name not in worker_lookup:
                # Infer worker type from name (e.g., CARPENTER_NARESH -> CARPENTER)
                w_type = w_name.split("_")[0] if "_" in w_name else "GENERAL"
                new_worker = Worker(name=w_name, worker_type=w_type, session_id=self.session_id)
                self.db.add(new_worker)
                missing_workers.append(new_worker)
                worker_lookup[w_name] = new_worker
                
        if missing_workers:
            await self.db.flush()
        
        # 3. Bulk fetch BOQ Worker Mappings
        mappings_stmt = select(WorkerMapping).where(WorkerMapping.session_id == self.session_id)
        mappings_result = await self.db.execute(mappings_stmt)
        mappings = {m.worker_type: m for m in mappings_result.scalars().all()}
        
        # Auto-create missing mappings
        missing_mappings = []
        for worker in worker_lookup.values():
            if worker.worker_type not in mappings:
                w_type_upper = worker.worker_type.upper()
                
                boq_cat = worker.worker_type
                desc = "Auto-generated mapping"
                
                if "CARPENTER" in w_type_upper:
                    boq_cat = "Manufactured cabinetry"
                    desc = "carpentry"
                elif "PAINTER" in w_type_upper:
                    boq_cat = "painting"
                    desc = "painting"
                elif "POLISHER" in w_type_upper:
                    boq_cat = "polishing"
                    desc = "polishing"

                new_mapping = WorkerMapping(
                    session_id=self.session_id,
                    worker_type=worker.worker_type,
                    boq_category=boq_cat,
                    description=desc
                )
                self.db.add(new_mapping)
                missing_mappings.append(new_mapping)
                mappings[worker.worker_type] = new_mapping
                
        if missing_mappings:
            await self.db.flush()
        
        # 4. Process each record
        for raw_record in parsed_records:
            worker_name = raw_record.get("worker_name")
            code = raw_record.get("attendance_code")
            project = raw_record.get("project_name")
            date_str = raw_record.get("date") # Assuming e.g. "2026-05-16"
            
            if not code:
                results["errors"].append({
                    "raw_record": raw_record,
                    "error_message": "Missing attendance code."
                })
                continue
                
            # Rule A: Skip
            if code == "A":
                continue
                
            if not project:
                results["errors"].append({
                    "raw_record": raw_record,
                    "error_message": "Missing project for active attendance."
                })
                continue
                
            worker = worker_lookup.get(worker_name)
            if not worker:
                results["errors"].append({
                    "raw_record": raw_record,
                    "error_message": f"Unknown worker '{worker_name}'. Please add worker mapping."
                })
                continue
                
            mapping = mappings.get(worker.worker_type)
            if not mapping:
                results["errors"].append({
                    "raw_record": raw_record,
                    "error_message": f"Missing BOQ mapping for worker type '{worker.worker_type}'."
                })
                continue
                
            # Format date to DD/MM
            try:
                dt = datetime.datetime.strptime(date_str, "%Y-%m-%d")
                formatted_date = dt.strftime("%d/%m")
            except Exception:
                formatted_date = date_str
                
            base_record = {
                "attendance_date": formatted_date,
                "worker_name": worker_name,
                "worker_type": worker.worker_type,
                "project_name": project,
                "boq_category": mapping.boq_category,
                "description": mapping.description,
            }
            
            if code == "P":
                record1 = dict(base_record)
                record1["duration"] = "8-10 Hours"
                results["valid_records"].append(record1)
                
            elif code == "P.5":
                record1 = dict(base_record)
                record1["duration"] = "8-10 Hours"
                results["valid_records"].append(record1)
                
                record2 = dict(base_record)
                record2["duration"] = "4-6 Hours"
                results["valid_records"].append(record2)
                results["debug"]["duplicates_detected"] += 1
                
            elif code == "PP":
                record1 = dict(base_record)
                record1["duration"] = "8-10 Hours"
                results["valid_records"].append(record1)
                
                record2 = dict(base_record)
                record2["duration"] = "8-10 Hours"
                results["valid_records"].append(record2)
                results["debug"]["duplicates_detected"] += 1
            else:
                 results["errors"].append({
                    "raw_record": raw_record,
                    "error_message": f"Unrecognized attendance code '{code}'."
                })
                
        results["debug"]["total_after_expansion"] = len(results["valid_records"])
        return results
