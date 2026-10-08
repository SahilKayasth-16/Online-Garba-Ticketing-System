from fastapi.testclient import TestClient
from app.main import app
from app.db.database import check_db_connection

client = TestClient(app)


def test_import_app():
    assert app is not None
    assert app.title is not None


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["message"] == "Online Garba Ticketing API is running."


def test_database_connection():
    assert check_db_connection() is True
