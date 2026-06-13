import uuid
from typing import Dict, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.models import FormProfile, FormField, FieldMapping, MappingHistory

class FormManagerService:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def get_profile(self, profile_id: str) -> FormProfile:
        stmt = select(FormProfile).where(FormProfile.id == uuid.UUID(profile_id))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def save_mappings(self, profile_id: str, user_id: str, mappings: Dict[str, str]) -> Dict[str, Any]:
        """
        mappings: { field_id (UUID string): system_field (str) }
        """
        # Create new mappings
        new_mappings = []
        for field_id_str, sys_field in mappings.items():
            fm = FieldMapping(
                field_id=uuid.UUID(field_id_str),
                system_field=sys_field
            )
            self.db.add(fm)
            new_mappings.append(fm)
            
        # Save snapshot to history
        history = MappingHistory(
            profile_id=uuid.UUID(profile_id),
            snapshot=mappings,
            updated_by=uuid.UUID(user_id) if user_id else None
        )
        self.db.add(history)
        
        await self.db.commit()
        return {"status": "success", "mapped_count": len(new_mappings)}

class PreSubmissionValidatorService:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.required_system_fields = {
            "attendance_date", 
            "worker_name", 
            "project_name", 
            "boq_category", 
            "duration", 
            "description"
        }

    async def validate_profile(self, profile_id: str) -> List[str]:
        errors = []
        
        # Fetch fields and their mappings
        stmt = select(FormField, FieldMapping).outerjoin(
            FieldMapping, FormField.id == FieldMapping.field_id
        ).where(FormField.profile_id == uuid.UUID(profile_id))
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        mapped_system_fields = set()
        for form_field, field_mapping in rows:
            if field_mapping:
                sys_field = field_mapping.system_field
                
                if sys_field in mapped_system_fields:
                    errors.append(f"System field '{sys_field}' mapped multiple times.")
                mapped_system_fields.add(sys_field)
            elif form_field.is_required:
                errors.append(f"Form requires '{form_field.label}', but no internal field mapped.")
                
        # Check for missing core mappings
        missing_core = self.required_system_fields - mapped_system_fields
        if missing_core:
            for mc in missing_core:
                errors.append(f"Required system field '{mc}' is not mapped.")
                
        return errors
