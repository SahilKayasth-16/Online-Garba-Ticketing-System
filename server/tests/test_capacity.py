import uuid
from datetime import date
from decimal import Decimal
import pytest
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


def _get_or_create_user(role: str) -> User:
    """Helper to get an existing user of given role or create one for testing."""
    db: Session = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.role == role))
        if not user:
            user = User(
                name=f"Test {role.title()}",
                contact_number=f"9{uuid.uuid4().int % 1000000000:09d}",
                email=f"test_{role}_{uuid.uuid4().hex[:6]}@example.com",
                password_hash="testhash123",
                role=role,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    finally:
        db.close()


def _get_token_for_role(role: str) -> str:
    user = _get_or_create_user(role)
    return create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    })


# Test 1 & 2: Fresh dates and Read capacity
def test_all_ten_dates_exist_with_initial_capacity():
    response = client.get("/api/capacities")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]

    assert len(data) == 10
    expected_dates = [f"2026-10-{d:02d}" for d in range(11, 21)]
    received_dates = [item["event_date"] for item in data]
    assert received_dates == expected_dates

    for item in data:
        assert item["capacity"] >= 1
        # No fake sales in DB
        assert item["sold"] == 0
        assert item["remaining"] == item["capacity"]


def test_get_single_capacity_by_date():
    response = client.get("/api/capacities/2026-10-12")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["event_date"] == "2026-10-12"
    assert data["formatted_date"] == "12 Oct 2026"
    assert data["day_number"] == 2


def test_get_capacity_invalid_date():
    response = client.get("/api/capacities/not-a-date")
    assert response.status_code == 400


# Test 3 & 4: Increase capacity and Persistence
def test_super_admin_increase_capacity_and_persistence():
    super_admin_token = _get_token_for_role("super_admin")
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    # Increase 12 Oct capacity to 1000
    update_res = client.put(
        "/api/capacities/2026-10-12",
        json={"capacity": 1000},
        headers=headers,
    )
    assert update_res.status_code == 200
    res_data = update_res.json()["data"]
    assert res_data["event_date"] == "2026-10-12"
    assert res_data["capacity"] == 1000
    assert res_data["sold"] == 0
    assert res_data["remaining"] == 1000

    # Persistence verification: fetch again
    get_res = client.get("/api/capacities/2026-10-12")
    assert get_res.status_code == 200
    persisted = get_res.json()["data"]
    assert persisted["capacity"] == 1000
    assert persisted["remaining"] == 1000


# Test 5: Reduce capacity when sold = 0
def test_super_admin_reduce_capacity_when_no_sales():
    super_admin_token = _get_token_for_role("super_admin")
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    # Change 12 Oct capacity to 2
    update_res = client.put(
        "/api/capacities/2026-10-12",
        json={"capacity": 2},
        headers=headers,
    )
    assert update_res.status_code == 200
    data = update_res.json()["data"]
    assert data["capacity"] == 2
    assert data["remaining"] == 2


# Test 6: Prevent capacity below sold count
def test_prevent_capacity_reduction_below_sold_tickets():
    super_admin_token = _get_token_for_role("super_admin")
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    db: Session = SessionLocal()
    test_booking_id = f"TEST-BOOKING-{uuid.uuid4().hex[:8]}"
    try:
        # First ensure capacity is 10
        client.put(
            "/api/capacities/2026-10-15",
            json={"capacity": 10},
            headers=headers,
        )

        # Insert a real booking of 4 confirmed tickets for 15 October 2026
        booking = Booking(
            booking_id=test_booking_id,
            venue="Bardoli Ground",
            event_date="2026-10-15",
            quantity=4,
            ticket_price=Decimal("200.00"),
            total_amount=Decimal("800.00"),
            payment_method="online",
            payment_status="paid",
        )
        db.add(booking)
        db.commit()

        # Check that GET reflects sold = 4 and remaining = 6
        get_res = client.get("/api/capacities/2026-10-15")
        data = get_res.json()["data"]
        assert data["sold"] == 4
        assert data["remaining"] == 6

        # Reducing capacity to 5 is allowed (5 >= 4)
        valid_reduce = client.put(
            "/api/capacities/2026-10-15",
            json={"capacity": 5},
            headers=headers,
        )
        assert valid_reduce.status_code == 200
        assert valid_reduce.json()["data"]["capacity"] == 5
        assert valid_reduce.json()["data"]["remaining"] == 1

        # Reducing capacity to 3 must be REJECTED (3 < 4 sold)
        invalid_reduce = client.put(
            "/api/capacities/2026-10-15",
            json={"capacity": 3},
            headers=headers,
        )
        assert invalid_reduce.status_code == 400
        assert "cannot be reduced below" in invalid_reduce.json()["detail"].lower()

        # Verify capacity remains 5 (unchanged)
        verify_res = client.get("/api/capacities/2026-10-15")
        assert verify_res.json()["data"]["capacity"] == 5

    finally:
        # Clean up test booking
        db.execute(delete(Booking).where(Booking.booking_id == test_booking_id))
        # Reset capacity for 15 Oct back to 10
        db_row = db.scalar(select(DailyCapacity).where(DailyCapacity.event_date == date(2026, 10, 15)))
        if db_row:
            db_row.capacity = 10
        db.commit()
        db.close()


# Test 7: Invalid capacity values
@pytest.mark.parametrize("invalid_val", [0, -1, -50, 10.5, "abc", ""])
def test_invalid_capacity_values_rejected(invalid_val):
    super_admin_token = _get_token_for_role("super_admin")
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    res = client.put(
        "/api/capacities/2026-10-11",
        json={"capacity": invalid_val},
        headers=headers,
    )
    assert res.status_code in (400, 422)


# Test 8: Authorization enforcement
def test_unauthenticated_cannot_update_capacity():
    res = client.put(
        "/api/capacities/2026-10-11",
        json={"capacity": 50},
    )
    assert res.status_code == 401


@pytest.mark.parametrize("role", ["event_admin", "counter_operator", "security_staff"])
def test_non_super_admin_roles_forbidden(role):
    token = _get_token_for_role(role)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.put(
        "/api/capacities/2026-10-11",
        json={"capacity": 50},
        headers=headers,
    )
    assert res.status_code == 403
    assert "only super admin" in res.json()["detail"].lower()


# Test 9: Reset back to 10 and verify no fake data
def test_clean_state_no_fake_sales():
    super_admin_token = _get_token_for_role("super_admin")
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    # Reset 12 Oct back to 10 for clean baseline
    client.put(
        "/api/capacities/2026-10-12",
        json={"capacity": 10},
        headers=headers,
    )

    res = client.get("/api/capacities")
    assert res.status_code == 200
    for item in res.json()["data"]:
        assert item["sold"] == 0
        assert item["remaining"] == item["capacity"]

