# Changelog

All notable changes to this project are documented here, one block per phase.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/Prabovn7/bus-ticket-api/releases/tag/v0.1.0
