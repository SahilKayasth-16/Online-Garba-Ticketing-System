import json
import urllib.parse
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.booking import Booking
from app.models.scan_log import ScanLog
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.security import (
    ScanHistoryResponse,
    ScanLogItem,
    SecurityStatsResponse,
    TicketVerificationData,
    VerifyTicketResponse,
)
from app.services import capacity_service

FESTIVAL_START = date(2026, 10, 11)
FESTIVAL_END = date(2026, 10, 20)


def extract_clean_token(raw_input: str) -> str:
    """
    Sanitize and extract the ticket token or identifier from a raw scanned payload.
    Supports:
    - Plain token strings (e.g. 'OGTS-TKT-...') or ticket numbers (e.g. 'OGTS-2026-...')
    - JSON payloads (e.g. '{"ticket_token": "..."}' or '{"token": "..."}')
    - URLs with query params (e.g. 'https://example.com/verify?token=...')
    """
    text = (raw_input or "").strip()
    if not text:
        return ""

    # Check if raw input is a JSON string
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                for key in ("ticket_token", "token", "ticket_number", "serial_number", "id", "t"):
                    if key in data and str(data[key]).strip():
                        return str(data[key]).strip()
        except Exception:
            pass

    # Check if raw input is a URL
    if text.startswith("http://") or text.startswith("https://"):
        try:
            parsed = urllib.parse.urlparse(text)
            qs = urllib.parse.parse_qs(parsed.query)
            for param in ("ticket_token", "token", "t", "serial", "ticket_number"):
                if param in qs and qs[param]:
                    return qs[param][0].strip()
        except Exception:
            pass

    return text


