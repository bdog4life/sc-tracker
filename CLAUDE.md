# SC Tracker — Claude Context

## What this is
A Star Citizen game session tracker. Three parts:
1. **Local Windows agent** (`agent/`) — tails `Game.log`, parses events, ships them over WebSocket
2. **Backend server** (`server/`) — receives events, stores in PostgreSQL, exposes REST API
3. **Shared types** (`shared/`) — TypeScript types used by both

The agent runs on players' PCs as a `.exe`. The server runs on Replit.

## Current state
Phase 1 (data pipeline) is complete and locally tested. You are likely here to **deploy the server to this Replit project**.

## Deploying the server

### Run command
```
cd server && npm install && npx tsx src/main.ts
```

### Required environment variables (set as Replit Secrets)
- `DATABASE_URL` — PostgreSQL connection string (Helium DB from existing MH site project)
- `JWT_SECRET` — random 64-char string for signing agent tokens
- `DISCORD_CLIENT_ID` — from Discord OAuth app
- `DISCORD_CLIENT_SECRET` — from Discord OAuth app  
- `DISCORD_REDIRECT_URI` — `https://[this-repl-url].replit.app/auth/discord/callback`
- `PORT` — Replit sets this automatically, server reads it

### What happens on first boot
`migrate()` runs automatically and creates the `sc_tracker` schema + 5 tables in the existing PostgreSQL database. It uses `CREATE SCHEMA IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` — safe to run repeatedly, won't touch existing tables.

### After deploy
1. Add the `DISCORD_REDIRECT_URI` above to the Discord app's OAuth2 redirect list at discord.com/developers
2. Users run the agent `.exe`, it opens a browser to `/auth/discord?agent=1`, completes OAuth, gets a JWT stored in `%APPDATA%\SCTracker\config.json`
3. Agent connects to `wss://[this-repl-url].replit.app/ws/agent` and streams events

## Architecture notes
- WebSocket endpoint is at `/ws/agent` (not `/`)
- Agent config `serverUrl` must include the full path: `wss://host/ws/agent`
- Events are stored in `sc_tracker.events` as JSONB — new event types need no schema changes
- The `sc_tracker` schema is isolated from all existing MH site tables

## Key files
- `server/src/main.ts` — Express app, mounts routes, upgrades WS, runs migrations on start
- `server/src/db/migrate.ts` — creates schema and all tables
- `server/src/ws/handler.ts` — WebSocket auth handshake + event storage
- `server/src/routes/auth.ts` — Discord OAuth flow + token endpoint
- `shared/types.ts` — all event types and WebSocket protocol types
