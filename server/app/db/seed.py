"""
Database seed module.

The Online Garba Ticketting System application does not use
automatic/demo seed data.

All application data must come from the actual database and
authenticated application workflows.

This module intentionally does not create:
- Demo events
- Demo ticket types
- Demo bookings
- Demo users
- Demo ticket data
- Sample/placeholder records
"""

def seed_database() -> None:
    """
    Intentionally does nothing.

    No dummy or sample data should ever be inserted automatically.
    """
    return None

if __name__ == "__main__":
    seed_database()