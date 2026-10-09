from datetime import datetime
from decimal import Decimal
from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Booking(Base):
    """
    SQLAlchemy 2.x model representing a demo Garba ticket booking.
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
        String(50), nullable=False, default="paid"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )