from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.catalog import service
from app.catalog.schemas import CityOut, TripResult
from app.core.db import get_session

router = APIRouter(prefix="/api", tags=["catalog"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/cities", response_model=list[CityOut])
def list_cities(session: SessionDep):
    return service.list_cities(session)


@router.get("/trips", response_model=list[TripResult])
def search_trips(
    session: SessionDep,
    origin: int,
    destination: int,
    day: Annotated[date, Query(alias="date")],
):
    return service.search_trips(session, origin, destination, day)
