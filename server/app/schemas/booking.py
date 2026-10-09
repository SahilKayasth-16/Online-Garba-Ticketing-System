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


class BookingData(BaseModel):
    booking_id: str
    venue: str
    event_date: str
    quantity: int
    ticket_price: float
    total_amount: float
    payment_method: str
    payment_status: str
    created_at: Optional[datetime] = None


class BookingResponse(BaseModel):
    success: bool = True
    message: str = "Booking processed successfully."
    data: BookingData


class BookingListResponse(BaseModel):
    success: bool = True
    message: str = "Bookings retrieved successfully."
    data: List[BookingData]