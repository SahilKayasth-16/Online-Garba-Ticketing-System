from typing import List, Optional
from pydantic import BaseModel, Field


class VerifyTicketRequest(BaseModel):
    ticket_token: str = Field(..., description="Scanned ticket QR token, serial number, or payload")
    gate_event_date: Optional[str] = Field(None, description="Optional active event date at gate (YYYY-MM-DD)")


class TicketVerificationData(BaseModel):
    serial_number: str
    event_date: str
    payment_status: str
    entry_status: str
    entry_timestamp: Optional[str] = None
    venue: Optional[str] = None


class VerifyTicketResponse(BaseModel):
    success: bool
    status: str = Field(..., description="'valid', 'already_used', 'invalid', 'unpaid', 'wrong_date', 'revoked'")
    message: str
    error_code: Optional[str] = None
    ticket: Optional[TicketVerificationData] = None


class ScanLogItem(BaseModel):
    id: int
    ticket_number: Optional[str] = None
    event_date: Optional[str] = None
    scan_result: str
    message: str
    scanned_at: str
    scanned_by: Optional[str] = None
    is_successful_entry: bool


class ScanHistoryResponse(BaseModel):
    success: bool
    total: int
    items: List[ScanLogItem]


class SecurityStatsResponse(BaseModel):
    success: bool
    total_scans: int
    successful_entries: int
    rejected_scans: int
    already_used_scans: int
    active_event_date: str

