from fastapi import APIRouter
from app.api.routes.auth import router as auth_router
from app.api.routes.bookings import router as bookings_router
from app.api.routes.capacities import router as capacities_router
from app.api.routes.events import router as events_router
from app.api.routes.health import router as health_router
from app.api.routes.security import router as security_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["Health"])
api_router.include_router(events_router, prefix="/events", tags=["Events"])
api_router.include_router(bookings_router, prefix="/bookings", tags=["Bookings"])
api_router.include_router(capacities_router, prefix="/capacities", tags=["Capacities"])
api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])
api_router.include_router(security_router, prefix="/security", tags=["Security"])

__all__ = ["api_router"]


