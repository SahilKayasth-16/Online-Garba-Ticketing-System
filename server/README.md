# Online Garba Ticketing System — Backend API

FastAPI backend foundation integrated with PostgreSQL 18.3 (`swarnim_garba`), SQLAlchemy 2.x, and Alembic migrations.

## Tech Stack
- **Framework:** FastAPI
- **ASGI Server:** Uvicorn
- **ORM:** SQLAlchemy 2.x
- **Database Driver:** Psycopg 3
- **Database:** PostgreSQL 18.3
- **Migrations:** Alembic
- **Settings:** Pydantic Settings

## Local Development Setup

1. Copy `.env.example` to `.env` and fill in your database credentials:
   ```powershell
   cp .env.example .env
   ```

2. Start the FastAPI server:
   ```powershell
   uvicorn app.main:app --reload --port 8000
   ```

## Local Endpoints
- **Backend Root:** `http://127.0.0.1:8000`
- **Health API:** `http://127.0.0.1:8000/api/health`
- **Swagger Documentation:** `http://127.0.0.1:8000/docs`
- **ReDoc Documentation:** `http://127.0.0.1:8000/redoc`
