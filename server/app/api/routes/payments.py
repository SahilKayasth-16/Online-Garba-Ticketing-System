from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.booking import (
    CreatePaymentQrResponse,
    CreateRazorpayOrderRequest,
    PaymentVerificationResponse,
    RazorpayOrderResponse,
    VerifyPaymentRequest,
)
from app.services import payment_service
from app.services.booking_service import BookingError

router = APIRouter()


@router.post(
    "/create-order",
    response_model=RazorpayOrderResponse,
    status_code=status.HTTP_200_OK,
    summary="Create a server-authoritative Razorpay order with exact integer paise amount",
)
def create_order(
    payload: CreateRazorpayOrderRequest,
    db: Session = Depends(get_db),
):
    """
    Prepares a Razorpay order for an existing booking.
    Calculates exact integer paise (e.g. ₹600 = 60000 paise).
    If test credentials are configured, calls Razorpay API;
    otherwise informs client of configuration readiness.
    """
    try:
        return payment_service.create_razorpay_order(
            db=db,
            booking_id=payload.booking_id,
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


@router.post(
    "/create-qr",
    response_model=CreatePaymentQrResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate QR System 1: Customer Payment QR for exact booking amount",
)
def create_payment_qr(
    payload: CreateRazorpayOrderRequest,
    db: Session = Depends(get_db),
):
    """
    Generates a dedicated Customer Payment QR code.
    This QR is strictly for paying the booking total (exact paise calculation).
    Scanning this QR will never grant gate admission.
    """
    try:
        return payment_service.create_payment_qr(
            db=db,
            booking_id=payload.booking_id,
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


@router.post(
    "/verify",
    response_model=PaymentVerificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify payment signature and issue entrance tickets",
)
def verify_payment(
    payload: VerifyPaymentRequest,
    db: Session = Depends(get_db),
):
    """
    Verifies Razorpay HMAC-SHA256 signature.
    On successful verification:
    - Sets payment_status = 'paid'
    - Issues N individual entrance tickets with QR System 2 entry QRs
    - Returns confirmed booking data
    """
    try:
        return payment_service.verify_razorpay_payment(
            db=db,
            payload=payload,
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

