import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import api_router
from app.core.config import settings
from app.db.database import check_db_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Performs startup database connectivity checks.
    """
    logger.info("Initializing %s...", settings.APP_NAME)
    is_connected = check_db_connection()
    if is_connected:
        logger.info("Database connectivity check succeeded.")
    else:
        logger.warning("Database connectivity check failed during application startup.")
    yield
    logger.info("Shutting down %s...", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    description="Backend API for Online Group Online Garba Ticketing System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Configuration
origins = [settings.FRONTEND_URL] if settings.FRONTEND_URL else ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routes
app.include_router(api_router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler to ensure internal server errors return a clean JSON response
    without exposing credentials, connection strings, or internal tracebacks.
    """
    logger.error("Unhandled exception occurred while processing request: %s", request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "An internal server error occurred.",
        },
    )
