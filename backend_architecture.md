# Labour Attendance Automation System - Backend Architecture

## 1. Production-Ready Folder Structure

The project follows a scalable, domain-driven structure designed for FastAPI:

```text
backend/
├── app/
│   ├── api/          # REST API endpoints, grouped by domain (auth, upload, forms)
│   ├── core/         # Core application settings, security, and JWT config
│   ├── db/           # Async database session management, connection pooling
│   ├── models/       # SQLAlchemy 2.0 ORM models (Entity definitions)
│   ├── schemas/      # Pydantic models for request/response validation
│   ├── services/     # Business logic layer (Excel Parsing, Attendance Rules)
│   ├── automation/   # Playwright headless browser scripts (Scanner & Submitter)
│   ├── parsers/      # Specialized parsers (Excel .xlsx to DataFrames)
│   ├── tasks/        # FastAPI BackgroundTasks definitions
│   └── utils/        # Helper functions, formatters, and constants
├── alembic/          # Database migration scripts
├── tests/            # Pytest test suite
├── uploads/          # Temporary directory for Excel uploads
├── reports/          # Temporary directory for generated CSV reports
└── main.py           # Application entry point and bootstrap
```

### Folder-by-Folder Explanation
*   **`api/`**: Contains API routers. We keep controllers thin. Their only job is to receive HTTP requests, call the `services/` layer, and return HTTP responses.
*   **`core/`**: Houses `config.py` (Pydantic BaseSettings for env vars) and `security.py` (bcrypt hashing, JWT token generation).
*   **`db/`**: Contains `session.py` defining the `asyncpg` engine and `sessionmaker`.
*   **`models/`**: SQLAlchemy models representing database tables.
*   **`schemas/`**: Pydantic models for data validation. This decouples API schemas from DB models.
*   **`services/`**: The heart of the application. Contains the `AttendanceProcessingEngine`, `WorkerMapper`, etc.
*   **`automation/`**: Isolates Playwright dependencies. Contains `FormScanner` and `Submitter` classes.
*   **`parsers/`**: Specifically for handling file I/O (e.g., Pandas Excel parsing) before handing data to services.
*   **`tasks/`**: Defines the functions that will be dispatched to `BackgroundTasks` (e.g., `process_batch_task`).

## 2. Dependency Injection (DI) Structure

FastAPI relies heavily on DI. We will define reusable dependencies in `app/api/deps.py`:

1.  `get_db()`: Yields an `AsyncSession` for database operations, ensuring the connection is closed after the request.
2.  `get_current_user()`: Extracts the JWT token from the `Authorization` header, decodes it, and fetches the user from the DB.
3.  `get_current_admin()`: Wraps `get_current_user()` and verifies the user's role.

## 3. Database Connection Manager

We use **SQLAlchemy 2.0** with the **asyncpg** driver for fully asynchronous database operations.
*   **Engine**: `create_async_engine` initialized with connection pooling constraints.
*   **Session**: `async_sessionmaker` configured to expire on commit.

## 4. Alembic Configuration

*   `alembic init -t async alembic`: Initializes an async migration environment.
*   **`env.py`**: Configured to import the declarative base from `app.models` and read the `DATABASE_URL` from the environment.

## 5. Authentication Architecture

*   **Hashing**: `passlib` with `bcrypt`.
*   **JWT**: `PyJWT` for issuing access tokens (with expiration).
*   **Flow**: Client sends `username/password` to `/api/auth/login` -> receives `access_token` -> subsequent requests include `Authorization: Bearer <token>`.

## 6. Service Layer Architecture (Attendance Processing)

The Processing Module is broken into specialized service classes to ensure single-responsibility:

1.  **`ExcelParserService`**: Validates file size, uses Pandas to read `.xlsx`, and normalizes data into a standard Python list of dicts.
2.  **`WorkerMapperService`**: Upserts new workers to the DB and maps generic roles to specific BOQ categories based on DB rules.
3.  **`AttendanceRuleEngine`**: Iterates through parsed data and expands records based on rules (P = 1 record, P.5 = 2 records, PP = 2 records).
4.  **`SubmissionTrackerService`**: Handles inserting pending records and later updating them with `SUBMISSION_RESULTS`.

## 7. Google Form Automation Module

1.  **`FormUrlManager`**: Fetches the active Google Form URL.
2.  **`FieldMappingManager`**: Uses Playwright to scrape field labels and types, storing them in `FORM_MAPPINGS`.
3.  **`PlaywrightEngine`**: A context manager class that spins up headless Chromium, injects stealth properties (if necessary), and handles timeouts.
4.  **`SubmissionVerification`**: Explicit logic to wait for the generic "Your response has been recorded" Google Forms success page before marking a `SubmissionResult` as successful.
