from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.ticket import Ticket
    from app.models.user import User


class ScanLog(Base):
    """
    SQLAlchemy 2.x model representing gate QR ticket scan attempts and entry records.
    """

    __tablename__ = "scan_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ticket_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    scanned_identifier: Mapped[str] = mapped_column(String(128), nullable=False)
    event_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    scan_result: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    scanned_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    ticket: Mapped[Optional["Ticket"]] = relationship("Ticket")
    scanned_by: Mapped[Optional["User"]] = relationship("User")

