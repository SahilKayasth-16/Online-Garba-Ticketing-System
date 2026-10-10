import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.main import app
from app.models.booking import Booking
from app.models.scan_log import ScanLog
from app.models.ticket import Ticket
from app.models.user import User

client = TestClient(app)


def _get_token_for_role(role: str) -> str:
    db: Session = SessionLocal()
    user = db.scalar(select(User).where(User.role == role))
    if not user:
        # Create a transient user for test if none exists
        user = User(
            name=f"Test {role.title()}",
            contact_number=f"+9199{uuid.uuid4().hex[:8]}",
            email=f"test_{role}_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="test_hash",
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    })
    db.close()
    return token


def _create_test_ticket(
    event_date: str = "2026-10-15",
    payment_status: str = "paid",
    ticket_status: str = "valid",
    entry_status: str = "unused",
):
    db: Session = SessionLocal()
    booking_id = f"TEST-BK-{uuid.uuid4().hex[:8].upper()}"
    booking = Booking(
        booking_id=booking_id,
        venue="Bardoli Ground",
        event_date=event_date,
        quantity=1,
        ticket_price=Decimal("200.00"),
        total_amount=Decimal("200.00"),
        payment_method="CASH",
        payment_status=payment_status,
    )
    db.add(booking)
    db.flush()

    ticket_number = f"{booking_id}-01"
    ticket_token = f"OGTS-TKT-{uuid.uuid4().hex.upper()}"
    ticket = Ticket(
        ticket_number=ticket_number,
        ticket_token=ticket_token,
        booking_id=booking.id,
        event_date=event_date,
        status=ticket_status,
        entry_status=entry_status,
        entry_timestamp=datetime.now(timezone.utc) if entry_status == "used" else None,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    db.refresh(booking)

    t_id = ticket.id
    b_id = booking.id
    db.close()
    return ticket_token, ticket_number, t_id, b_id


def test_valid_ticket_is_accepted_and_entry_recorded():
    token = _get_token_for_role("security_staff")
    ticket_token, ticket_number, t_id, b_id = _create_test_ticket(
        event_date="2026-10-15",
        payment_status="paid",
    )

    try:
        response = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "ticket_token": ticket_token,
                "gate_event_date": "2026-10-15",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "valid"
        assert "Entry approved" in data["message"]
        assert data["ticket"]["serial_number"] == ticket_number
        assert data["ticket"]["entry_status"] == "used"
        assert data["ticket"]["entry_timestamp"] is not None

        # Verify database record updated
        db: Session = SessionLocal()
        t_db = db.get(Ticket, t_id)
        assert t_db.entry_status == "used"
        assert t_db.entry_timestamp is not None
        db.close()
    finally:
        db = SessionLocal()
        db.execute(delete(ScanLog).where(ScanLog.ticket_id == t_id))
        db.execute(delete(Ticket).where(Ticket.id == t_id))
        db.execute(delete(Booking).where(Booking.id == b_id))
        db.commit()
        db.close()


def test_unknown_ticket_is_rejected():
    token = _get_token_for_role("security_staff")
    response = client.post(
        "/api/security/verify-ticket",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "ticket_token": "NON-EXISTENT-TOKEN-999999",
            "gate_event_date": "2026-10-15",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["status"] == "invalid"
    assert data["error_code"] == "TICKET_NOT_FOUND"


def test_malformed_empty_payload_is_rejected():
    token = _get_token_for_role("security_staff")
    response = client.post(
        "/api/security/verify-ticket",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "ticket_token": "   ",
            "gate_event_date": "2026-10-15",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["status"] == "invalid"
    assert data["error_code"] == "MALFORMED_PAYLOAD"


def test_unpaid_ineligible_ticket_is_rejected():
    token = _get_token_for_role("security_staff")
    ticket_token, ticket_number, t_id, b_id = _create_test_ticket(
        event_date="2026-10-15",
        payment_status="pending",
    )

    try:
        response = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "ticket_token": ticket_token,
                "gate_event_date": "2026-10-15",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["status"] == "unpaid"
        assert data["error_code"] == "PAYMENT_NOT_PAID"

        # Verify entry was NOT marked as used
        db: Session = SessionLocal()
        t_db = db.get(Ticket, t_id)
        assert t_db.entry_status == "unused"
        assert t_db.entry_timestamp is None
        db.close()
    finally:
        db = SessionLocal()
        db.execute(delete(ScanLog).where(ScanLog.ticket_id == t_id))
        db.execute(delete(Ticket).where(Ticket.id == t_id))
        db.execute(delete(Booking).where(Booking.id == b_id))
        db.commit()
        db.close()


def test_cancelled_or_revoked_ticket_is_rejected():
    token = _get_token_for_role("security_staff")
    ticket_token, ticket_number, t_id, b_id = _create_test_ticket(
        event_date="2026-10-15",
        payment_status="paid",
        ticket_status="revoked",
    )

    try:
        response = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "ticket_token": ticket_token,
                "gate_event_date": "2026-10-15",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["status"] == "revoked"
        assert data["error_code"] == "TICKET_REVOKED"
    finally:
        db = SessionLocal()
        db.execute(delete(ScanLog).where(ScanLog.ticket_id == t_id))
        db.execute(delete(Ticket).where(Ticket.id == t_id))
        db.execute(delete(Booking).where(Booking.id == b_id))
        db.commit()
        db.close()


def test_already_used_ticket_is_rejected():
    token = _get_token_for_role("security_staff")
    ticket_token, ticket_number, t_id, b_id = _create_test_ticket(
        event_date="2026-10-15",
        payment_status="paid",
        entry_status="used",
    )

    try:
        response = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "ticket_token": ticket_token,
                "gate_event_date": "2026-10-15",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["status"] == "already_used"
        assert data["error_code"] == "TICKET_ALREADY_USED"
        assert data["ticket"]["serial_number"] == ticket_number
        assert data["ticket"]["entry_timestamp"] is not None
    finally:
        db = SessionLocal()
        db.execute(delete(ScanLog).where(ScanLog.ticket_id == t_id))
        db.execute(delete(Ticket).where(Ticket.id == t_id))
        db.execute(delete(Booking).where(Booking.id == b_id))
        db.commit()
        db.close()


def test_wrong_event_date_ticket_is_rejected():
    token = _get_token_for_role("security_staff")
    ticket_token, ticket_number, t_id, b_id = _create_test_ticket(
        event_date="2026-10-12",
        payment_status="paid",
    )

    try:
        response = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "ticket_token": ticket_token,
                "gate_event_date": "2026-10-15",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["status"] == "wrong_date"
        assert data["error_code"] == "WRONG_EVENT_DATE"
        assert "2026-10-12" in data["message"]
    finally:
        db = SessionLocal()
        db.execute(delete(ScanLog).where(ScanLog.ticket_id == t_id))
        db.execute(delete(Ticket).where(Ticket.id == t_id))
        db.execute(delete(Booking).where(Booking.id == b_id))
        db.commit()
        db.close()


def test_non_security_staff_forbidden():
    # Test roles event_admin, counter_operator cannot access verify-ticket
    for role in ("event_admin", "counter_operator"):
        token = _get_token_for_role(role)
        response = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {token}"},
            json={"ticket_token": "SOME-TOKEN"},
        )
        assert response.status_code == 403
        assert "Forbidden" in response.json()["detail"]


def test_concurrent_scans_prevent_double_redemption():
    sec_token = _get_token_for_role("security_staff")
    ticket_token, ticket_number, t_id, b_id = _create_test_ticket(
        event_date="2026-10-16",
        payment_status="paid",
    )

    try:
        def _scan():
            return client.post(
                "/api/security/verify-ticket",
                headers={"Authorization": f"Bearer {sec_token}"},
                json={
                    "ticket_token": ticket_token,
                    "gate_event_date": "2026-10-16",
                },
            )

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(_scan) for _ in range(5)]
            results = [f.result() for f in futures]

        statuses = [r.json()["status"] for r in results]
        valid_count = statuses.count("valid")
        already_used_count = statuses.count("already_used")

        # Concurrency safety: exactly ONE request succeeds with 'valid', all others rejected with 'already_used'
        assert valid_count == 1
        assert already_used_count == 4
    finally:
        db = SessionLocal()
        db.execute(delete(ScanLog).where(ScanLog.ticket_id == t_id))
        db.execute(delete(Ticket).where(Ticket.id == t_id))
        db.execute(delete(Booking).where(Booking.id == b_id))
        db.commit()
        db.close()


def test_scan_history_and_stats_endpoints():
    token = _get_token_for_role("security_staff")
    history_res = client.get(
        "/api/security/scan-history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert history_res.status_code == 200
    h_data = history_res.json()
    assert h_data["success"] is True
    assert isinstance(h_data["items"], list)

    stats_res = client.get(
        "/api/security/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert stats_res.status_code == 200
    s_data = stats_res.json()
    assert s_data["success"] is True
    assert "total_scans" in s_data
    assert "successful_entries" in s_data
    assert "rejected_scans" in s_data

