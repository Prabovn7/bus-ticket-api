from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Interval, func, select
from sqlalchemy.orm import Session, aliased

from app.catalog.models import City, RouteStop, Trip
from app.catalog.schemas import TripResult
from app.core.errors import CityNotFound, InvalidSearch

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def list_cities(session: Session) -> list[City]:
    return list(session.scalars(select(City).order_by(City.name)))


def _plus_minutes(moment, minutes):
    """SQL expression for moment + minutes, computed by PostgreSQL."""
    return moment + func.make_interval(0, 0, 0, 0, 0, minutes, type_=Interval)


def _local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Start (inclusive) and end (exclusive) of the day in São Paulo time."""
    start = datetime.combine(day, time.min, tzinfo=SAO_PAULO)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=SAO_PAULO)
    return start, end


def search_trips(
    session: Session, origin_city_id: int, destination_city_id: int, day: date
) -> list[TripResult]:
    if origin_city_id == destination_city_id:
        raise InvalidSearch()

    wanted = {origin_city_id, destination_city_id}
    found = set(session.scalars(select(City.id).where(City.id.in_(list(wanted)))))
    if found != wanted:
        raise CityNotFound()

    start, end = _local_day_bounds(day)
    origin_stop = aliased(RouteStop)
    destination_stop = aliased(RouteStop)
    leg = aliased(RouteStop)

    departure = _plus_minutes(Trip.departure_at, origin_stop.offset_minutes)
    arrival = _plus_minutes(Trip.departure_at, destination_stop.offset_minutes)
    price = (
        select(func.sum(leg.price_to_next_cents))
        .where(
            leg.route_id == origin_stop.route_id,
            leg.position >= origin_stop.position,
            leg.position < destination_stop.position,
        )
        .correlate(origin_stop, destination_stop)
        .scalar_subquery()
    )

    stmt = (
        select(
            Trip.id.label("trip_id"),
            departure.label("departure_at"),
            arrival.label("arrival_at"),
            price.label("price_cents"),
            Trip.capacity,
        )
        .select_from(Trip)
        .join(origin_stop, origin_stop.route_id == Trip.route_id)
        .join(
            destination_stop,
            (destination_stop.route_id == Trip.route_id)
            & (destination_stop.position > origin_stop.position),
        )
        .where(
            origin_stop.city_id == origin_city_id,
            destination_stop.city_id == destination_city_id,
            departure >= start,
            departure < end,
        )
        .order_by(departure)
    )
    return [TripResult(**row._mapping) for row in session.execute(stmt)]
