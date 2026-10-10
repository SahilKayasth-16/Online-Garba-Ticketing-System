"""create_tickets_and_scan_logs_tables

Revision ID: b4d91361c7e2
Revises: a3c585af8f11
Create Date: 2026-10-10 22:30:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d91361c7e2'
down_revision: Union[str, Sequence[str], None] = 'a3c585af8f11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create tickets table
    op.create_table(
        'tickets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ticket_number', sa.String(length=64), nullable=False),
        sa.Column('ticket_token', sa.String(length=128), nullable=False),
        sa.Column('booking_id', sa.Integer(), nullable=False),
        sa.Column('event_date', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='valid', nullable=False),
        sa.Column('entry_status', sa.String(length=50), server_default='unused', nullable=False),
        sa.Column('entry_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['verified_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tickets_id'), 'tickets', ['id'], unique=False)
    op.create_index(op.f('ix_tickets_ticket_number'), 'tickets', ['ticket_number'], unique=True)
    op.create_index(op.f('ix_tickets_ticket_token'), 'tickets', ['ticket_token'], unique=True)
    op.create_index(op.f('ix_tickets_booking_id'), 'tickets', ['booking_id'], unique=False)
    op.create_index(op.f('ix_tickets_event_date'), 'tickets', ['event_date'], unique=False)

    # 2. Create scan_logs table
    op.create_table(
        'scan_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=True),
        sa.Column('ticket_number', sa.String(length=64), nullable=True),
        sa.Column('scanned_identifier', sa.String(length=128), nullable=False),
        sa.Column('event_date', sa.String(length=50), nullable=True),
        sa.Column('scan_result', sa.String(length=50), nullable=False),
        sa.Column('message', sa.String(length=255), nullable=False),
        sa.Column('scanned_by_user_id', sa.Integer(), nullable=True),
        sa.Column('scanned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['scanned_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_scan_logs_id'), 'scan_logs', ['id'], unique=False)
    op.create_index(op.f('ix_scan_logs_ticket_id'), 'scan_logs', ['ticket_id'], unique=False)
    op.create_index(op.f('ix_scan_logs_ticket_number'), 'scan_logs', ['ticket_number'], unique=False)
    op.create_index(op.f('ix_scan_logs_event_date'), 'scan_logs', ['event_date'], unique=False)
    op.create_index(op.f('ix_scan_logs_scan_result'), 'scan_logs', ['scan_result'], unique=False)
    op.create_index(op.f('ix_scan_logs_scanned_by_user_id'), 'scan_logs', ['scanned_by_user_id'], unique=False)
    op.create_index(op.f('ix_scan_logs_scanned_at'), 'scan_logs', ['scanned_at'], unique=False)

    # 3. Backfill individual tickets for any existing bookings
    bind = op.get_bind()
    bookings_res = bind.execute(sa.text("SELECT id, booking_id, event_date, quantity FROM bookings"))
    existing_bookings = bookings_res.fetchall()

    tickets_table = sa.table(
        'tickets',
        sa.column('ticket_number', sa.String),
        sa.column('ticket_token', sa.String),
        sa.column('booking_id', sa.Integer),
        sa.column('event_date', sa.String),
        sa.column('status', sa.String),
        sa.column('entry_status', sa.String),
    )

    tickets_to_insert = []
    for b in existing_bookings:
        b_id = b[0]
        b_booking_id = b[1]
        b_date = b[2]
        b_qty = b[3]
        for i in range(1, b_qty + 1):
            t_num = f"{b_booking_id}-{i:02d}"
            t_token = f"OGTS-TKT-{uuid.uuid4().hex.upper()}"
            tickets_to_insert.append({
                'ticket_number': t_num,
                'ticket_token': t_token,
                'booking_id': b_id,
                'event_date': b_date,
                'status': 'valid',
                'entry_status': 'unused',
            })

    if tickets_to_insert:
        op.bulk_insert(tickets_table, tickets_to_insert)


def downgrade() -> None:
    op.drop_index(op.f('ix_scan_logs_scanned_at'), table_name='scan_logs')
    op.drop_index(op.f('ix_scan_logs_scanned_by_user_id'), table_name='scan_logs')
    op.drop_index(op.f('ix_scan_logs_scan_result'), table_name='scan_logs')
    op.drop_index(op.f('ix_scan_logs_event_date'), table_name='scan_logs')
    op.drop_index(op.f('ix_scan_logs_ticket_number'), table_name='scan_logs')
    op.drop_index(op.f('ix_scan_logs_ticket_id'), table_name='scan_logs')
    op.drop_index(op.f('ix_scan_logs_id'), table_name='scan_logs')
    op.drop_table('scan_logs')

    op.drop_index(op.f('ix_tickets_event_date'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_booking_id'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_ticket_token'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_ticket_number'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_id'), table_name='tickets')
    op.drop_table('tickets')

