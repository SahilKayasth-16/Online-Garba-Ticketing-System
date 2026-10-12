"""add_cash_and_razorpay_fields_to_bookings

Revision ID: c7a1024b8d91
Revises: b4d91361c7e2
Create Date: 2026-10-12 13:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7a1024b8d91'
down_revision: Union[str, Sequence[str], None] = 'b4d91361c7e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('cash_collected_by_user_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_bookings_cash_collected_by_user_id_users',
        'bookings',
        'users',
        ['cash_collected_by_user_id'],
        ['id'],
        ondelete='SET NULL'
    )
    op.add_column('bookings', sa.Column('cash_collected_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('razorpay_order_id', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_bookings_razorpay_order_id'), 'bookings', ['razorpay_order_id'], unique=False)
    op.add_column('bookings', sa.Column('razorpay_payment_id', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_bookings_razorpay_payment_id'), 'bookings', ['razorpay_payment_id'], unique=False)
    op.add_column('bookings', sa.Column('razorpay_signature', sa.String(length=255), nullable=True))
    op.add_column('bookings', sa.Column('razorpay_qr_id', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_bookings_razorpay_qr_id'), 'bookings', ['razorpay_qr_id'], unique=False)
    op.add_column('bookings', sa.Column('payment_qr_payload', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_index(op.f('ix_bookings_razorpay_qr_id'), table_name='bookings')
    op.drop_index(op.f('ix_bookings_razorpay_payment_id'), table_name='bookings')
    op.drop_index(op.f('ix_bookings_razorpay_order_id'), table_name='bookings')
    op.drop_column('bookings', 'payment_qr_payload')
    op.drop_column('bookings', 'razorpay_qr_id')
    op.drop_column('bookings', 'razorpay_signature')
    op.drop_column('bookings', 'razorpay_payment_id')
    op.drop_column('bookings', 'razorpay_order_id')
    op.drop_column('bookings', 'cash_collected_at')
    op.drop_constraint('fk_bookings_cash_collected_by_user_id_users', 'bookings', type_='foreignkey')
    op.drop_column('bookings', 'cash_collected_by_user_id')

