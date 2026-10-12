from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Union
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.capacity import DailyCapacity

FESTIVAL_START_DATE = date(2026, 10, 11)
FESTIVAL_END_DATE = date(2026, 10, 20)
FESTIVAL_DATES: List[date] = [
    date(2026, 10, d) for d in range(11, 21)
]
DEFAULT_DAILY_CAPACITY = 10


def parse_event_date(date_val: Union[str, date]) -> date:
    """
    Parses a string or date object into a standard datetime.date object.
    Supports formats:
    - '2026-10-12' (ISO)
    - '12 October 2026' (Long format)
    - '12 Oct 2026' (Short format)
    - '12-10-2026' (Day-Month-Year)
    """
    if isinstance(date_val, date):
        return date_val

    if not isinstance(date_val, str):
        raise ValueError("Event date must be a valid date string.")

    cleaned = date_val.strip()
    if not cleaned:
        raise ValueError("Event date cannot be empty.")

    formats_to_try = [
        "%Y-%m-%d",
        "%d %B %Y",
        "%d %b %Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
    ]

    for fmt in formats_to_try:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue

    raise ValueError(
        f"Unable to parse event date '{date_val}'. Expected format: YYYY-MM-DD (e.g., 2026-10-12)."
    )


def ensure_initial_capacities(db: Session) -> None:
    """
    Ensures all 10 festival dates (11-20 October 2026) exist in PostgreSQL
    with initial capacity of 10 if not already present.
    Does NOT overwrite existing modified capacities.
    """
    existing_dates = set(
        db.scalars(select(DailyCapacity.event_date)).all()
    )

    created_any = False
    for event_d in FESTIVAL_DATES:
        if event_d not in existing_dates:
            new_capacity_row = DailyCapacity(
                event_date=event_d,
                capacity=DEFAULT_DAILY_CAPACITY,
            )
            db.add(new_capacity_row)
            created_any = True

    if created_any:
        db.commit()


def get_sold_ticket_count(db: Session, event_date: date) -> int:
    """
    Calculates confirmed/sold tickets from real database booking records.
    Never returns fabricated or dummy numbers.
    """
    iso_str = event_date.isoformat()
    readable_str = event_date.strftime("%d %B %Y")
    readable_short = event_date.strftime("%d %b %Y")
    day_prefix = f"{event_date.day} Oct%"

    stmt = (
        select(func.coalesce(func.sum(Booking.quantity), 0))
        .where(
            or_(
                Booking.event_date == iso_str,
                Booking.event_date == readable_str,
                Booking.event_date == readable_short,
                Booking.event_date.ilike(day_prefix),
            )
        )
        .where(
            func.lower(Booking.payment_status).in_(
                ["paid", "confirmed", "success", "completed"]
            )
        )
    )

    result = db.scalar(stmt)
    return int(result or 0)


def get_active_booked_ticket_count(db: Session, event_date: date) -> int:
    """
    Calculates all active reserved and confirmed passes (pending + paid)
    to protect against overselling under concurrent requests.
    """
    iso_str = event_date.isoformat()
    readable_str = event_date.strftime("%d %B %Y")
    readable_short = event_date.strftime("%d %b %Y")
    day_prefix = f"{event_date.day} Oct%"

    stmt = (
        select(func.coalesce(func.sum(Booking.quantity), 0))
        .where(
            or_(
                Booking.event_date == iso_str,
                Booking.event_date == readable_str,
                Booking.event_date == readable_short,
                Booking.event_date.ilike(day_prefix),
            )
        )
        .where(
            func.lower(Booking.payment_status).in_(
                ["pending", "paid", "confirmed", "success", "completed"]
            )
        )
    )

    result = db.scalar(stmt)
    return int(result or 0)


def _row_to_dict(capacity_row: DailyCapacity, sold_tickets: int) -> Dict[str, Any]:
    """
    Formats a DailyCapacity ORM row and its sold tickets into a response dict.
    Calculates remaining tickets as: capacity - sold.
    """
    remaining = max(0, capacity_row.capacity - sold_tickets)
    day_number = (capacity_row.event_date - FESTIVAL_START_DATE).days + 1

    return {
        "id": capacity_row.id,
        "event_date": capacity_row.event_date.isoformat(),
        "formatted_date": capacity_row.event_date.strftime("%d %b %Y"),
        "day_number": day_number,
        "capacity": capacity_row.capacity,
        "sold": sold_tickets,
        "remaining": remaining,
        "created_at": capacity_row.created_at,
        "updated_at": capacity_row.updated_at,
    }


def get_all_daily_capacities(db: Session) -> List[Dict[str, Any]]:
    """
    Retrieves daily capacity for all 10 festival dates ordered by date ascending.
    Calculates sold and remaining tickets from live database data.
    """
    ensure_initial_capacities(db)

    stmt = select(DailyCapacity).order_by(DailyCapacity.event_date.asc())
    rows = list(db.scalars(stmt).all())

    result = []
    for row in rows:
        sold = get_sold_ticket_count(db, row.event_date)
        result.append(_row_to_dict(row, sold))

    return result


def get_daily_capacity_by_date(
    db: Session, event_date: date
) -> Optional[Dict[str, Any]]:
    """
    Retrieves daily capacity for a specific event date.
    Returns None if the date does not exist.
    """
    ensure_initial_capacities(db)

    stmt = select(DailyCapacity).where(DailyCapacity.event_date == event_date)
    row = db.scalar(stmt)

    if not row:
        return None

    sold = get_sold_ticket_count(db, row.event_date)
    return _row_to_dict(row, sold)


def update_daily_capacity(
    db: Session,
    event_date: date,
    new_capacity: int,
) -> Dict[str, Any]:
    """
    Updates the daily ticket capacity for a specific festival date.

    Business Rules:
    1. Only allowed for dates within the festival period (11-20 October 2026).
    2. Capacity must be a strictly positive integer (> 0).
    3. Capacity cannot be reduced below the number of confirmed tickets already sold.
    4. Uses row-level lock (with_for_update) inside the transaction for concurrency safety.
    """
    if event_date < FESTIVAL_START_DATE or event_date > FESTIVAL_END_DATE:
        raise ValueError(
            f"Event date {event_date.isoformat()} is outside the festival period "
            f"(11 October 2026 to 20 October 2026)."
        )

    if new_capacity <= 0:
        raise ValueError("Daily capacity must be a positive integer greater than zero.")

    # Concurrency safe row selection
    stmt = (
        select(DailyCapacity)
        .where(DailyCapacity.event_date == event_date)
        .with_for_update()
    )
    capacity_row = db.scalar(stmt)

    if not capacity_row:
        # Create row if not yet present
        capacity_row = DailyCapacity(
            event_date=event_date,
            capacity=new_capacity,
        )
        db.add(capacity_row)
        db.flush()

    # Calculate actual tickets sold from real database records
    sold_tickets = get_sold_ticket_count(db, event_date)

    # Validate that new capacity is not below already sold tickets
    if new_capacity < sold_tickets:
        readable_date = event_date.strftime("%d %B %Y")
        raise ValueError(
            f"Capacity cannot be reduced below the number of confirmed tickets already sold ({sold_tickets}) for {readable_date}."
        )

    capacity_row.capacity = new_capacity
    capacity_row.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(capacity_row)

    return _row_to_dict(capacity_row, sold_tickets)

