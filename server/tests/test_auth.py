import random
import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _gen_phone():
    return f"9{random.randint(100000000, 999999999)}"


def test_register_user_success():
    unique_email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "name": "Event Admin User",
        "contact_number": _gen_phone(),
        "email": unique_email,
        "password": "secretPassword123",
        "role": "event_admin",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert data["data"]["token_type"] == "bearer"
    assert data["data"]["user"]["email"] == unique_email
    assert data["data"]["user"]["role"] == "event_admin"



def test_register_duplicate_email():
    unique_email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    phone1 = _gen_phone()
    phone2 = _gen_phone()
    payload = {
        "name": "First User",
        "contact_number": phone1,
        "email": unique_email,
        "password": "password123",
        "role": "event_admin",
    }
    res1 = client.post("/api/auth/register", json=payload)
    assert res1.status_code == 201

    # Duplicate registration attempt with same email but different phone
    payload2 = {
        "name": "Second User",
        "contact_number": phone2,
        "email": unique_email,
        "password": "password456",
        "role": "event_admin",
    }
    res2 = client.post("/api/auth/register", json=payload2)
    assert res2.status_code == 400


def test_register_invalid_role():
    payload = {
        "name": "Bad Role User",
        "contact_number": _gen_phone(),
        "email": f"bad_role_{uuid.uuid4().hex[:8]}@example.com",
        "password": "password123",
        "role": "invalid_role_name",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code in (400, 422)


def test_login_success_and_me_endpoint():
    unique_email = f"login_test_{uuid.uuid4().hex[:8]}@example.com"
    password = "correctPassword123"

    # Register first
    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Counter Operator",
            "contact_number": _gen_phone(),
            "email": unique_email,
            "password": password,
            "role": "counter_operator",
        },
    )
    assert reg_res.status_code == 201

    # Login
    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["success"] is True
    token = login_data["data"]["access_token"]
    assert token

    # Test /me endpoint with valid bearer token
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["success"] is True
    assert me_data["data"]["email"] == unique_email
    assert me_data["data"]["role"] == "counter_operator"


def test_login_invalid_password():
    unique_email = f"bad_pwd_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Security Guard",
            "contact_number": _gen_phone(),
            "email": unique_email,
            "password": "correctPassword",
            "role": "security_staff",
        },
    )
    assert reg_res.status_code == 201

    res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "wrongPassword"},
    )
    assert res.status_code == 401


def test_me_unauthorized():
    res = client.get("/api/auth/me")
    assert res.status_code == 401
