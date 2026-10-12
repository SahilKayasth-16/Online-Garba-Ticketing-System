from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class CreateBookingRequest(BaseModel):
    """
    Schema for creating a ticket booking.
    """

    event_date: str = Field(..., description="Target event date (e.g. 2026-10-12 or 12 October 2026)")
    quantity: int = Field(..., ge=1, le=10, description="Number of tickets to book (1-10)")
    payment_method: str = Field(..., description="Payment method: 'cash' or 'online'")
    venue: Optional[str] = Field(default="Bardoli Ground", description="Venue name")

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in ("cash", "online"):
            raise ValueError("Payment method must be either 'cash' or 'online'.")
        return cleaned

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v: int) -> int:
        if v < 1 or v > 10:
            raise ValueError("Ticket quantity must be between 1 and 10 passes.")
        return v


class TicketItem(BaseModel):
    """
    Schema for an individual entrance pass within a booking.
    """
    ticket_number: str
    ticket_token: str
    event_date: str
    status: str
    entry_status: str
    qr_code_data_url: Optional[str] = None


class BookingData(BaseModel):
    booking_id: str
    venue: str
    event_date: str
    quantity: int
    ticket_price: float
    total_amount: float
    payment_method: str
    payment_status: str
    cash_collected_at: Optional[datetime] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_qr_id: Optional[str] = None
    payment_qr_payload: Optional[str] = None
    payment_qr_data_url: Optional[str] = None
    tickets: List[TicketItem] = []
    created_at: Optional[datetime] = None


class BookingResponse(BaseModel):
    success: bool = True
    message: str = "Booking processed successfully."
    data: BookingData


class BookingListResponse(BaseModel):
    success: bool = True
    message: str = "Bookings retrieved successfully."
    data: List[BookingData]


class ConfirmCashPaymentResponse(BaseModel):
    success: bool
    status: str
    message: str
    data: BookingData


class CreateRazorpayOrderRequest(BaseModel):
    booking_id: str


class RazorpayOrderResponse(BaseModel):
    success: bool
    configured: bool
    booking_id: str
    amount_in_paise: int
    amount_in_rupees: float
    currency: str = "INR"
    razorpay_order_id: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    message: str


class VerifyPaymentRequest(BaseModel):
    booking_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentVerificationResponse(BaseModel):
    success: bool
    status: str
    message: str
    data: Optional[BookingData] = None


class CreatePaymentQrResponse(BaseModel):
    success: bool
    configured: bool
    booking_id: str
    amount_in_paise: int
    amount_in_rupees: float
    razorpay_qr_id: Optional[str] = None
    qr_image_url: Optional[str] = None
    qr_data_url: Optional[str] = None
    message: str