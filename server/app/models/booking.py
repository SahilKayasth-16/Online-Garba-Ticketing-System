from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.ticket import Ticket
    from app.models.user import User


class Booking(Base):
    """
    SQLAlchemy 2.x model representing a Garba ticket booking.
    """

    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    venue: Mapped[str] = mapped_column(String(255), nullable=False)
    event_date: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    ticket_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    payment_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )

    # Cash collection audit fields
    cash_collected_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    cash_collected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Razorpay Test Mode & Payment QR fields
    razorpay_order_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True
    )
    razorpay_payment_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True
    )
    razorpay_signature: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    razorpay_qr_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True
    )
    payment_qr_payload: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tickets: Mapped[List["Ticket"]] = relationship(
        "Ticket", back_populates="booking", cascade="all, delete-orphan"
    )
    cash_collected_by: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[cash_collected_by_user_id]
    )