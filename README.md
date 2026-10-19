# bus-ticket-api

Bus ticket sales API with seat reservation per route segment, built so that two passengers never buy the same seat on the same segment, even under concurrent requests.

**Status:** in progress. The catalog (cities, routes, trips and trip search) is done. Bookings, users, payments, the real-time seat map and the screens are next.

## What it solves

A bus route has several stops. A seat is sold per **segment**, the stretch between two consecutive stops, so the same seat can be sold to different passengers on different parts of the same trip, as long as their segments don't overlap.

The central requirement is consistency under concurrency: two buyers asking for the same seat on the same segment at the same time must never both succeed.

## Architecture

A single FastAPI service split into modules (a modular monolith). The reasoning, the rejected alternatives and the consequences are in [ADR 0001](docs/adr/0001-monolito-modular.md), written in Portuguese.

- Each module owns its models and follows `router` → `service` → database, with the transaction in the `service`.
- Dependencies go one way only: `booking` depends on `catalog`, and `payments` depends on `booking`.
- PostgreSQL is the source of truth.
- Redis holds no truth. It is only a pub/sub channel for the real-time seat map, so if it goes down no reservation is lost.

## Stack

| Area | Technology |
|---|---|
| Language | Python 3.12 |
| API | FastAPI, Pydantic Settings |
| Database | PostgreSQL 16, SQLAlchemy 2, Alembic |
| Cache and messaging | Redis 7 |
| Quality | pytest, Ruff, GitHub Actions |
| Local environment | Docker Compose |

Planned for the screens: Jinja2 and HTMX.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/cities` | List cities |
| GET | `/api/trips?origin=<city id>&destination=<city id>&date=<YYYY-MM-DD>` | Search trips between two cities on a day |

FastAPI serves interactive docs at `/docs` while the app is running.

## Data model

| Table | Purpose |
|---|---|
| `cities` | City name and state, unique per pair |
| `routes` | A named route |
| `route_stops` | Ordered stops of a route, with minutes after departure and the price to the next stop in cents |
| `trips` | A departure of a route, with its capacity (40 seats by default) |

Migrations live in `migrations/` and are managed with Alembic.

## Run it locally

You need Python 3.12 and Docker.

```bash
git clone https://github.com/Prabovn7/bus-ticket-api.git
cd bus-ticket-api

python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

# copy .env.example to .env and set POSTGRES_PASSWORD
docker compose up -d

alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload
```

The seed creates four cities, one route (São Paulo to Uberaba) and two daily departures for the next seven days. It is safe to run more than once.

Then open `http://127.0.0.1:8000/docs`.

## Tests and lint

```bash
ruff check .
pytest
```

The tests run against PostgreSQL, so start it with `docker compose up -d` first. They create and migrate a separate database named `<POSTGRES_DB>_test`, so your development data is not touched. They cover configuration, the database layer, the health check, the catalog models, trip search and the seed.

The same checks run on every pull request and on pushes to `main`, using PostgreSQL and Redis service containers (see `.github/workflows/ci.yml`).

## Project structure

```text
app/
  main.py          application factory and /health
  core/            settings, database session, error handlers
  catalog/         models, schemas, service and router
migrations/        Alembic migrations
scripts/seed.py    sample data for local development
tests/             pytest suite
docs/adr/          architecture decision records
```

## Roadmap

- [x] Catalog: cities, routes, trips and trip search
- [ ] Users
- [ ] Bookings: seat reservation per segment with concurrency control
- [ ] Payments
- [ ] Real-time seat map over Redis pub/sub
- [ ] Screens with Jinja2 and HTMX
- [ ] Deploy
