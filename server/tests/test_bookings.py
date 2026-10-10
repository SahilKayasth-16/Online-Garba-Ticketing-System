import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.main import app
from app.models.booking import Booking
from app.models.capacity import DailyCapacity
from app.models.user import User

client = TestClient(app)


def _get_super_admin_token() -> str:
    db: Session = SessionLocal()
    sa_user = db.scalar(select(User).where(User.role == "super_admin"))
    db.close()
    assert sa_user is not None
    return create_access_token({
        "sub": str(sa_user.id),
        "email": sa_user.email,
        "role": sa_user.role,
    })


def test_get_nonexistent_booking():
    response = client.get("/api/bookings/NON-EXISTENT-ID-1234")
    assert response.status_code == 404
    data = response.json()
    assert "not found" in data["detail"].lower()


def test_get_booking_success():
    db: Session = SessionLocal()
    test_id = f"TEST-BK-{uuid.uuid4().hex[:8]}"
    try:
        booking = Booking(
            booking_id=test_id,
            venue="Bardoli Ground",
            event_date="2026-10-12",
            quantity=2,
            ticket_price=Decimal("200.00"),
            total_amount=Decimal("400.00"),
            payment_method="online",
            payment_status="paid",
        )
        db.add(booking)
        db.commit()

        response = client.get(f"/api/bookings/{test_id}")
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["success"] is True
        assert res_data["data"]["booking_id"] == test_id
        assert res_data["data"]["quantity"] == 2
        assert res_data["data"]["event_date"] == "2026-10-12"
        assert res_data["data"]["payment_status"] == "paid"
    finally:
        db.execute(delete(Booking).where(Booking.booking_id == test_id))
        db.commit()
        db.close()


def test_download_ticket_pdf_nonexistent():
    response = client.get("/api/bookings/NON-EXISTENT-ID-1234/ticket.pdf")
    assert response.status_code == 404


