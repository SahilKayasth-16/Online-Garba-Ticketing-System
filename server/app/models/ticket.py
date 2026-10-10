from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.event import Event


class TicketType(Base):
    """
    SQLAlchemy 2.x model representing a category of tickets for an event.
    """

    __tablename__ = "ticket_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    available_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    event: Mapped["Event"] = relationship("Event", back_populates="ticket_types")


if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.user import User


class Ticket(Base):
    """
    SQLAlchemy 2.x model representing an individual entrance ticket / pass.
    Each booking with quantity N has N individual ticket records with unique serials and verification tokens.
    """

    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_number: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    ticket_token: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    booking_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_date: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="valid"
    )  # 'valid', 'cancelled', 'revoked'
    entry_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unused"
    )  # 'unused', 'used'
    entry_timestamp: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    booking: Mapped["Booking"] = relationship("Booking", back_populates="tickets")
    verified_by: Mapped[Optional["User"]] = relationship("User")

