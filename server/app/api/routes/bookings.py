from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_counter_staff
from app.models.user import User
from app.schemas.booking import (
    BookingListResponse,
    BookingResponse,
    ConfirmCashPaymentResponse,
    CreateBookingRequest,
)
from app.services import booking_service
from app.services.booking_service import (
    BookingError,
    InsufficientCapacityError,
    SoldOutError,
)
from app.utils.pdf_generator import generate_ticket_pdf

router = APIRouter()


@router.get(
    "",
    response_model=BookingListResponse,
    status_code=status.HTTP_200_OK,
    summary="List recent bookings, optionally filtered by event date",
)
@router.get(
    "/",
    response_model=BookingListResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def list_bookings(
    event_date: Optional[str] = Query(None, description="Optional event date filter (YYYY-MM-DD or readable)"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Retrieve real database bookings.
    Supports filtering by event date for the Counter Operator dashboard and reports.
    """
    bookings = booking_service.get_all_bookings(
        db=db,
        event_date=event_date,
        limit=limit,
    )
    return {
        "success": True,
        "message": "Bookings retrieved successfully.",
        "data": bookings,
    }


@router.post(
    "",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new ticket booking with real-time capacity validation",
)
@router.post(
    "/",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_booking(
    payload: CreateBookingRequest,
    db: Session = Depends(get_db),
):
    """
    Creates a ticket booking for a specified festival date.
    Performs real-time capacity validation with database row locking.

    Error cases:
    - If date is sold out: Returns 400 with error_code 'EVENT_DATE_SOLD_OUT'.
    - If requested passes exceed remaining: Returns 400 with error_code 'INSUFFICIENT_CAPACITY'.
    - If date is outside festival: Returns 400 with error_code 'INVALID_EVENT_DATE'.
    """
    try:
        booking = booking_service.create_booking(db=db, payload=payload)
        return {
            "success": True,
            "message": "Ticket booking created successfully.",
            "data": booking,
        }
    except SoldOutError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error_code": e.error_code,
                "message": e.message,
                "detail": e.message,
            },
        )
    except InsufficientCapacityError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error_code": e.error_code,
                "message": e.message,
                "detail": e.message,
            },
        )
    except BookingError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error_code": e.error_code,
                "message": e.message,
                "detail": e.message,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db)):
    """
    Retrieve a persisted booking by booking ID.
    """
    booking = booking_service.get_booking_by_id(
        db=db,
        booking_id=booking_id,
    )

    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking with ID {booking_id} not found.",
        )

    return {
        "success": True,
        "message": "Booking retrieved successfully.",
        "data": booking,
    }


@router.post(
    "/{booking_id}/confirm-cash",
    response_model=ConfirmCashPaymentResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm cash collection by counter staff and issue entrance passes",
)
def confirm_cash_payment(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_counter_staff),
):
    """
    Counter operator, super admin, or event admin confirms physical cash payment.
    - Transitions payment_status to 'paid'.
    - Stamps confirming operator user ID and timestamp.
    - Idempotently creates N individual Ticket records with entry QR codes.
    - Returns updated booking data with ticket passes.
    """
    try:
        updated_booking = booking_service.confirm_cash_payment(
            db=db,
            booking_id=booking_id,
            operator_user=current_user,
        )
        return {
            "success": True,
            "status": "paid",
            "message": "payment received",
            "data": updated_booking,
        }
    except InsufficientCapacityError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error_code": e.error_code,
                "message": e.message,
                "detail": e.message,
            },
        )
    except BookingError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error_code": e.error_code,
                "message": e.message,
                "detail": e.message,
            },
        )


@router.get("/{booking_id}/ticket.pdf")
def download_ticket_pdf(
    booking_id: str,
    db: Session = Depends(get_db),
):
    """
    Generate and download a PDF ticket for an existing booking.
    """
    booking = booking_service.get_booking_by_id(
        db=db,
        booking_id=booking_id,
    )

    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking with ID {booking_id} not found.",
        )

    try:
        pdf_bytes = generate_ticket_pdf(booking)
        filename = f"ticket-{booking_id}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate ticket PDF.",
        )