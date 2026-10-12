import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.main import app
from app.models.booking import Booking
from app.models.ticket import Ticket
from app.models.user import User
from app.services.payment_service import calculate_paise_amount
from app.utils.pdf_generator import generate_ticket_pdf

client = TestClient(app)


def _get_token_for_role(role: str) -> str:
    db: Session = SessionLocal()
    user = db.scalar(select(User).where(User.role == role))
    db.close()
    assert user is not None, f"User with role {role} must exist"
    return create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    })


def test_paise_calculation():
    """Verify server-authoritative integer paise calculation."""
    assert calculate_paise_amount(200.0) == 20000
    assert calculate_paise_amount(400.0) == 40000
    assert calculate_paise_amount(600.0) == 60000
    assert calculate_paise_amount(2000.0) == 200000


def test_cash_booking_starts_pending_and_issues_no_tickets_until_confirmed():
    """
    Requirements:
    1. Cash bookings start with payment_status='pending'.
    2. Tickets are NOT issued until payment is verified/collected.
    3. Counter operator calls /confirm-cash, transitions to 'paid', issues N tickets with unique QRs.
    4. Second call is idempotent.
    """
    operator_token = _get_token_for_role("counter_operator")
    headers = {"Authorization": f"Bearer {operator_token}"}

    # Create 3-ticket booking for 15 Oct
    create_res = client.post("/api/bookings", json={
        "event_date": "2026-10-15",
        "quantity": 3,
        "payment_method": "cash",
    })
    assert create_res.status_code == 201
    booking_data = create_res.json()["data"]
    bk_id = booking_data["booking_id"]

    try:
        # Verify initial status is PENDING and tickets list is empty
        assert booking_data["payment_status"] == "pending"
        assert booking_data["payment_method"] == "CASH"
        assert booking_data["quantity"] == 3
        assert booking_data["total_amount"] == 600.0
        assert len(booking_data["tickets"]) == 0

        # Verify in DB directly: NO tickets exist yet
        db: Session = SessionLocal()
        b_orm = db.scalar(select(Booking).where(Booking.booking_id == bk_id))
        assert b_orm is not None
        assert b_orm.payment_status == "pending"
        t_count = len(b_orm.tickets)
        db.close()
        assert t_count == 0

        # Operator confirms cash collection
        confirm_res = client.post(f"/api/bookings/{bk_id}/confirm-cash", headers=headers)
        assert confirm_res.status_code == 200
        conf_data = confirm_res.json()
        assert conf_data["success"] is True
        assert conf_data["status"] == "paid"
        assert conf_data["message"] == "payment received"

        confirmed_booking = conf_data["data"]
        assert confirmed_booking["payment_status"] == "paid"
        assert confirmed_booking["cash_collected_at"] is not None
        assert len(confirmed_booking["tickets"]) == 3

        # Verify each of the 3 tickets has a unique serial, token, and entry QR data URL
        tokens = set()
        numbers = set()
        for idx, t in enumerate(confirmed_booking["tickets"], start=1):
            assert t["status"] == "valid"
            assert t["entry_status"] == "unused"
            assert t["ticket_number"] == f"{bk_id}-{idx:02d}"
            assert t["ticket_token"].startswith("OGTS-TKT-")
            assert t["qr_code_data_url"] is not None
            assert t["qr_code_data_url"].startswith("data:image/png;base64,")
            tokens.add(t["ticket_token"])
            numbers.add(t["ticket_number"])

        assert len(tokens) == 3, "All N tickets must have unique tokens"
        assert len(numbers) == 3, "All N tickets must have unique ticket numbers"

        # Idempotency test: Confirming again returns same tickets without creating duplicates
        repeat_res = client.post(f"/api/bookings/{bk_id}/confirm-cash", headers=headers)
        assert repeat_res.status_code == 200
        assert len(repeat_res.json()["data"]["tickets"]) == 3

        # Verify DB still has exactly 3 tickets
        db2 = SessionLocal()
        b_orm2 = db2.scalar(select(Booking).where(Booking.booking_id == bk_id))
        assert len(b_orm2.tickets) == 3
        db2.close()

    finally:
        db_clean = SessionLocal()
        db_clean.execute(delete(Booking).where(Booking.booking_id == bk_id))
        db_clean.commit()
        db_clean.close()


