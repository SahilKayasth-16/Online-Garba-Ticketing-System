from fastapi import APIRouter

router = APIRouter()


@router.get("/health", status_code=200)
def health_check():
    """
    Health check endpoint to verify backend operational status.
    """
    return {
        "success": True,
        "message": "Online Garba Ticketing API is running.",
    }
