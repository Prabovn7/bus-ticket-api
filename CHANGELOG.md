# Changelog

All notable changes to this project are documented here, one block per phase.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-02

Phase 2: seat holds, with the database deciding who gets a seat.

### Added

- Tables `reservations` and `seat_legs` (migration `booking`). `seat_legs` has
  `UNIQUE(trip_id, seat_number, leg_index)`: one seat on one leg can belong to one reservation
  at most ([ADR 0004](docs/adr/0004-assento-unico-por-perna.md)).
- `POST /api/trips/{id}/holds`: holds a seat for 10 minutes. Every leg is inserted with
  `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at < now`: a free leg is inserted, an
  overdue leg is taken over, and a leg with a live hold is refused. If any leg is refused, the
  transaction is rolled back and the response is `409 seat_unavailable`. The response includes
  `expires_in_seconds`, computed on the server and rounded down.
- Lazy expiry: a leg whose hold has passed is taken over by the next buyer at once, so a seat is
  never stuck while no cleanup process is running.
- Active expiry: `expire_holds` marks overdue reservations as `expired` and removes only the legs
  that are still theirs (`FOR UPDATE SKIP LOCKED`, in batches). It runs as a separate process,
  `python -m app.booking.expirer`, every 30 seconds, with a clean stop on `SIGINT` and `SIGTERM`
  ([ADR 0005](docs/adr/0005-expirador-de-holds-em-processo-separado.md)).
- `GET /api/trips/{id}/seats` (seat map: `free`, `held`, `taken`) and
  `GET /api/trips/availability` (free seats for up to 50 trips). Both treat an overdue hold as
  free.
- An injectable clock (`Clock`, `get_clock`) so that expiry tests never sleep.
- Front end: a trip page with an accessible seat grid, free seats shown in the trip search, and a
  hold flow with a countdown. The countdown uses the seconds sent by the server and a monotonic
  clock ([ADR 0006](docs/adr/0006-contador-do-hold-com-relogio-monotonico.md)). The page handles
  conflicts, expiry, a lost session (sends the person to sign in and back to the same trip, with
  the redirect limited to same-origin paths) and a double click.
- Tests: 100 simultaneous attempts on the same seat and leg with exactly one success, lazy and
  active expiry, the expirer loop, the seat map and availability queries, and the front-end seat
  and hold flows. 175 backend tests and 349 front-end tests.

### Changed

- Docker Compose publishes PostgreSQL and Redis on `127.0.0.1` only.
- The refresh cookie is `Secure` by default (`COOKIE_SECURE=true`).
- The README (English and Portuguese) documents the new endpoints, the expirer and the Phase 2
  limitations.

### Known limitations

See "Limitations and next steps" in the [README](README.md), section "Seat holds".

## [0.1.0] - 2026-10-25

Phase 1: structure, catalog, trip search, accounts and the first front end.

### Added

- Project structure as a modular monolith (`core`, `users`, `catalog`), with Docker Compose for
  PostgreSQL 16 and Redis 7, FastAPI, SQLAlchemy 2 and Alembic migrations.
- Catalog of cities, routes, stops and trips, loaded by an idempotent seed script
  (`python -m scripts.seed`).
- Trip search: `GET /api/trips` by origin, destination and date, with the price summed over the
  legs between the two cities. `GET /api/cities` lists the cities.
- Accounts and authentication: sign up, sign in, refresh, sign out and `GET /api/auth/me`.
  Short-lived access token (15 minutes) held in memory by the browser, and an opaque refresh
  token stored hashed and rotated atomically in a single `UPDATE`. Reusing a refresh token
  revokes the whole family. Passwords use Argon2id. Sign-in returns a single error message for
  an unknown e-mail and a wrong password.
- Consistent error contract for domain errors: `{ "code": "...", "message": "..." }`.
- React and TypeScript front end in `web/` (Ônibora): trip search with a flap-style departure
  board, sign in and sign up pages, light and dark themes with a manual toggle, and a holographic
  card used for the "simulated payments" notice.
- Animated road scene in the page header, built with SVG and CSS, with a pause button
  (WCAG 2.2.2). Route transitions, departure board and card effects use GSAP.
- Accessibility: focus moves to the page title and the tab title changes on every route change,
  focus goes to the first invalid field when signing up, reduced-motion support everywhere, and
  tested color contrast for the theme button, the header brand and the card glow.
- Continuous integration on GitHub Actions: `ci` (ruff and pytest against PostgreSQL and Redis)
  and `web` (Prettier, ESLint, Vitest and the production build).
- Documentation: README in English and Portuguese with an architecture diagram and screenshots,
  and architecture decision records 0001 (modular monolith), 0002 (React and TypeScript front
  end) and 0003 (authentication).

### Fixed

- The header brand had no color of its own and inherited the browser's default link color, which
  was almost unreadable on the dark header in the light theme.

### Known limitations

See "Limitations and next steps" in the [README](README.md).

[0.2.0]: https://github.com/Prabovn7/bus-ticket-api/releases/tag/v0.2.0
[0.1.0]: https://github.com/Prabovn7/bus-ticket-api/releases/tag/v0.1.0
