from datetime import datetime

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


class City(Base):
    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint(
        "name", "uf", name="uq_cities_name_uf"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    uf: Mapped[str] = mapped_column(String(2))


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class RouteStop(Base):
    __tablename__ = "route_stops"
    __table_args__ = (
        UniqueConstraint("route_id", "city_id",
                         name="uq_route_stops_route_id_city_id"),
        CheckConstraint("offset_minutes >= 0",
                        name="ck_route_stops_offset_non_negative"),
        CheckConstraint("price_to_next_cents >= 0",
                        name="ck_route_stops_price_non_negative"),
        Index("ix_route_stops_city_id", "city_id"),
    )

    route_id: Mapped[int] = mapped_column(
        ForeignKey("routes.id"), primary_key=True)
    position: Mapped[int] = mapped_column(
        primary_key=True, autoincrement=False)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    offset_minutes: Mapped[int]
    price_to_next_cents: Mapped[int | None]


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_trips_capacity_positive"),
        Index("ix_trips_route_id_departure_at", "route_id", "departure_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int] = mapped_column(default=40, server_default="40")
