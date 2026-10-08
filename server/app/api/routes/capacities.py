from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_super_admin
from app.models.user import User
from app.schemas.capacity import (
    CapacityListResponse,
    SingleCapacityResponse,
    UpdateCapacityRequest,
)
from app.services import capacity_service

router = APIRouter()


@router.get(
    "",
    response_model=CapacityListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get daily ticket capacities for all festival dates",
)
@router.get(
    "/",
    response_model=CapacityListResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def get_all_capacities(db: Session = Depends(get_db)):
    """
    Retrieve daily ticket capacities, sold count, and remaining tickets
    for all 10 festival dates (11-20 October 2026).
    """
    capacities = capacity_service.get_all_daily_capacities(db)
    return {
        "success": True,
        "message": "Daily ticket capacities retrieved successfully.",
        "data": capacities,
    }


@router.get(
    "/{event_date}",
    response_model=SingleCapacityResponse,
    status_code=status.HTTP_200_OK,
    summary="Get daily ticket capacity for a specific date",
)
def get_capacity_by_date(
    event_date: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve daily ticket capacity details for a specific event date.
    Accepts ISO format (YYYY-MM-DD) or common festival date representations.
    """
    try:
        parsed_date = capacity_service.parse_event_date(event_date)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    capacity_data = capacity_service.get_daily_capacity_by_date(db, parsed_date)
    if not capacity_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket capacity record for date {event_date} was not found.",
        )

    return {
        "success": True,
        "message": "Daily ticket capacity retrieved successfully.",
        "data": capacity_data,
    }


@router.put(
    "/{event_date}",
    response_model=SingleCapacityResponse,
    status_code=status.HTTP_200_OK,
    summary="Update daily ticket capacity (Super Admin only)",
)
@router.patch(
    "/{event_date}",
    response_model=SingleCapacityResponse,
    status_code=status.HTTP_200_OK,
    summary="Patch daily ticket capacity (Super Admin only)",
)
def update_capacity(
    event_date: str,
    payload: UpdateCapacityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """
    Update the daily ticket capacity for a specific festival date.
    Authorized exclusively for users with the 'super_admin' role.

    Enforces validation:
    - Target date must be within 11-20 October 2026
    - Capacity must be a strictly positive integer (> 0)
    - Capacity cannot be reduced below the count of confirmed/sold tickets
    """
    try:
        parsed_date = capacity_service.parse_event_date(event_date)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    try:
        updated_data = capacity_service.update_daily_capacity(
            db=db,
            event_date=parsed_date,
            new_capacity=payload.capacity,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return {
        "success": True,
        "message": f"Daily ticket capacity updated successfully for {updated_data['formatted_date']}.",
        "data": updated_data,
    }

