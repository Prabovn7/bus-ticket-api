from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PaymentStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"
    REFUNDED = "refunded"


_STATUS_VALUES = ", ".join(f"'{status.value}'" for status in PaymentStatus)


class Payment(Base):
    """One charge attempt for a reservation."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_cents >= 0", name="ck_payments_amount_non_negative"),
        CheckConstraint(f"status IN ({_STATUS_VALUES})", name="ck_payments_status_valid"),
        Index("ix_payments_reservation_id", "reservation_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"))
    amount_cents: Mapped[int]
    status: Mapped[str] = mapped_column(
        String(10),
        default=PaymentStatus.PENDING,
        server_default=PaymentStatus.PENDING.value,
    )
    gateway_ref: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IdempotencyKey(Base):
    """A client-chosen key, scoped to one user. response_status NULL means in progress."""

    __tablename__ = "idempotency_keys"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    response_status: Mapped[int | None]
    response_body: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