def test_confirm_cash_role_authorization():
    """
    Only counter_operator, event_admin, and super_admin may confirm cash.
    Unauthorized or unauthenticated users must be rejected.
    """
    # Create booking
    create_res = client.post("/api/bookings", json={
        "event_date": "2026-10-18",
        "quantity": 1,
        "payment_method": "cash",
    })
    assert create_res.status_code == 201
    bk_id = create_res.json()["data"]["booking_id"]

    try:
        # 1. Unauthenticated request -> 401
        res_no_auth = client.post(f"/api/bookings/{bk_id}/confirm-cash")
        assert res_no_auth.status_code == 401

        # 2. Security staff token -> 403 (security cannot collect cash)
        sec_token = _get_token_for_role("security_staff")
        res_sec = client.post(
            f"/api/bookings/{bk_id}/confirm-cash",
            headers={"Authorization": f"Bearer {sec_token}"},
        )
        assert res_sec.status_code == 403

        # 3. Event admin token -> 200 (allowed)
        ea_token = _get_token_for_role("event_admin")
        res_ea = client.post(
            f"/api/bookings/{bk_id}/confirm-cash",
            headers={"Authorization": f"Bearer {ea_token}"},
        )
        assert res_ea.status_code == 200
        assert res_ea.json()["data"]["payment_status"] == "paid"

    finally:
        db_clean = SessionLocal()
        db_clean.execute(delete(Booking).where(Booking.booking_id == bk_id))
        db_clean.commit()
        db_clean.close()


def test_payment_qr_and_razorpay_endpoints():
    """
    Tests Razorpay readiness endpoints:
    1. /api/payments/create-order calculates exact integer paise.
    2. /api/payments/create-qr creates Customer Payment QR with exact amount.
    """
    create_res = client.post("/api/bookings", json={
        "event_date": "2026-10-15",
        "quantity": 3,
        "payment_method": "online",
    })
    assert create_res.status_code == 201
    bk_id = create_res.json()["data"]["booking_id"]

    try:
        # Test create-order
        order_res = client.post("/api/payments/create-order", json={"booking_id": bk_id})
        assert order_res.status_code == 200
        order_data = order_res.json()
        assert order_data["success"] is True
        assert order_data["booking_id"] == bk_id
        # 3 tickets @ 200 = 600 rupees = 60000 paise
        assert order_data["amount_in_rupees"] == 600.0
        assert order_data["amount_in_paise"] == 60000
        assert order_data["currency"] == "INR"

        # Test create-qr (Customer Payment QR System 1)
        qr_res = client.post("/api/payments/create-qr", json={"booking_id": bk_id})
        assert qr_res.status_code == 200
        qr_data = qr_res.json()
        assert qr_data["success"] is True
        assert qr_data["booking_id"] == bk_id
        assert qr_data["amount_in_paise"] == 60000
        assert qr_data["qr_data_url"] is not None
        assert qr_data["qr_data_url"].startswith("data:image/png;base64,")

    finally:
        db_clean = SessionLocal()
        db_clean.execute(delete(Booking).where(Booking.booking_id == bk_id))
        db_clean.commit()
        db_clean.close()