def test_download_ticket_pdf_success():
    db: Session = SessionLocal()
    test_id = f"TEST-PDF-{uuid.uuid4().hex[:8]}"
    try:
        booking = Booking(
            booking_id=test_id,
            venue="Bardoli Ground",
            event_date="2026-10-15",
            quantity=3,
            ticket_price=Decimal("200.00"),
            total_amount=Decimal("600.00"),
            payment_method="online",
            payment_status="paid",
        )
        db.add(booking)
        db.commit()

        response = client.get(f"/api/bookings/{test_id}/ticket.pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert len(response.content) > 100
    finally:
        db.execute(delete(Booking).where(Booking.booking_id == test_id))
        db.commit()
        db.close()


def test_create_booking_success_and_advance_date_capacity():
    created_booking_id = None
    try:
        # Check initial remaining tickets for 13 Oct 2026
        init_res = client.get("/api/capacities/2026-10-13")
        assert init_res.status_code == 200
        initial_remaining = init_res.json()["data"]["remaining"]
        initial_sold = init_res.json()["data"]["sold"]

        # Record initial sold for 14 Oct
        other_init_res = client.get("/api/capacities/2026-10-14")
        other_initial_sold = other_init_res.json()["data"]["sold"]

        # Book 2 tickets for 13 Oct
        payload = {
            "event_date": "2026-10-13",
            "quantity": 2,
            "payment_method": "cash",
        }
        res = client.post("/api/bookings", json=payload)
        assert res.status_code == 201
        res_data = res.json()
        assert res_data["success"] is True
        booking = res_data["data"]
        created_booking_id = booking["booking_id"]
        assert booking["quantity"] == 2
        assert booking["event_date"] == "2026-10-13"
        assert booking["payment_method"] == "CASH"
        assert booking["payment_status"] == "paid"
        assert booking["total_amount"] == 400.0

        # Verify capacity for 13 Oct consumed 2 tickets
        after_res = client.get("/api/capacities/2026-10-13")
        assert after_res.json()["data"]["remaining"] == initial_remaining - 2
        assert after_res.json()["data"]["sold"] == initial_sold + 2

        # Verify 14 Oct capacity was NOT affected by advance booking for 13 Oct
        other_res = client.get("/api/capacities/2026-10-14")
        assert other_res.json()["data"]["sold"] == other_initial_sold

    finally:
        if created_booking_id:
            db: Session = SessionLocal()
            db.execute(delete(Booking).where(Booking.booking_id == created_booking_id))
            db.commit()
            db.close()


def test_create_booking_sold_out_rejection():
    token = _get_super_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Temporarily set capacity to 2 for 16 Oct
    client.put("/api/capacities/2026-10-16", json={"capacity": 2}, headers=headers)

    created_ids = []
    try:
        # Book 2 tickets (consuming all capacity)
        res1 = client.post("/api/bookings", json={
            "event_date": "2026-10-16",
            "quantity": 2,
            "payment_method": "cash",
        })
        assert res1.status_code == 201
        created_ids.append(res1.json()["data"]["booking_id"])

        # Check remaining is 0
        cap_res = client.get("/api/capacities/2026-10-16")
        assert cap_res.json()["data"]["remaining"] == 0

        # Now attempt another booking on sold out date
        res2 = client.post("/api/bookings", json={
            "event_date": "2026-10-16",
            "quantity": 1,
            "payment_method": "cash",
        })
        assert res2.status_code == 400
        err_json = res2.json()
        assert err_json["error_code"] == "EVENT_DATE_SOLD_OUT"
        assert err_json["detail"] == "Today's ticket are sold out. You may book advance for another day. Sorry for inconveniency"

    finally:
        db: Session = SessionLocal()
        for bid in created_ids:
            db.execute(delete(Booking).where(Booking.booking_id == bid))
        db.commit()
        # Reset capacity back to 10
        client.put("/api/capacities/2026-10-16", json={"capacity": 10}, headers=headers)
        db.close()


def test_create_booking_insufficient_capacity():
    token = _get_super_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Capacity is 10 for 17 Oct, attempt booking 10 is allowed, but requesting 10 when remaining is 2 is rejected
    client.put("/api/capacities/2026-10-17", json={"capacity": 5}, headers=headers)
    created_ids = []
    try:
        res1 = client.post("/api/bookings", json={
            "event_date": "2026-10-17",
            "quantity": 4,
            "payment_method": "cash",
        })
        assert res1.status_code == 201
        created_ids.append(res1.json()["data"]["booking_id"])

        # 1 remaining, try to book 2
        res2 = client.post("/api/bookings", json={
            "event_date": "2026-10-17",
            "quantity": 2,
            "payment_method": "cash",
        })
        assert res2.status_code == 400
        assert res2.json()["error_code"] == "INSUFFICIENT_CAPACITY"
        assert "only 1 pass available" in res2.json()["detail"].lower()
    finally:
        db: Session = SessionLocal()
        for bid in created_ids:
            db.execute(delete(Booking).where(Booking.booking_id == bid))
        db.commit()
        client.put("/api/capacities/2026-10-17", json={"capacity": 10}, headers=headers)
        db.close()


def test_list_bookings_filtered_by_event_date():
    db: Session = SessionLocal()
    b1_id = f"TEST-FILT-1-{uuid.uuid4().hex[:6]}"
    b2_id = f"TEST-FILT-2-{uuid.uuid4().hex[:6]}"
    try:
        b1 = Booking(
            booking_id=b1_id,
            venue="Bardoli Ground",
            event_date="2026-10-18",
            quantity=1,
            ticket_price=Decimal("200.00"),
            total_amount=Decimal("200.00"),
            payment_method="CASH",
            payment_status="paid",
        )
        b2 = Booking(
            booking_id=b2_id,
            venue="Bardoli Ground",
            event_date="2026-10-19",
            quantity=1,
            ticket_price=Decimal("200.00"),
            total_amount=Decimal("200.00"),
            payment_method="CASH",
            payment_status="paid",
        )
        db.add_all([b1, b2])
        db.commit()

        # Query filtered by 18 Oct
        res = client.get("/api/bookings?event_date=2026-10-18")
        assert res.status_code == 200
        b_list = res.json()["data"]
        ids = [b["booking_id"] for b in b_list]
        assert b1_id in ids
        assert b2_id not in ids
    finally:
        db.execute(delete(Booking).where(Booking.booking_id.in_([b1_id, b2_id])))
        db.commit()
        db.close()
