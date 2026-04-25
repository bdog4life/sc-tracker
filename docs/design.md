# SC Tracker — Design Spec
**Date:** 2026-04-25
**Status:** Approved

## Overview

A Star Citizen game session tracker with three parts: a lightweight Windows background agent that tails each user's `Game.log`, a shared backend API on an existing Replit/PostgreSQL deployment, and a web dashboard + Discord bot for viewing stats and receiving notifications. Inspired by the now-outdated CitizenStats project, but designed to track every parseable event in the current log format and stay maintainable as CIG changes formats over time.

---

## Architecture

```
Game.log (user's PC)
     ↓ tailed in real-time
[Local Agent — .exe ~25MB]
     ↓ WebSocket (token auth)
[Backend API — Replit/Node.js]
     ├── REST + SSR → [Web Dashboard]  ← Discord OAuth (existing)
     └── discord.js → [Discord Bot]   → channel notifications
```

All components are TypeScript/Node.js in a single monorepo. The backend shares the existing site's Replit PostgreSQL (Helium) database under a dedicated `sc_tracker` schema, leaving MH site tables untouched.

---

## Component 1: Local Agent

**Distribution:** Single `.exe` compiled with `pkg` (~25MB). Users download and run — no installer, no runtime required.

**Behavior:**
- Runs as a Windows system tray icon
- On first launch: opens browser to `/auth/discord` on the backend, completes OAuth, stores token in `%APPDATA%\SCTracker\config.json`
- Tails `Game.log` continuously using a file watcher with tail-from-last-position logic (handles game restarts, log rotation)
- Parses new lines through the event registry, drops unrecognized lines silently
- Sends parsed events to backend via persistent WebSocket, with reconnect on disconnect
- Never sends raw log lines — only structured parsed fields (privacy)

**Tray menu:**
- Open Dashboard (opens browser to the web dashboard)
- Open Local View (opens browser to `localhost:PORT` — own stats without internet)
- Settings (configure log path, notification preferences)
- Quit

**Config file** (`%APPDATA%\SCTracker\config.json`):
```json
{
  "token": "...",
  "logPath": "D:\\Roberts Space Industries\\StarCitizen\\PTU\\Game.log",
  "localPort": 9242
}
```

Log path is auto-detected on first run by scanning known SC install paths; user can override.

---

## Component 2: Backend API

**Runtime:** Node.js/TypeScript on Replit, same deployment as existing MH site.

**Transport:** WebSocket endpoint at `/ws/agent` for agent connections. REST endpoints at `/api/tracker/*` for dashboard. Discord OAuth reuses existing site credentials.

**Responsibilities:**
- Authenticate agent WebSocket connections via stored token
- Receive and persist parsed events
- Serve REST API for dashboard queries (stats, sessions, leaderboard)
- Trigger Discord bot notifications for notable events
- Generate session reports on `SESSION_END`

---

## Component 3: Database (`sc_tracker` schema)

PostgreSQL schema on the existing Replit Helium database.

**`sc_tracker.users`**
```
id, discord_id, discord_username, discord_avatar, token, created_at, updated_at
```

**`sc_tracker.sessions`**
```
id, user_id, character_name, game_version, game_branch, started_at, ended_at, duration_secs
```

**`sc_tracker.events`**
```
id, session_id, user_id, event_type, occurred_at, payload JSONB, parser_version
```

**`sc_tracker.ships`**
```
id, user_id, entitlement_urn, display_name, claims_count, last_claimed_at
```

**`sc_tracker.discord_notifications`**
```
id, event_id, channel_id, sent_at, message_preview
```

The `payload` JSONB column holds all event-specific fields. New event types require no schema migration.

---

## Component 4: Log Parser

A registry of pattern matchers. Each entry is:
```typescript
{
  type: string,
  match: (line: string) => boolean,
  parse: (line: string, timestamp: Date) => EventPayload | null
}
```

**Events parsed from current SC 4.8 log format:**

| Event Type | Log Source | Key Fields |
|---|---|---|
| `SESSION_START` | `Log started on` + `FileVersion` + character name | `gameVersion`, `gameBranch`, `characterName` |
| `SESSION_END` | `SystemQuit` or file close | `duration` |
| `ZONE_ENTERED` | `SHUDEvent_OnNotification` "Entered X" | `zoneName`, `jurisdictionType` |
| `LOCATION_CHANGE` | `Update Inventory Location` | `locationId`, `landingZoneId` |
| `GEAR_LOADOUT` | `AttachmentReceived` (batched at login) | `items[]` with slot, itemClass, itemId |
| `MISSION_START` | `CSubsumptionMissionComponent::CreateMissionInstance` | `missionType`, `missionId` |
| `MISSION_END` | `EndMission` / `MissionEnded` | `missionId`, `outcome` |
| `SHIP_CLAIM` | `CWallet::ProcessClaimToNextStep` "New Insurance Claim" | `entitlementUrn`, `requestId` |
| `KILL` | TBD — awaiting combat log samples | `victim`, `weapon`, `zone`, `shipName` |
| `DEATH` | TBD — awaiting combat log samples | `killer`, `weapon`, `zone` |

**Format resilience:**
- Each event carries `parser_version` so old stored events remain valid if regexes change
- Unknown lines are silently dropped — agent never crashes on unrecognized content
- Community can contribute new patterns as CIG updates log format

---

## Component 5: Web Dashboard

New routes added to existing site:

| Route | Content |
|---|---|
| `/tracker` | Personal overview — current/recent session, lifetime totals |
| `/tracker/sessions` | Session history list with per-session reports |
| `/tracker/sessions/:id` | Single session: timeline of events, zones, missions, kills |
| `/tracker/leaderboard` | Community rankings by kills, missions, session time, ships lost |
| `/tracker/players/:discordId` | Public profile for any linked player |

Auth: existing Discord OAuth. First visit auto-creates `sc_tracker.users` row.

---

## Component 6: Discord Bot

Added to existing backend process using discord.js.

**Automatic notifications** (to configured channel):

| Trigger | Message format |
|---|---|
| PvP kill | `{player} took down {victim} with {weapon} in {zone}` |
| Ship lost | `{player} lost their ship and filed an insurance claim` |
| Mission completed | `{player} completed a {type} mission in {system}` |
| Session end | `{player} logged off after {duration} — {missions} missions, {kills} kills, {deaths} deaths` |

**Slash commands:**
- `/sc-stats [player]` — lifetime stats for self or named player
- `/sc-session [player]` — last session summary
- `/sc-leaderboard [category]` — top players

**Configuration:** which event types fire notifications, target channel ID, per-user opt-out flag in `sc_tracker.users`.

---

## Deployment Plan

1. Develop and test locally on Windows (agent tailing real `Game.log`)
2. Once stable: deploy backend to existing Replit project alongside MH site
3. Run `sc_tracker` schema migrations against existing Helium PostgreSQL
4. Reuse existing Discord OAuth app credentials

---

## Open Items

- **Combat log patterns:** Kill/death regex patterns pending — user will provide combat session log samples from community
- **Location ID mapping:** `locationId` values in `LOCATION_CHANGE` are numeric; need a lookup table mapping IDs to human-readable station/planet names
- **Live vs PTU:** Log path differs between LIVE and PTU installs; agent should detect and label which branch events come from (already in `game_branch` field)
