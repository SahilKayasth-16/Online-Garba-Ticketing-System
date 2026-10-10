from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_security_staff
from app.models.user import User
from app.schemas.security import (
    ScanHistoryResponse,
    SecurityStatsResponse,
    VerifyTicketRequest,
    VerifyTicketResponse,
)
from app.services import security_service

router = APIRouter()


@router.post(
    "/verify-ticket",
    response_model=VerifyTicketResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify and redeem an entrance ticket pass via QR token or serial",
)
def verify_ticket(
    payload: VerifyTicketRequest,
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Scans and redeems an entrance ticket for festival entry.

    Security & Business Rules:
    - Only users with role 'security_staff' are authorized.
    - Locks the ticket row in PostgreSQL (SELECT ... FOR UPDATE) to prevent concurrent double-entry.
    - Verifies ticket existence, payment status ('paid'), entry status ('unused'), and event date policy.
    - Atomically updates entry_status='used', records entry timestamp, and logs the scan attempt.
    """
    return security_service.verify_and_redeem_ticket(
        db=db,
        raw_token=payload.ticket_token,
        current_user=current_user,
        gate_event_date=payload.gate_event_date,
    )


@router.get(
    "/scan-history",
    response_model=ScanHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve gate scan audit logs",
)
def get_scan_history(
    event_date: Optional[str] = Query(None, description="Optional date filter (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Fetches real database scan history records including staff member name,
    entry status, scan result, and timestamps.
    """
    return security_service.get_scan_history(
        db=db,
        limit=limit,
        offset=offset,
        event_date=event_date,
    )


@router.get(
    "/stats",
    response_model=SecurityStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get live security checkpoint entry statistics",
)
def get_security_stats(
    event_date: Optional[str] = Query(None, description="Optional date filter (YYYY-MM-DD)"),
    current_user: User = Depends(require_security_staff),
    db: Session = Depends(get_db),
):
    """
    Returns real gate entry statistics aggregated from the scan audit log.
    """
    return security_service.get_security_stats(
        db=db,
        event_date=event_date,
    )

