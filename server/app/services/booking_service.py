import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.capacity import DailyCapacity
from app.models.ticket import Ticket
from app.schemas.booking import CreateBookingRequest
from app.services import capacity_service

DEFAULT_TICKET_PRICE = Decimal("200.00")
DEFAULT_VENUE = "Bardoli Ground"


class BookingError(Exception):
    """Base class for booking business errors."""
    def __init__(self, message: str, error_code: str = "BOOKING_ERROR"):
        super().__init__(message)
        self.message = message
        self.error_code = error_code


class SoldOutError(BookingError):
    """Raised when an event date has zero remaining capacity."""
    def __init__(self, message: str = "Today's ticket are sold out. You may book advance for another day. Sorry for inconveniency"):
        super().__init__(message=message, error_code="EVENT_DATE_SOLD_OUT")


class InsufficientCapacityError(BookingError):
    """Raised when the requested quantity exceeds available capacity."""
    def __init__(self, message: str):
        super().__init__(message=message, error_code="INSUFFICIENT_CAPACITY")


def _booking_to_dict(booking: Booking) -> Dict[str, Any]:
    """
    Convert a Booking ORM row into a plain dictionary.
    """
    return {
        "booking_id": booking.booking_id,
        "venue": booking.venue,
        "event_date": booking.event_date,
        "quantity": booking.quantity,
        "ticket_price": float(booking.ticket_price)
        if isinstance(booking.ticket_price, Decimal)
        else booking.ticket_price,
        "total_amount": float(booking.total_amount)
        if isinstance(booking.total_amount, Decimal)
        else booking.total_amount,
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
        "created_at": booking.created_at,
    }


def get_booking_by_id(db: Session, booking_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a booking by its booking ID.
    Returns None when the booking does not exist.
    """
    stmt = select(Booking).where(Booking.booking_id == booking_id)
    booking = db.scalar(stmt)

    if not booking:
        return None

    return _booking_to_dict(booking)


def get_all_bookings(
    db: Session,
    event_date: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Retrieve recent bookings from the database.
    Optionally filter by event date (supports ISO or common formats).
    """
    stmt = select(Booking)

    if event_date and event_date.strip():
        try:
            parsed = capacity_service.parse_event_date(event_date)
            iso_str = parsed.isoformat()
            readable_str = parsed.strftime("%d %B %Y")
            readable_short = parsed.strftime("%d %b %Y")
            day_prefix = f"{parsed.day} Oct%"

            stmt = stmt.where(
                or_(
                    Booking.event_date == iso_str,
                    Booking.event_date == readable_str,
                    Booking.event_date == readable_short,
                    Booking.event_date.ilike(day_prefix),
                )
            )
        except ValueError:
            stmt = stmt.where(Booking.event_date == event_date.strip())

    stmt = stmt.order_by(Booking.created_at.desc()).limit(limit)
    bookings = list(db.scalars(stmt).all())
    return [_booking_to_dict(b) for b in bookings]


def create_booking(db: Session, payload: CreateBookingRequest) -> Dict[str, Any]:
    """
    Create a new booking with database-level concurrency protection.

    Rules enforced:
    1. Parse and validate festival date (11-20 October 2026).
    2. Concurrency-safe capacity check: Locks the DailyCapacity row with with_for_update().
    3. Calculates currently sold tickets from database.
    4. If remaining == 0, raises SoldOutError with code 'EVENT_DATE_SOLD_OUT'.
    5. If requested quantity > remaining, raises InsufficientCapacityError.
    6. Authoritative ticket price is 200.00.
    7. For cash payments, marks payment_status='paid'.
       For online payments without gateway verification, marks payment_status='pending'.
    8. Persists booking to PostgreSQL and commits.
    """
    # 1. Validate date
    parsed_date = capacity_service.parse_event_date(payload.event_date)
    if (
        parsed_date < capacity_service.FESTIVAL_START_DATE
        or parsed_date > capacity_service.FESTIVAL_END_DATE
    ):
        raise BookingError(
            f"Event date {payload.event_date} is outside the festival period "
            f"(11 October 2026 to 20 October 2026).",
            error_code="INVALID_EVENT_DATE",
        )

    # 2. Acquire row lock for the specific event date
    capacity_stmt = (
        select(DailyCapacity)
        .where(DailyCapacity.event_date == parsed_date)
        .with_for_update()
    )
    capacity_row = db.scalar(capacity_stmt)

    if not capacity_row:
        # Initialize if row doesn't exist
        capacity_row = DailyCapacity(
            event_date=parsed_date,
            capacity=capacity_service.DEFAULT_DAILY_CAPACITY,
        )
        db.add(capacity_row)
        db.flush()

    # 3. Calculate currently confirmed/sold tickets consuming capacity
    sold_count = capacity_service.get_sold_ticket_count(db, parsed_date)
    remaining = max(0, capacity_row.capacity - sold_count)

    # 4. Check for sold-out
    if remaining <= 0:
        raise SoldOutError(
            "Today's ticket are sold out. You may book advance for another day. Sorry for inconveniency"
        )

    # 5. Check for insufficient capacity
    if payload.quantity > remaining:
        formatted_date = parsed_date.strftime("%d %B %Y")
        raise InsufficientCapacityError(
            f"Only {remaining} pass{'es' if remaining != 1 else ''} available for {formatted_date}. "
            f"Cannot reserve {payload.quantity} passes."
        )

    # 6. Pricing calculation
    ticket_price = DEFAULT_TICKET_PRICE
    total_amount = ticket_price * Decimal(payload.quantity)

    # 7. Payment status handling
    method_clean = payload.payment_method.strip().lower()
    if method_clean == "cash":
        payment_status = "paid"
    else:
        # Online payment without payment gateway verification is pending
        payment_status = "pending"

    # 8. Create booking record
    booking_id = f"OGTS-2026-{uuid.uuid4().hex[:8].upper()}"
    venue_name = payload.venue.strip() if payload.venue else DEFAULT_VENUE

    new_booking = Booking(
        booking_id=booking_id,
        venue=venue_name,
        event_date=parsed_date.isoformat(),
        quantity=payload.quantity,
        ticket_price=ticket_price,
        total_amount=total_amount,
        payment_method=method_clean.upper(),
        payment_status=payment_status,
    )

    try:
        db.add(new_booking)
        db.flush()

        # Create individual tickets with unique tokens and serial numbers
        for i in range(1, payload.quantity + 1):
            t_num = f"{booking_id}-{i:02d}"
            t_token = f"OGTS-TKT-{uuid.uuid4().hex.upper()}"
            ticket = Ticket(
                ticket_number=t_num,
                ticket_token=t_token,
                booking_id=new_booking.id,
                event_date=parsed_date.isoformat(),
                status="valid",
                entry_status="unused",
            )
            db.add(ticket)

        db.commit()
        db.refresh(new_booking)
    except Exception:
        db.rollback()
        raise

    return _booking_to_dict(new_booking)