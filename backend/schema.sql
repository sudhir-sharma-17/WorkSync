-- PostgreSQL Schema for Labour Attendance Automation System
-- UUID extension required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    role VARCHAR DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);

-- Table: form_mappings
CREATE TABLE form_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_url VARCHAR NOT NULL UNIQUE,
    field_mappings JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: worker_mappings
CREATE TABLE worker_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_type VARCHAR NOT NULL UNIQUE,
    boq_category VARCHAR NOT NULL,
    description VARCHAR NOT NULL
);

-- Table: workers
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL UNIQUE,
    worker_type VARCHAR NOT NULL
);
CREATE INDEX idx_workers_name ON workers(name);

-- Table: upload_batches
CREATE TABLE upload_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    form_url VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: attendance_records
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    project_name VARCHAR NOT NULL,
    attendance_date DATE NOT NULL,
    duration VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'Pending'
);
CREATE INDEX idx_attendance_batch_id ON attendance_records(batch_id);
CREATE INDEX idx_attendance_worker_id ON attendance_records(worker_id);
CREATE INDEX idx_attendance_date ON attendance_records(attendance_date);

-- Table: submission_results
CREATE TABLE submission_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attendance_date DATE NOT NULL,
    worker_name VARCHAR NOT NULL,
    project_name VARCHAR NOT NULL,
    duration VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    error_message TEXT,
    form_url VARCHAR NOT NULL
);
CREATE INDEX idx_submission_timestamp ON submission_results(timestamp);
CREATE INDEX idx_submission_status ON submission_results(status);
CREATE INDEX idx_submission_record_id ON submission_results(record_id);
