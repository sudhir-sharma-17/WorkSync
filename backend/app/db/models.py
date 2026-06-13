import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Date, ForeignKey, Text, Integer, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def new_uuid():
    return str(uuid.uuid4())


class FormProfile(Base):
    __tablename__ = "form_profiles"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("session_id", "url", name="uq_form_profile_session_url"),)

    fields = relationship("FormField", back_populates="profile")
    history = relationship("MappingHistory", back_populates="profile")


class FormField(Base):
    __tablename__ = "form_fields"

    id = Column(String, primary_key=True, default=new_uuid)
    profile_id = Column(String, ForeignKey("form_profiles.id", ondelete="CASCADE"), nullable=False)
    field_id = Column(String, nullable=False)
    label = Column(String, nullable=False)
    field_type = Column(String, nullable=False)
    options = Column(Text, nullable=True)  # stored as JSON string
    is_required = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)

    profile = relationship("FormProfile", back_populates="fields")
    mapping = relationship("FieldMapping", back_populates="field", uselist=False)


class FieldMapping(Base):
    __tablename__ = "field_mappings"

    id = Column(String, primary_key=True, default=new_uuid)
    field_id = Column(String, ForeignKey("form_fields.id", ondelete="CASCADE"), nullable=False, unique=True)
    system_field = Column(String, nullable=False)

    field = relationship("FormField", back_populates="mapping")


class MappingHistory(Base):
    __tablename__ = "mapping_history"

    id = Column(String, primary_key=True, default=new_uuid)
    profile_id = Column(String, ForeignKey("form_profiles.id", ondelete="CASCADE"), nullable=False)
    snapshot = Column(Text, nullable=False)  # stored as JSON string
    updated_by_session = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    profile = relationship("FormProfile", back_populates="history")


class WorkerMapping(Base):
    __tablename__ = "worker_mappings"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, nullable=False, index=True)
    worker_type = Column(String, nullable=False)
    boq_category = Column(String, nullable=False)
    description = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("session_id", "worker_type", name="uq_worker_mapping_session_type"),)


class Worker(Base):
    __tablename__ = "workers"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    worker_type = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("session_id", "name", name="uq_worker_session_name"),)

    attendance_records = relationship("AttendanceRecord", back_populates="worker")


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, nullable=False, index=True)
    form_url = Column(String, nullable=False)
    status = Column(String, default="Pending")
    debug_meta = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    attendance_records = relationship("AttendanceRecord", back_populates="batch")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, nullable=False, index=True)
    batch_id = Column(String, ForeignKey("upload_batches.id"), nullable=False, index=True)
    worker_id = Column(String, ForeignKey("workers.id"), nullable=False, index=True)
    project_name = Column(String, nullable=False)
    attendance_date = Column(Date, nullable=False, index=True)
    duration = Column(String, nullable=False)
    status = Column(String, default="Pending")

    batch = relationship("UploadBatch", back_populates="attendance_records")
    worker = relationship("Worker", back_populates="attendance_records")
    submission_result = relationship("SubmissionResult", back_populates="record", uselist=False)


class SubmissionResult(Base):
    __tablename__ = "submission_results"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, nullable=False, index=True)
    record_id = Column(String, ForeignKey("attendance_records.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    attendance_date = Column(Date, nullable=False)
    worker_name = Column(String, nullable=False)
    project_name = Column(String, nullable=False)
    duration = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    form_url = Column(String, nullable=False)

    record = relationship("AttendanceRecord", back_populates="submission_result")
