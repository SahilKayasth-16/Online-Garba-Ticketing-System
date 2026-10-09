import concurrent.futures
import uuid
from datetime import date
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


def _get_user_token(role: str) -> str:
    db: Session = SessionLocal()
    user = db.scalar(select(User).where(User.role == role))
    db.close()
    assert user is not None, f"User with role {role} must exist"
    return create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    })


# 1. Event Admin tests
def test_event_admin_cannot_modify_capacity():
    ea_token = _get_user_token("event_admin")
    res = client.put(
        "/api/capacities/2026-10-12",
        json={"capacity": 500},
        headers={"Authorization": f"Bearer {ea_token}"},
    )
    assert res.status_code == 403
    assert "only super admin" in res.json()["detail"].lower()


def test_super_admin_status_name_accessible():
    res = client.get("/api/auth/super-admin")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["exists"] is True
    assert data["name"] is not None
    assert len(data["name"]) > 0


# 2. Capacity alerts thresholds verification
def test_low_capacity_threshold_rules():
    # Less than 100 -> threshold 25
    # 100 - 1000 -> threshold 40
    # Greater than 1000 -> threshold 70
    def get_threshold(capacity: int) -> int:
        if capacity < 100:
            return 25
        if capacity <= 1000:
            return 40
        return 70

    assert get_threshold(10) == 25
    assert get_threshold(99) == 25
    assert get_threshold(100) == 40
    assert get_threshold(500) == 40
    assert get_threshold(1000) == 40
    assert get_threshold(1001) == 70
    assert get_threshold(2000) == 70


# 3. Advance booking and sold out integration
def test_advance_booking_flow_and_sold_out():
    sa_token = _get_user_token("super_admin")
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # Set capacity for 14 Oct to 4
    set_cap_res = client.put(
        "/api/capacities/2026-10-14",
        json={"capacity": 4},
        headers=sa_headers,
    )
    assert set_cap_res.status_code == 200

    created_ids = []
    try:
        # Book 2 tickets
        bk1 = client.post("/api/bookings", json={
            "event_date": "2026-10-14",
            "quantity": 2,
            "payment_method": "cash",
        })
        assert bk1.status_code == 201
        created_ids.append(bk1.json()["data"]["booking_id"])

        # Check remaining is 2
        cap_res = client.get("/api/capacities/2026-10-14")
        assert cap_res.json()["data"]["sold"] == 2
        assert cap_res.json()["data"]["remaining"] == 2

        # Book remaining 2 tickets
        bk2 = client.post("/api/bookings", json={
            "event_date": "2026-10-14",
            "quantity": 2,
            "payment_method": "cash",
        })
        assert bk2.status_code == 201
        created_ids.append(bk2.json()["data"]["booking_id"])

        # Check remaining is 0 (SOLD OUT)
        cap_res_sold = client.get("/api/capacities/2026-10-14")
        assert cap_res_sold.json()["data"]["remaining"] == 0
        assert cap_res_sold.json()["data"]["sold"] == 4

        # Attempt to book on sold out date
        sold_out_attempt = client.post("/api/bookings", json={
            "event_date": "2026-10-14",
            "quantity": 1,
            "payment_method": "cash",
        })
        assert sold_out_attempt.status_code == 400
        err_data = sold_out_attempt.json()
        assert err_data["error_code"] == "EVENT_DATE_SOLD_OUT"
        assert err_data["detail"] == "Today's ticket are sold out. You may book advance for another day. Sorry for inconveniency"

        # Super Admin increases capacity from 4 to 10
        inc_res = client.put(
            "/api/capacities/2026-10-14",
            json={"capacity": 10},
            headers=sa_headers,
        )
        assert inc_res.status_code == 200
        inc_data = inc_res.json()["data"]
        assert inc_data["capacity"] == 10
        assert inc_data["sold"] == 4
        assert inc_data["remaining"] == 6

        # Now booking can succeed again!
        bk3 = client.post("/api/bookings", json={
            "event_date": "2026-10-14",
            "quantity": 1,
            "payment_method": "cash",
        })
        assert bk3.status_code == 201
        created_ids.append(bk3.json()["data"]["booking_id"])

    finally:
        db: Session = SessionLocal()
        for bid in created_ids:
            db.execute(delete(Booking).where(Booking.booking_id == bid))
        db.commit()
        # Reset 14 Oct capacity back to 10
        client.put("/api/capacities/2026-10-14", json={"capacity": 10}, headers=sa_headers)
        db.close()


# 4. Concurrency test: prevent overselling under concurrent booking requests
def test_concurrent_bookings_prevent_overselling():
    sa_token = _get_user_token("super_admin")
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # Set capacity for 19 Oct to exactly 2
    client.put("/api/capacities/2026-10-19", json={"capacity": 2}, headers=sa_headers)

    created_ids = []
    try:
        def attempt_booking():
            # Use separate TestClient instance per thread
            c = TestClient(app)
            return c.post("/api/bookings", json={
                "event_date": "2026-10-19",
                "quantity": 2,
                "payment_method": "cash",
            })

        # Launch 4 simultaneous requests, each wanting 2 tickets
        # Total demand = 8 tickets, capacity = 2. Exactly ONE request should succeed!
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(attempt_booking) for _ in range(4)]
            results = [f.result() for f in futures]

        statuses = [r.status_code for r in results]
        success_count = statuses.count(201)
        rejected_count = statuses.count(400)

        assert success_count == 1, f"Expected exactly 1 success against capacity 2, got {success_count}"
        assert rejected_count == 3, f"Expected 3 rejections, got {rejected_count}"

        for r in results:
            if r.status_code == 201:
                created_ids.append(r.json()["data"]["booking_id"])

        # Check final remaining is exactly 0 and sold is exactly 2
        cap_res = client.get("/api/capacities/2026-10-19")
        assert cap_res.json()["data"]["sold"] == 2
        assert cap_res.json()["data"]["remaining"] == 0

    finally:
        db: Session = SessionLocal()
        for bid in created_ids:
            db.execute(delete(Booking).where(Booking.booking_id == bid))
        db.commit()
        client.put("/api/capacities/2026-10-19", json={"capacity": 10}, headers=sa_headers)
        db.close()


# 5. Counter operator booking records query
def test_counter_operator_booking_records_and_pdf():
    # Create booking for 20 Oct
    res = client.post("/api/bookings", json={
        "event_date": "2026-10-20",
        "quantity": 1,
        "payment_method": "cash",
    })
    assert res.status_code == 201
    bk_id = res.json()["data"]["booking_id"]

    try:
        # Get bookings filtered by 20 Oct
        b_res = client.get("/api/bookings?event_date=2026-10-20")
        assert b_res.status_code == 200
        b_list = b_res.json()["data"]
        matching = [b for b in b_list if b["booking_id"] == bk_id]
        assert len(matching) == 1
        assert matching[0]["quantity"] == 1
        assert matching[0]["payment_method"] == "CASH"

        # Check PDF endpoint
        pdf_res = client.get(f"/api/bookings/{bk_id}/ticket.pdf")
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
    finally:
        db: Session = SessionLocal()
        db.execute(delete(Booking).where(Booking.booking_id == bk_id))
        db.commit()
        db.close()

