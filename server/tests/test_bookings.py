import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.main import app
from app.models.booking import Booking

client = TestClient(app)


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
