from datetime import date, datetime
from sqlalchemy import Date, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyCapacity(Base):
    """
    SQLAlchemy 2.x model representing daily ticket capacity for an event date.
    Each record manages the ticket capacity for a specific date of the
    Online Garba Ticketing System festival.
    """

    __tablename__ = "daily_capacities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_date: Mapped[date] = mapped_column(
        Date, unique=True, index=True, nullable=False
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