def verify_and_redeem_ticket(
    db: Session,
    raw_token: str,
    current_user: User,
    gate_event_date: Optional[str] = None,
) -> VerifyTicketResponse:
    """
    Authoritative ticket verification and entry redemption.

    Enforces:
    1. Parsing and validation of token.
    2. Concurrency-safe PostgreSQL row-level locking (with_for_update()).
    3. Verification of ticket existence, revocation, payment status, already-used state, and date policy.
    4. Atomic entry redemption (entry_status='used', entry_timestamp=now).
    5. Persistent scan logging with security staff identity.
    """
    clean_token = extract_clean_token(raw_token)

    # 1. Reject malformed / empty input
    if not clean_token:
        # Audit rejected empty scan
        log = ScanLog(
            scanned_identifier="EMPTY",
            scan_result="invalid",
            message="Malformed or empty ticket payload.",
            scanned_by_user_id=current_user.id,
        )
        db.add(log)
        db.commit()
        return VerifyTicketResponse(
            success=False,
            status="invalid",
            message="Malformed or empty ticket payload.",
            error_code="MALFORMED_PAYLOAD",
            ticket=None,
        )

    # 2. Acquire row-level lock on Ticket record
    stmt = (
        select(Ticket)
        .options(joinedload(Ticket.booking))
        .where(
            or_(
                Ticket.ticket_token == clean_token,
                Ticket.ticket_number == clean_token,
            )
        )
        .with_for_update()
    )
    ticket = db.scalar(stmt)

    # 3. Handle Ticket Not Found
    if not ticket:
        log = ScanLog(
            scanned_identifier=clean_token[:128],
            scan_result="invalid",
            message="Ticket not found or invalid QR code.",
            scanned_by_user_id=current_user.id,
        )
        db.add(log)
        db.commit()
        return VerifyTicketResponse(
            success=False,
            status="invalid",
            message="Ticket not found or invalid QR code.",
            error_code="TICKET_NOT_FOUND",
            ticket=None,
        )

    booking = ticket.booking

    # 4. Check Revoked / Cancelled status
    if ticket.status in ("cancelled", "revoked"):
        log = ScanLog(
            ticket_id=ticket.id,
            ticket_number=ticket.ticket_number,
            scanned_identifier=clean_token[:128],
            event_date=ticket.event_date,
            scan_result="revoked",
            message=f"Ticket has been {ticket.status}. Entry not allowed.",
            scanned_by_user_id=current_user.id,
        )
        db.add(log)
        db.commit()
        return VerifyTicketResponse(
            success=False,
            status="revoked",
            message=f"Ticket has been {ticket.status}. Entry not allowed.",
            error_code="TICKET_REVOKED",
            ticket=TicketVerificationData(
                serial_number=ticket.ticket_number,
                event_date=ticket.event_date,
                payment_status=booking.payment_status if booking else "unknown",
                entry_status=ticket.entry_status,
                entry_timestamp=ticket.entry_timestamp.isoformat() if ticket.entry_timestamp else None,
                venue=booking.venue if booking else "Bardoli Ground",
            ),
        )

    # 5. Check Payment Status
    if booking and booking.payment_status != "paid":
        log = ScanLog(
            ticket_id=ticket.id,
            ticket_number=ticket.ticket_number,
            scanned_identifier=clean_token[:128],
            event_date=ticket.event_date,
            scan_result="unpaid",
            message=f"Ticket payment is {booking.payment_status}. Entry not allowed.",
            scanned_by_user_id=current_user.id,
        )
        db.add(log)
        db.commit()
        return VerifyTicketResponse(
            success=False,
            status="unpaid",
            message=f"Ticket payment is {booking.payment_status}. Entry not allowed.",
            error_code="PAYMENT_NOT_PAID",
            ticket=TicketVerificationData(
                serial_number=ticket.ticket_number,
                event_date=ticket.event_date,
                payment_status=booking.payment_status,
                entry_status=ticket.entry_status,
                entry_timestamp=None,
                venue=booking.venue,
            ),
        )

    # 6. Check Already Used
    if ticket.entry_status == "used":
        prev_time_str = (
            ticket.entry_timestamp.isoformat()
            if ticket.entry_timestamp
            else "previously recorded"
        )
        log = ScanLog(
            ticket_id=ticket.id,
            ticket_number=ticket.ticket_number,
            scanned_identifier=clean_token[:128],
            event_date=ticket.event_date,
            scan_result="already_used",
            message=f"This ticket has already been used on {prev_time_str}.",
            scanned_by_user_id=current_user.id,
        )
        db.add(log)
        db.commit()
        return VerifyTicketResponse(
            success=False,
            status="already_used",
            message="This ticket has already been used.",
            error_code="TICKET_ALREADY_USED",
            ticket=TicketVerificationData(
                serial_number=ticket.ticket_number,
                event_date=ticket.event_date,
                payment_status=booking.payment_status if booking else "paid",
                entry_status="used",
                entry_timestamp=ticket.entry_timestamp.isoformat() if ticket.entry_timestamp else None,
                venue=booking.venue if booking else "Bardoli Ground",
            ),
        )

    # 7. Check Event Date Policy
    active_date: Optional[str] = None
    if gate_event_date and gate_event_date.strip():
        active_date = gate_event_date.strip()
    else:
        # Check current date in Asia/Kolkata timezone
        kolkata_tz = ZoneInfo("Asia/Kolkata")
        today_ist = datetime.now(kolkata_tz).date()
        if FESTIVAL_START <= today_ist <= FESTIVAL_END:
            active_date = today_ist.isoformat()

    if active_date:
        try:
            parsed_ticket = capacity_service.parse_event_date(ticket.event_date).isoformat()
            parsed_active = capacity_service.parse_event_date(active_date).isoformat()
        except ValueError:
            parsed_ticket = ticket.event_date
            parsed_active = active_date

        if parsed_ticket != parsed_active:
            log = ScanLog(
                ticket_id=ticket.id,
                ticket_number=ticket.ticket_number,
                scanned_identifier=clean_token[:128],
                event_date=ticket.event_date,
                scan_result="wrong_date",
                message=f"This ticket is valid for {ticket.event_date}, not for gate date {active_date}.",
                scanned_by_user_id=current_user.id,
            )
            db.add(log)
            db.commit()
            return VerifyTicketResponse(
                success=False,
                status="wrong_date",
                message=f"This ticket is valid for {ticket.event_date}, not for gate date {active_date}. Entry not allowed.",
                error_code="WRONG_EVENT_DATE",
                ticket=TicketVerificationData(
                    serial_number=ticket.ticket_number,
                    event_date=ticket.event_date,
                    payment_status=booking.payment_status if booking else "paid",
                    entry_status=ticket.entry_status,
                    entry_timestamp=None,
                    venue=booking.venue if booking else "Bardoli Ground",
                ),
            )
    else:
        # Fallback when testing outside festival period without explicit gate date:
        # Ensure the ticket event date is a recognized festival date
        try:
            parsed_ticket_d = capacity_service.parse_event_date(ticket.event_date)
            if parsed_ticket_d < FESTIVAL_START or parsed_ticket_d > FESTIVAL_END:
                log = ScanLog(
                    ticket_id=ticket.id,
                    ticket_number=ticket.ticket_number,
                    scanned_identifier=clean_token[:128],
                    event_date=ticket.event_date,
                    scan_result="wrong_date",
                    message=f"Ticket date {ticket.event_date} is outside the festival span.",
                    scanned_by_user_id=current_user.id,
                )
                db.add(log)
                db.commit()
                return VerifyTicketResponse(
                    success=False,
                    status="wrong_date",
                    message=f"Ticket date {ticket.event_date} is outside festival period. Entry not allowed.",
                    error_code="WRONG_EVENT_DATE",
                    ticket=None,
                )
        except ValueError:
            pass

    # 8. VALID TICKET -> Redeem Entry Atomically
    now_utc = datetime.now(timezone.utc)
    ticket.entry_status = "used"
    ticket.entry_timestamp = now_utc
    ticket.verified_by_user_id = current_user.id

    log = ScanLog(
        ticket_id=ticket.id,
        ticket_number=ticket.ticket_number,
        scanned_identifier=clean_token[:128],
        event_date=ticket.event_date,
        scan_result="valid",
        message="Ticket verified. Entry approved.",
        scanned_by_user_id=current_user.id,
        scanned_at=now_utc,
    )
    db.add(log)

    try:
        db.commit()
        db.refresh(ticket)
    except Exception:
        db.rollback()
        raise

    return VerifyTicketResponse(
        success=True,
        status="valid",
        message="Ticket verified. Entry approved.",
        ticket=TicketVerificationData(
            serial_number=ticket.ticket_number,
            event_date=ticket.event_date,
            payment_status=booking.payment_status if booking else "paid",
            entry_status="used",
            entry_timestamp=now_utc.isoformat(),
            venue=booking.venue if booking else "Bardoli Ground",
        ),
    )