def test_two_qr_systems_security_separation():
    """
    CRITICAL REQUIREMENT:
    Payment QR (System 1) MUST NEVER be accepted by the Security Dashboard for gate entry.
    Only Entrance Ticket QR (System 2) is accepted.
    """
    operator_token = _get_token_for_role("counter_operator")
    security_token = _get_token_for_role("security_staff")

    # 1. Create booking and get Customer Payment QR
    create_res = client.post("/api/bookings", json={
        "event_date": "2026-10-18",
        "quantity": 1,
        "payment_method": "cash",
    })
    assert create_res.status_code == 201
    bk_id = create_res.json()["data"]["booking_id"]

    try:
        # Generate payment QR
        qr_res = client.post("/api/payments/create-qr", json={"booking_id": bk_id})
        assert qr_res.status_code == 200
        db = SessionLocal()
        b_orm = db.scalar(select(Booking).where(Booking.booking_id == bk_id))
        payment_qr_payload = b_orm.payment_qr_payload
        db.close()
        assert payment_qr_payload is not None
        assert "upi://" in payment_qr_payload

        # 2. Attempt to scan Customer Payment QR at Security Gate
        # Security Dashboard MUST reject it!
        sec_scan_payment_qr = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {security_token}"},
            json={"ticket_token": payment_qr_payload, "gate_event_date": "2026-10-18"},
        )
        assert sec_scan_payment_qr.status_code == 200
        sec_res_data = sec_scan_payment_qr.json()
        assert sec_res_data["success"] is False
        assert sec_res_data["status"] == "invalid"
        assert sec_res_data["error_code"] == "TICKET_NOT_FOUND"

        # 3. Confirm cash to issue official entrance ticket (QR System 2)
        conf_res = client.post(
            f"/api/bookings/{bk_id}/confirm-cash",
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert conf_res.status_code == 200
        ticket_item = conf_res.json()["data"]["tickets"][0]
        entrance_token = ticket_item["ticket_token"]
        assert entrance_token.startswith("OGTS-TKT-")

        # 4. Now scan official entrance ticket QR at Security Gate
        # Security Dashboard MUST accept it!
        sec_scan_entry = client.post(
            "/api/security/verify-ticket",
            headers={"Authorization": f"Bearer {security_token}"},
            json={"ticket_token": entrance_token, "gate_event_date": "2026-10-18"},
        )
        assert sec_scan_entry.status_code == 200
        entry_data = sec_scan_entry.json()
        assert entry_data["success"] is True
        assert entry_data["status"] == "valid"
        assert entry_data["ticket"]["entry_status"] == "used"


    finally:
        db_clean = SessionLocal()
        db_clean.execute(delete(Booking).where(Booking.booking_id == bk_id))
        db_clean.commit()
        db_clean.close()


def test_pdf_multi_page_and_pending_distinction():
    """
    Verify PDF generator outputs:
    1. Multi-page document with entry QRs for paid booking.
    2. Pending warning document without gate QR for unpaid booking.
    """
    paid_booking = {
        "booking_id": "OGTS-2026-PAID99",
        "venue": "Bardoli Ground",
        "event_date": "2026-10-14",
        "quantity": 2,
        "ticket_price": 200.0,
        "total_amount": 400.0,
        "payment_method": "CASH",
        "payment_status": "paid",
        "tickets": [
            {
                "ticket_number": "OGTS-2026-PAID99-01",
                "ticket_token": "OGTS-TKT-T1",
                "event_date": "2026-10-14",
                "status": "valid",
                "entry_status": "unused",
            },
            {
                "ticket_number": "OGTS-2026-PAID99-02",
                "ticket_token": "OGTS-TKT-T2",
                "event_date": "2026-10-14",
                "status": "valid",
                "entry_status": "unused",
            },
        ],
    }

    pending_booking = {
        "booking_id": "OGTS-2026-PEND99",
        "venue": "Bardoli Ground",
        "event_date": "2026-10-14",
        "quantity": 2,
        "ticket_price": 200.0,
        "total_amount": 400.0,
        "payment_method": "CASH",
        "payment_status": "pending",
        "tickets": [],
    }

    paid_pdf = generate_ticket_pdf(paid_booking)
    pending_pdf = generate_ticket_pdf(pending_booking)

    assert isinstance(paid_pdf, bytes)
    assert len(paid_pdf) > 10000  # Multi-page with 2 QR drawings is substantial
    assert isinstance(pending_pdf, bytes)
    assert len(pending_pdf) > 2000
