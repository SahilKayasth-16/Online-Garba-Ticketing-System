import base64
import io
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import qrcode
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


def generate_qr_data_url(data: str) -> str:
    """
    Generate a base64 PNG data URL for any QR code string payload.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _booking_to_dict(booking: Booking, include_ticket_qrs: bool = True) -> Dict[str, Any]:
    """
    Convert a Booking ORM row into a plain dictionary, including
    ticket items with entrance QR data URLs if the booking is paid.
    """
    tickets_data: List[Dict[str, Any]] = []

    # Individual entrance tickets with entry QRs are only exposed when booking is paid
    if booking.payment_status.lower() in ("paid", "confirmed", "completed"):
        for t in booking.tickets:
            qr_url = generate_qr_data_url(t.ticket_token) if include_ticket_qrs else None
            tickets_data.append({
                "ticket_number": t.ticket_number,
                "ticket_token": t.ticket_token,
                "event_date": t.event_date,
                "status": t.status,
                "entry_status": t.entry_status,
                "qr_code_data_url": qr_url,
            })

    payment_qr_url = None
    if booking.payment_qr_payload:
        payment_qr_url = generate_qr_data_url(booking.payment_qr_payload)

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
        "cash_collected_at": booking.cash_collected_at,
        "razorpay_order_id": booking.razorpay_order_id,
        "razorpay_payment_id": booking.razorpay_payment_id,
        "razorpay_qr_id": booking.razorpay_qr_id,
        "payment_qr_payload": booking.payment_qr_payload,
        "payment_qr_data_url": payment_qr_url,
        "tickets": tickets_data,
        "created_at": booking.created_at,
    }


def issue_tickets_for_booking(db: Session, booking: Booking) -> List[Ticket]:
    """
    Idempotently creates N individual Ticket records for a confirmed/paid booking.
    Each ticket gets a unique ticket_token (OGTS-TKT-...) and serial number.
    """
    existing_tickets = list(
        db.scalars(
            select(Ticket)
            .where(Ticket.booking_id == booking.id)
            .order_by(Ticket.id.asc())
        ).all()
    )
    if existing_tickets:
        return existing_tickets

    created_tickets = []
    parsed_date = capacity_service.parse_event_date(booking.event_date)
    for i in range(1, booking.quantity + 1):
        t_num = f"{booking.booking_id}-{i:02d}"
        t_token = f"OGTS-TKT-{uuid.uuid4().hex.upper()}"
        ticket = Ticket(
            ticket_number=t_num,
            ticket_token=t_token,
            booking_id=booking.id,
            event_date=parsed_date.isoformat(),
            status="valid",
            entry_status="unused",
        )
        db.add(ticket)
        created_tickets.append(ticket)

    db.flush()
    return created_tickets


def confirm_cash_payment(db: Session, booking_id: str, operator_user: Any) -> Dict[str, Any]:
    """
    Confirms cash collection by a counter operator (or super/event admin).
    Transitions booking from 'pending' to 'paid', stamps cash_collected_by_user_id
    and cash_collected_at, and idempotently issues N individual entry tickets with QR codes.
    """
    stmt = (
        select(Booking)
        .where(Booking.booking_id == booking_id)
        .with_for_update()
    )
    booking = db.scalar(stmt)

    if not booking:
        raise BookingError(
            f"Booking with ID '{booking_id}' not found.",
            error_code="BOOKING_NOT_FOUND",
        )

    if booking.payment_method.upper() != "CASH":
        raise BookingError(
            f"Booking {booking_id} has payment method '{booking.payment_method}', not CASH.",
            error_code="INVALID_PAYMENT_METHOD",
        )

    # Idempotent check
    if booking.payment_status.lower() == "paid":
        issue_tickets_for_booking(db, booking)
        db.commit()
        db.refresh(booking)
        return _booking_to_dict(booking, include_ticket_qrs=True)

    # Lock capacity row to verify capacity prior to finalizing payment
    parsed_date = capacity_service.parse_event_date(booking.event_date)
    capacity_stmt = (
        select(DailyCapacity)
        .where(DailyCapacity.event_date == parsed_date)
        .with_for_update()
    )
    capacity_row = db.scalar(capacity_stmt)
    if capacity_row:
        sold = capacity_service.get_sold_ticket_count(db, parsed_date)
        if sold + booking.quantity > capacity_row.capacity:
            raise InsufficientCapacityError(
                f"Cannot collect cash: daily capacity limit reached for {parsed_date.isoformat()}."
            )

    now_utc = datetime.now(timezone.utc)
    booking.payment_status = "paid"
    booking.cash_collected_by_user_id = operator_user.id
    booking.cash_collected_at = now_utc

    issue_tickets_for_booking(db, booking)

    try:
        db.commit()
        db.refresh(booking)
    except Exception:
        db.rollback()
        raise

    return _booking_to_dict(booking, include_ticket_qrs=True)


def get_booking_by_id(db: Session, booking_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a booking by its booking ID.
    Returns None when the booking does not exist.
    """
    stmt = select(Booking).where(Booking.booking_id == booking_id)
    booking = db.scalar(stmt)

    if not booking:
        return None

    return _booking_to_dict(booking, include_ticket_qrs=True)


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
    return [_booking_to_dict(b, include_ticket_qrs=False) for b in bookings]


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
    7. All new bookings start in 'pending' status:
       - Cash payments remain pending until counter staff confirms receipt via /confirm-cash.
       - Online payments remain pending until Razorpay gateway verification.
    8. Tickets with entrance QRs are NOT issued until payment is verified.
    9. Persists booking to PostgreSQL and commits.
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

    # 3. Calculate currently active/sold passes consuming capacity
    booked_count = capacity_service.get_active_booked_ticket_count(db, parsed_date)
    remaining = max(0, capacity_row.capacity - booked_count)

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

    # 6. Pricing calculation (server authoritative)
    ticket_price = DEFAULT_TICKET_PRICE
    total_amount = ticket_price * Decimal(payload.quantity)

    # 7. Payment status handling: ALWAYS pending initially
    method_clean = payload.payment_method.strip().lower()
    payment_status = "pending"

    # 8. Create booking record
    booking_id = f"OGTS-2026-{uuid.uuid4().hex[:8].upper()}"
    venue_name = payload.venue.strip() if payload.venue else DEFAULT_VENUE

    # If online payment requested, generate customer payment QR payload (UPI standard format)
    payment_qr_payload = None
    if method_clean == "online":
        payment_qr_payload = (
            f"upi://pay?pa=garba.tickets@okaxis&pn=Online+Garba+Ticketing+System"
            f"&am={total_amount:.2f}&cu=INR&tr={booking_id}&tn=GarbaPasses+{booking_id}"
        )

    new_booking = Booking(
        booking_id=booking_id,
        venue=venue_name,
        event_date=parsed_date.isoformat(),
        quantity=payload.quantity,
        ticket_price=ticket_price,
        total_amount=total_amount,
        payment_method=method_clean.upper(),
        payment_status=payment_status,
        payment_qr_payload=payment_qr_payload,
    )

    try:
        db.add(new_booking)
        db.commit()
        db.refresh(new_booking)
    except Exception:
        db.rollback()
        raise

    return _booking_to_dict(new_booking, include_ticket_qrs=True)