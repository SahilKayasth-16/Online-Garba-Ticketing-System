from datetime import date, datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UpdateCapacityRequest(BaseModel):
    """
    Schema for updating daily ticket capacity for an event date.
    Strictly validates that capacity is a positive integer (> 0).
    """

    capacity: int = Field(
        ...,
        description="Daily ticket capacity, must be a strictly positive integer (> 0)",
    )

    @field_validator("capacity", mode="before")
    @classmethod
    def validate_capacity_value(cls, v: Any) -> int:
        # Prevent booleans (True is 1 in Python)
        if isinstance(v, bool):
            raise ValueError("Capacity must be an integer, not a boolean value.")

        # Reject floating point values with decimals (e.g. 10.5)
        if isinstance(v, float):
            if not v.is_integer():
                raise ValueError("Capacity must be a whole integer, decimal values are not allowed.")
            v = int(v)

        # Reject strings with non-numeric or float representations
        if isinstance(v, str):
            v_str = v.strip()
            if not v_str:
                raise ValueError("Capacity cannot be empty.")
            if "." in v_str:
                raise ValueError("Capacity must be a whole integer, decimal values are not allowed.")
            if not (v_str.isdigit() or (v_str.startswith("-") and v_str[1:].isdigit())):
                raise ValueError("Capacity must be a valid numeric integer.")
            v = int(v_str)

        try:
            val = int(v)
        except (TypeError, ValueError):
            raise ValueError("Capacity must be a valid integer.")

        if val <= 0:
            raise ValueError("Capacity must be a strictly positive integer greater than zero.")

        return val


class DailyCapacityResponse(BaseModel):
    """
    Response schema representing daily ticket capacity details for a festival date.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_date: str
    formatted_date: str
    day_number: int
    capacity: int
    sold: int
    remaining: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CapacityListResponse(BaseModel):
    success: bool = True
    message: str = "Daily capacities retrieved successfully."
    data: List[DailyCapacityResponse]


class SingleCapacityResponse(BaseModel):
    success: bool = True
    message: str = "Daily capacity updated successfully."
    data: DailyCapacityResponse

