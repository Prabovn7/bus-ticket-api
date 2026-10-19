from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.models import City, Route, RouteStop, Trip
from app.core.db import SessionLocal

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
CAPACITY = 40
DAYS = 7
DEPARTURE_TIMES = (time(8, 0), time(23, 0))

CITIES = [
    ("São Paulo", "SP"),
    ("Campinas", "SP"),
    ("Ribeirão Preto", "SP"),
    ("Uberaba", "MG"),
]

ROUTE_NAME = "São Paulo - Uberaba"

# (city name, uf, minutes after departure, price to the next stop in cents)
STOPS = [
    ("São Paulo", "SP", 0, 3500),
    ("Campinas", "SP", 90, 6000),
    ("Ribeirão Preto", "SP", 270, 5500),
    ("Uberaba", "MG", 390, None),
]


def get_or_create_city(session: Session, name: str, uf: str) -> City:
    city = session.scalar(select(City).where(City.name == name, City.uf == uf))
    if city is None:
        city = City(name=name, uf=uf)
        session.add(city)
        session.flush()
    return city


def get_or_create_route(session: Session) -> Route:
    route = session.scalar(select(Route).where(Route.name == ROUTE_NAME))
    if route is None:
        route = Route(name=ROUTE_NAME)
        session.add(route)
        session.flush()
        for position, (name, uf, offset, price) in enumerate(STOPS, start=1):
            city = get_or_create_city(session, name, uf)
            session.add(
                RouteStop(
                    route_id=route.id,
                    position=position,
                    city_id=city.id,
                    offset_minutes=offset,
                    price_to_next_cents=price,
                )
            )
        session.flush()
    return route


def seed(session: Session, start: date | None = None) -> None:
    """Populate the catalog. Safe to run more than once. The caller commits."""
    for name, uf in CITIES:
        get_or_create_city(session, name, uf)
    route = get_or_create_route(session)

    first_day = start or datetime.now(SAO_PAULO).date()
    for day_offset in range(DAYS):
        day = first_day + timedelta(days=day_offset)
        for at in DEPARTURE_TIMES:
            departure = datetime.combine(day, at, tzinfo=SAO_PAULO)
            exists = session.scalar(
                select(Trip.id).where(Trip.route_id == route.id, Trip.departure_at == departure)
            )
            if exists is None:
                session.add(Trip(route_id=route.id, departure_at=departure, capacity=CAPACITY))
    session.flush()


if __name__ == "__main__":
    with SessionLocal() as session:
        seed(session)
        session.commit()
    print("Seed done.")
