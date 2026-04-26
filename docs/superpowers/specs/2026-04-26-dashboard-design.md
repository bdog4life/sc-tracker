# SC Tracker — Web Dashboard Design Spec
**Date:** 2026-04-26
**Status:** Approved

## Overview

Server-side rendered web dashboard for the SC Tracker, added directly to the existing sc-tracker Express/Replit server. Auth-gated via Discord OAuth session cookies — every route requires login. Five pages covering personal stats, session history, session detail timelines, community leaderboard, and public player profiles.

---

## Architecture

EJS templates rendered by new Express route handlers in `server/src/routes/dashboard.ts`. Static assets (one CSS file) served from `server/public/`. Session middleware in `server/src/middleware/session.ts` protects all `/tracker/*` routes.

No separate frontend deploy. No client-side framework. No build step. One small `<script>` block per page for the theme toggle only.

```
GET /tracker/*
     ↓ session middleware (redirect to /auth/discord?dashboard=1 if not authed)
     ↓ route handler queries pg pool directly
     ↓ res.render('template.ejs', data)
     → HTML response
```

---

## Auth Flow

Discord OAuth entry point already exists at `GET /auth/discord`. A new `dashboard` query param signals that after OAuth the user should be redirected to `/tracker` (instead of receiving a token string). The callback upserts the user in `sc_tracker.users` (same as agent flow), then sets a signed session cookie via `express-session`.

Session store: `connect-pg-simple` using the existing Postgres connection. Sessions live in a `public.session` table (outside the `sc_tracker` schema — managed automatically by the library).

---

## Theme System

Two dark themes: **dark-purple** (default, navy + indigo accents) and **dark-amber** (near-black + gold accents). Theme preference is stored in the session.

Toggle: a moon/sun icon in the nav bar posts to `POST /tracker/theme` with `{theme: 'dark-purple' | 'dark-amber'}` and a hidden `redirect` field containing the current page path. The handler saves to the session and redirects to that path. The `<html>` element gets a `data-theme` attribute; CSS custom properties handle the rest.

---

## Pages

### `GET /tracker` — Personal Overview
Auth-gated to the logged-in user's own data.

**Stat bar (6 items):**
- Total playtime (sum of `duration_secs` across all sessions)
- Session count
- Mission count (events of type `MISSION_START`)
- Ships lost (events of type `SHIP_CLAIM`)
- Zones visited (events of type `ZONE_ENTERED`)
- Leaderboard rank (position in the missions leaderboard)

**Hero last session card:**
- Start time, duration, game version, branch (LIVE/PTU)
- Zone count, mission count, ship losses, blueprint count for that session
- "View details →" link to `/tracker/sessions/:id`

**Two-column section below:**
- Left: last 5 sessions (date, duration, game version) with "View →" links
- Right: last 10 events across all sessions (event type, human-readable description, relative time)

---

### `GET /tracker/sessions` — Session History
Full paginated list of the authed user's sessions, newest first. 25 per page.

Each row: start datetime, duration, game version, branch, zone count, mission count, ships lost. Clicking a row navigates to the session detail page.

---

### `GET /tracker/sessions/:id` — Session Detail
Vertical event timeline for a single session. Only accessible if the session belongs to the authed user.

**Header:** character name, game version, branch, start time, duration.

**Timeline:** all events for the session ordered by `occurred_at ASC`. Each event shows:
- Timestamp (relative + absolute on hover)
- Colour-coded dot by event category: purple = session, green = zone/location, amber = ship, blue = mission
- Human-readable description of the event (e.g. "Entered Hurston", "Mission started", "Insurance claim filed")

---

### `GET /tracker/leaderboard` — Community Rankings
All users, ranked by the selected category. Requires auth.

**Tab bar (URL param `?by=missions`):**
- Missions (default) — count of `MISSION_START` events
- Playtime — sum of `duration_secs`
- Sessions — count of sessions
- Ships Lost — count of `SHIP_CLAIM` events
- Zones — count of `ZONE_ENTERED` events

**Table:** rank, Discord avatar + username (linked to their profile), metric value. The logged-in user's row is highlighted. Top 3 get gold/silver/bronze rank indicators.

---

### `GET /tracker/players/:discordId` — Player Profile
Public profile for any registered user. Requires auth to view.

**Header:** Discord avatar, username, member since date, leaderboard rank.

**Stat row:** missions, total playtime, sessions, ships lost.

**Recent sessions list:** last 10 sessions with date, duration, mission count. No link to session detail — session detail pages are owner-only and not accessible from another player's profile.

---

## New Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/tracker` | Personal overview |
| `GET` | `/tracker/sessions` | Session history list |
| `GET` | `/tracker/sessions/:id` | Single session timeline |
| `GET` | `/tracker/leaderboard` | Community leaderboard |
| `GET` | `/tracker/players/:discordId` | Public player profile |
| `POST` | `/tracker/theme` | Save theme preference to session |

The existing `GET /auth/discord` gains a `?dashboard=1` query param that changes the post-OAuth redirect from a token display page to `/tracker`.

---

## File Map

```
server/
├── src/
│   ├── middleware/
│   │   └── session.ts          # express-session setup + requireAuth helper
│   ├── routes/
│   │   └── dashboard.ts        # All 6 dashboard route handlers
│   └── main.ts                 # Mount dashboard router + serve public/
├── views/
│   ├── layout.ejs              # Shared nav, theme attr, CSS link
│   ├── overview.ejs            # /tracker
│   ├── sessions.ejs            # /tracker/sessions
│   ├── session-detail.ejs      # /tracker/sessions/:id
│   ├── leaderboard.ejs         # /tracker/leaderboard
│   └── profile.ejs             # /tracker/players/:discordId
└── public/
    └── tracker.css             # All theme variables + layout + component styles
```

---

## New Dependencies

- `express-session` — session middleware
- `connect-pg-simple` — Postgres session store
- `ejs` — template engine

---

## Data Queries

All queries use the existing `pg` pool. No new REST endpoints.

**Overview stats:** aggregate counts and sums from `sc_tracker.sessions` and `sc_tracker.events` for the authed `user_id`.

**Leaderboard:** `GROUP BY user_id` aggregate on events/sessions joined to `sc_tracker.users`, ordered by the selected metric DESC, limited to 100.

**Session list:** `sc_tracker.sessions WHERE user_id = $1 ORDER BY started_at DESC` with event-type counts via correlated subqueries, paginated.

**Session detail:** `sc_tracker.events WHERE session_id = $1 ORDER BY occurred_at ASC`.

**Player profile:** same aggregates as overview but for a given `discord_id`, plus their last 10 sessions.

---

## Out of Scope

- Kill/death stats (combat log patterns not yet available)
- Location ID → human-readable name mapping (lookup table not yet built)
- Settings page for log path configuration (Phase 3)
- Mobile-specific layout (responsive CSS is fine, native mobile is not in scope)