def get_scan_history(
    db: Session,
    limit: int = 50,
    offset: int = 0,
    event_date: Optional[str] = None,
) -> ScanHistoryResponse:
    """
    Retrieve real database scan audit records with security staff identities.
    """
    stmt = (
        select(ScanLog)
        .options(joinedload(ScanLog.scanned_by))
        .order_by(ScanLog.scanned_at.desc())
    )

    count_stmt = select(func.count(ScanLog.id))

    if event_date and event_date.strip():
        stmt = stmt.where(ScanLog.event_date == event_date.strip())
        count_stmt = count_stmt.where(ScanLog.event_date == event_date.strip())

    total = db.scalar(count_stmt) or 0
    records = list(db.scalars(stmt.offset(offset).limit(limit)).all())

    items: List[ScanLogItem] = []
    for r in records:
        items.append(
            ScanLogItem(
                id=r.id,
                ticket_number=r.ticket_number,
                event_date=r.event_date,
                scan_result=r.scan_result,
                message=r.message,
                scanned_at=r.scanned_at.isoformat(),
                scanned_by=r.scanned_by.name if r.scanned_by else "Security Staff",
                is_successful_entry=r.scan_result == "valid",
            )
        )

    return ScanHistoryResponse(
        success=True,
        total=total,
        items=items,
    )


def get_security_stats(
    db: Session,
    event_date: Optional[str] = None,
) -> SecurityStatsResponse:
    """
    Calculate live verification statistics from real scan logs.
    """
    kolkata_tz = ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(kolkata_tz).date()

    active_date = event_date.strip() if event_date and event_date.strip() else (
        now_ist.isoformat() if FESTIVAL_START <= now_ist <= FESTIVAL_END else "2026-10-11"
    )

    # Base query optionally filtered by active date
    base_stmt = select(ScanLog)
    if event_date and event_date.strip():
        base_stmt = base_stmt.where(ScanLog.event_date == active_date)

    total_scans = db.scalar(select(func.count(ScanLog.id))) or 0
    valid_entries = db.scalar(
        select(func.count(ScanLog.id)).where(ScanLog.scan_result == "valid")
    ) or 0
    already_used = db.scalar(
        select(func.count(ScanLog.id)).where(ScanLog.scan_result == "already_used")
    ) or 0
    rejected_scans = db.scalar(
        select(func.count(ScanLog.id)).where(ScanLog.scan_result != "valid")
    ) or 0

    return SecurityStatsResponse(
        success=True,
        total_scans=total_scans,
        successful_entries=valid_entries,
        rejected_scans=rejected_scans,
        already_used_scans=already_used,
        active_event_date=active_date,
    )

