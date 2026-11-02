from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ReservationStatus(StrEnum):
    HELD = "held"
    PAID = "paid"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


_STATUS_VALUES = ", ".join(f"'{status.value}'" for status in ReservationStatus)


class Reservation(Base):
    """One seat on one trip between two stops."""

    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(
            "origin_position < destination_position",
            name="ck_reservations_origin_before_destination",
        ),
        CheckConstraint("seat_number > 0", name="ck_reservations_seat_number_positive"),
        CheckConstraint("price_cents >= 0", name="ck_reservations_price_non_negative"),
        CheckConstraint(f"status IN ({_STATUS_VALUES})", name="ck_reservations_status_valid"),
        Index("ix_reservations_user_id", "user_id"),
        Index("ix_reservations_trip_id", "trip_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"))
    seat_number: Mapped[int]
    origin_position: Mapped[int]
    destination_position: Mapped[int]
    status: Mapped[str] = mapped_column(
        String(10),
        default=ReservationStatus.HELD,
        server_default=ReservationStatus.HELD.value,
    )
    price_cents: Mapped[int]
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SeatLeg(Base):
    """A seat on one leg of one trip. A row existing means the seat is taken there."""

    __tablename__ = "seat_legs"
    __table_args__ = (
        UniqueConstraint(
            "trip_id",
            "seat_number",
            "leg_index",
            name="uq_seat_legs_trip_id_seat_number_leg_index",
        ),
        CheckConstraint("seat_number > 0", name="ck_seat_legs_seat_number_positive"),
        CheckConstraint("leg_index >= 1", name="ck_seat_legs_leg_index_positive"),
        Index("ix_seat_legs_reservation_id", "reservation_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"))
    seat_number: Mapped[int]
    leg_index: Mapped[int]
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
