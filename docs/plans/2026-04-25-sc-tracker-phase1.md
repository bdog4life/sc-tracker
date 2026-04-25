# SC Tracker — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end event pipeline — Game.log → local agent (parser + WebSocket client + tray icon) → backend server (auth + WebSocket handler + PostgreSQL storage).

**Architecture:** A Node.js agent runs on the user's Windows PC, tails their Game.log, parses lines through a registry of regex patterns, and ships typed events to a remote Replit server over an authenticated WebSocket. The server validates the token, stores each event in `sc_tracker.*` tables on the shared PostgreSQL database, and exposes a REST API for later use. Auth links each agent install to a Discord account via OAuth.

**Tech Stack:** TypeScript 5, Vitest, Express 4, `ws`, `pg`, `chokidar`, `systray2`, `jsonwebtoken`, `pkg` (produces a standalone Windows .exe)

**Scope:** This plan produces a working data pipeline only. Web dashboard and Discord bot are Plan 2.

**Environment variables needed (server):**
- `DATABASE_URL` — Replit PostgreSQL connection string
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — existing Discord OAuth app
- `DISCORD_REDIRECT_URI` — e.g. `https://your-site.replit.app/auth/discord/callback`
- `JWT_SECRET` — random 64-char string, used to sign agent tokens
- `PORT` — defaults to 3000

---

## File Map

```
sc-tracker/
├── shared/
│   └── types.ts                    # ParsedEvent + all payload types (used by both agent and server)
├── agent/
│   ├── src/
│   │   ├── parser/
│   │   │   ├── types.ts            # Pattern interface
│   │   │   ├── patterns.ts         # All regex pattern definitions
│   │   │   └── index.ts            # LogParser class — stateful, emits ParsedEvent[]
│   │   ├── config.ts               # Read/write %APPDATA%\SCTracker\config.json
│   │   ├── watcher.ts              # Tails Game.log line-by-line using chokidar + readline
│   │   ├── client.ts               # WebSocket client — auth handshake + reconnect
│   │   ├── tray.ts                 # Windows system tray icon and menu
│   │   └── main.ts                 # Entry point — wires all modules together
│   ├── tests/
│   │   ├── parser.test.ts          # Unit tests for every parser pattern
│   │   └── config.test.ts          # Config read/write tests
│   ├── package.json
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── client.ts           # pg Pool singleton
│   │   │   └── migrate.ts          # Creates sc_tracker schema + all tables
│   │   ├── auth/
│   │   │   └── tokens.ts           # JWT generate/verify for agent tokens
│   │   ├── routes/
│   │   │   ├── auth.ts             # Discord OAuth flow + agent token endpoint
│   │   │   └── tracker.ts          # GET /api/tracker/sessions + /stats
│   │   ├── ws/
│   │   │   └── handler.ts          # WebSocket upgrade handler — auth + event storage
│   │   └── main.ts                 # Express app, mounts routes, upgrades WS
│   ├── tests/
│   │   ├── migrate.test.ts
│   │   ├── tokens.test.ts
│   │   └── ws.test.ts
│   ├── package.json
│   └── tsconfig.json
└── docs/
    ├── design.md
    └── plans/
        └── 2026-04-25-sc-tracker-phase1.md
```

---

## Task 1: Scaffold project directories and tooling

**Files:**
- Create: `shared/types.ts` (empty for now)
- Create: `agent/package.json`
- Create: `agent/tsconfig.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`

- [ ] **Step 1: Create directory structure**

```bash
cd C:\Claude_Stuff\sc-tracker
mkdir shared agent\src\parser agent\tests server\src\db server\src\auth server\src\routes server\src\ws server\tests
```

- [ ] **Step 2: Create `agent/package.json`**

```json
{
  "name": "sc-tracker-agent",
  "version": "1.0.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc",
    "test": "vitest run",
    "bundle": "npm run build && pkg dist/main.js --target node20-win-x64 --output dist/SCTrackerAgent.exe"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "open": "^10.1.0",
    "systray2": "^1.0.5",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/ws": "^8.5.12",
    "pkg": "^5.8.1",
    "tsx": "^4.15.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  },
  "pkg": {
    "assets": ["node_modules/systray2/build/**/*"],
    "targets": ["node20-win-x64"]
  }
}
```

- [ ] **Step 3: Create `agent/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create `server/package.json`**

```json
{
  "name": "sc-tracker-server",
  "version": "1.0.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.0",
    "jsonwebtoken": "^9.0.2",
    "node-fetch": "^3.3.2",
    "pg": "^8.12.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.0",
    "@types/pg": "^8.11.6",
    "@types/ws": "^8.5.12",
    "tsx": "^4.15.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 5: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 6: Create empty placeholder `shared/types.ts`**

```typescript
// Populated in Task 2
export {};
```

- [ ] **Step 7: Install dependencies**

```bash
cd agent && npm install
cd ../server && npm install
```

- [ ] **Step 8: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add .
git commit -m "feat: scaffold agent and server packages"
```

---

## Task 2: Shared event types

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Write `shared/types.ts`**

```typescript
export type EventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'ZONE_ENTERED'
  | 'LOCATION_CHANGE'
  | 'ATTACHMENT_RECEIVED'
  | 'MISSION_START'
  | 'MISSION_END'
  | 'MISSION_CONTRACT'
  | 'SHIP_CLAIM'
  | 'SHIP_NEARBY'
  | 'ITEM_STORED'
  | 'BLUEPRINT_RECEIVED';

export interface ParsedEvent {
  type: EventType;
  occurredAt: Date;
  parserVersion: number;
  payload: Record<string, unknown>;
}

// Payload shapes — used for type-safe construction in patterns.ts
export interface SessionStartPayload {
  gameVersion: string;
  gameBranch: string;
  characterName: string;
  playerGeid: string;
}

export interface SessionEndPayload {
  reason: string;
}

export interface ZoneEnteredPayload {
  notificationText: string;
  notificationIndex: number;
}

export interface LocationChangePayload {
  playerName: string;
  fromLandingId: string;
  toLandingId: string;
  fromLocationId: string;
  toLocationId: string;
}

export interface AttachmentReceivedPayload {
  playerName: string;
  attachmentName: string;
  itemClass: string;
  itemId: string;
  status: string;
  port: string;
}

export interface MissionStartPayload {
  missionType: string;
  seed: string;
  entityId: string;
}

export interface MissionEndPayload {
  entityId: string;
  event: 'EndMission' | 'MissionEnded';
}

export interface MissionContractPayload {
  variableName: string;
  contractType: string;
  destinations: Array<{ name: string; id: string; zone: string }>;
}

export interface ShipClaimPayload {
  entitlementUrn: string;
  requestId: number;
}

export interface ShipNearbyPayload {
  shipClass: string;
  hostId: string;
}

export interface ItemStoredPayload {
  playerName: string;
  itemName: string;
  itemId: string;
  itemClass: string;
  requestId: number;
}

export interface BlueprintReceivedPayload {
  blueprintName: string;
  notificationIndex: number;
}

// WebSocket protocol messages (agent ↔ server)
export interface WsAuthMessage {
  type: 'auth';
  token: string;
}

export interface WsAuthOkMessage {
  type: 'auth_ok';
  userId: number;
}

export interface WsAuthErrorMessage {
  type: 'auth_error';
  message: string;
}

export interface WsEventMessage {
  type: 'event';
  payload: ParsedEvent;
}

export interface WsAckMessage {
  type: 'ack';
  eventId: number;
}

export type WsClientMessage = WsAuthMessage | WsEventMessage;
export type WsServerMessage = WsAuthOkMessage | WsAuthErrorMessage | WsAckMessage;
```

- [ ] **Step 2: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add shared/types.ts
git commit -m "feat: add shared event types and WebSocket protocol"
```

---

## Task 3: Log parser — base infrastructure

**Files:**
- Create: `agent/src/parser/types.ts`
- Create: `agent/src/parser/index.ts`
- Create: `agent/tests/parser.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// agent/tests/parser.test.ts
import { describe, it, expect } from 'vitest';
import { LogParser } from '../src/parser/index';

describe('LogParser', () => {
  it('returns empty array for unrecognized line', () => {
    const parser = new LogParser();
    const result = parser.parseLine('some random garbage line');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd agent && npm test
```
Expected: FAIL — `Cannot find module '../src/parser/index'`

- [ ] **Step 3: Write `agent/src/parser/types.ts`**

```typescript
import { ParsedEvent } from '../../../shared/types';

export interface Pattern {
  type: string;
  match: (line: string) => boolean;
  parse: (line: string, timestamp: Date, state: ParserState) => ParsedEvent | null;
}

export interface ParserState {
  gameVersion: string;
  gameBranch: string;
  characterName: string;
  playerGeid: string;
  sessionStartEmitted: boolean;
}
```

- [ ] **Step 4: Write `agent/src/parser/index.ts`**

```typescript
import { ParsedEvent } from '../../../shared/types';
import { Pattern, ParserState } from './types';
import { patterns } from './patterns';

const TIMESTAMP_RE = /^<(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)>/;

export function extractTimestamp(line: string): Date {
  const m = line.match(TIMESTAMP_RE);
  return m ? new Date(m[1]) : new Date();
}

export class LogParser {
  private state: ParserState = {
    gameVersion: '',
    gameBranch: '',
    characterName: '',
    playerGeid: '',
    sessionStartEmitted: false,
  };

  parseLine(line: string): ParsedEvent[] {
    const timestamp = extractTimestamp(line);
    const events: ParsedEvent[] = [];

    for (const pattern of patterns) {
      if (pattern.match(line)) {
        const event = pattern.parse(line, timestamp, this.state);
        if (event) events.push(event);
      }
    }

    return events;
  }

  reset(): void {
    this.state = {
      gameVersion: '',
      gameBranch: '',
      characterName: '',
      playerGeid: '',
      sessionStartEmitted: false,
    };
  }
}
```

- [ ] **Step 5: Create empty `agent/src/parser/patterns.ts`**

```typescript
import { Pattern } from './types';

export const patterns: Pattern[] = [];
```

- [ ] **Step 6: Run test to confirm it passes**

```bash
cd agent && npm test
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add log parser base infrastructure"
```

---

## Task 4: Parser patterns — session events

**Files:**
- Modify: `agent/src/parser/patterns.ts`
- Modify: `agent/tests/parser.test.ts`

Real log lines used for these tests (from Game.log):
- `<2026-04-22T00:48:48.344Z> Log started on Wed Apr 22 00:48:48 2026`
- `<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160`
- `<2026-04-22T00:48:48.734Z> Branch: sc-alpha-4.8.0`
- `<2026-04-22T00:49:02.808Z> [Notice] <AccountLoginCharacterStatus_Character> Character: createdAt 1776818976428 - updatedAt 1776818976431 - geid 821434803302 - accountId 5974598 - name Hasansa - state STATE_UNSPECIFIED`
- `<2026-04-22T02:39:00.000Z> <SystemQuit>`

- [ ] **Step 1: Add session tests**

```typescript
// Add to agent/tests/parser.test.ts

describe('SESSION events', () => {
  it('accumulates version from FileVersion line', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160'
    );
    expect(events).toEqual([]);
    // No event emitted yet — state is accumulating
  });

  it('emits SESSION_START when character name line appears', () => {
    const parser = new LogParser();
    parser.parseLine('<2026-04-22T00:48:48.344Z> Log started on Wed Apr 22');
    parser.parseLine('<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160');
    parser.parseLine('<2026-04-22T00:48:48.734Z> Branch: sc-alpha-4.8.0');
    const events = parser.parseLine(
      '<2026-04-22T00:49:02.808Z> [Notice] <AccountLoginCharacterStatus_Character> Character: createdAt 1776818976428 - updatedAt 1776818976431 - geid 821434803302 - accountId 5974598 - name Hasansa - state STATE_UNSPECIFIED'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SESSION_START');
    expect(events[0].payload).toMatchObject({
      gameVersion: '4.8.178.24160',
      gameBranch: 'sc-alpha-4.8.0',
      characterName: 'Hasansa',
      playerGeid: '821434803302',
    });
  });

  it('does not emit SESSION_START twice', () => {
    const parser = new LogParser();
    parser.parseLine('<2026-04-22T00:48:48.344Z> Log started on Wed Apr 22');
    parser.parseLine('<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160');
    parser.parseLine('<2026-04-22T00:48:48.734Z> Branch: sc-alpha-4.8.0');
    const charLine = '<2026-04-22T00:49:02.808Z> [Notice] <AccountLoginCharacterStatus_Character> Character: createdAt 1776818976428 - updatedAt 1776818976431 - geid 821434803302 - accountId 5974598 - name Hasansa - state STATE_UNSPECIFIED';
    parser.parseLine(charLine);
    const events = parser.parseLine(charLine);
    expect(events).toHaveLength(0);
  });

  it('emits SESSION_END on SystemQuit', () => {
    const parser = new LogParser();
    const events = parser.parseLine('<2026-04-22T02:39:00.000Z> <SystemQuit>');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SESSION_END');
    expect(events[0].payload).toMatchObject({ reason: 'SystemQuit' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd agent && npm test
```
Expected: FAIL — session tests fail, unrecognized line test still passes

- [ ] **Step 3: Add session patterns to `agent/src/parser/patterns.ts`**

```typescript
import { Pattern } from './types';
import { ParsedEvent } from '../../../shared/types';

const PARSER_VERSION = 1;

export const patterns: Pattern[] = [
  // Accumulate: log start timestamp
  {
    type: '_LOG_STARTED',
    match: (line) => line.includes('Log started on'),
    parse: (line, timestamp, state) => {
      state.sessionStartEmitted = false;
      return null;
    },
  },

  // Accumulate: game version
  {
    type: '_FILE_VERSION',
    match: (line) => / FileVersion: \S/.test(line),
    parse: (line, _ts, state) => {
      const m = line.match(/FileVersion: (\S+)/);
      if (m) state.gameVersion = m[1];
      return null;
    },
  },

  // Accumulate: game branch
  {
    type: '_BRANCH',
    match: (line) => / Branch: \S/.test(line),
    parse: (line, _ts, state) => {
      const m = line.match(/Branch: (\S+)/);
      if (m) state.gameBranch = m[1];
      return null;
    },
  },

  // Emit SESSION_START when character name arrives
  {
    type: 'SESSION_START',
    match: (line) => line.includes('<AccountLoginCharacterStatus_Character>'),
    parse: (line, timestamp, state): ParsedEvent | null => {
      if (state.sessionStartEmitted) return null;
      const nameMatch = line.match(/name (\S+) - state/);
      const geidMatch = line.match(/geid (\d+)/);
      if (!nameMatch || !geidMatch) return null;
      state.characterName = nameMatch[1];
      state.playerGeid = geidMatch[1];
      state.sessionStartEmitted = true;
      return {
        type: 'SESSION_START',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          gameVersion: state.gameVersion,
          gameBranch: state.gameBranch,
          characterName: state.characterName,
          playerGeid: state.playerGeid,
        },
      };
    },
  },

  // SESSION_END
  {
    type: 'SESSION_END',
    match: (line) => line.includes('<SystemQuit>'),
    parse: (_line, timestamp): ParsedEvent => ({
      type: 'SESSION_END',
      occurredAt: timestamp,
      parserVersion: PARSER_VERSION,
      payload: { reason: 'SystemQuit' },
    }),
  },
];
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd agent && npm test
```
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add SESSION_START and SESSION_END parser patterns"
```

---

## Task 5: Parser patterns — zone and location events

**Files:**
- Modify: `agent/src/parser/patterns.ts`
- Modify: `agent/tests/parser.test.ts`

Real log lines:
- `<2026-04-22T00:51:03.947Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entered People's Alliance Jurisdiction: " [0] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
- `<2026-04-25T13:18:15.359Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entering Armistice Zone - Combat Prohibited: " [1] to queue. New queue size: 2, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
- `<2026-04-22T00:51:03.583Z> [Notice] <Update Inventory Location> Player [Hasansa] is changing location. Landing [0] -> [3058615591]. Location [0] -> [3058615591]. Pending [0] [Team_CoreGameplayFeatures][Inventory]`

- [ ] **Step 1: Add zone and location tests**

```typescript
// Add to agent/tests/parser.test.ts

describe('ZONE_ENTERED', () => {
  it('parses jurisdiction notification', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-22T00:51:03.947Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entered People's Alliance Jurisdiction: " [0] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ZONE_ENTERED');
    expect(events[0].payload).toMatchObject({
      notificationText: "Entered People's Alliance Jurisdiction: ",
      notificationIndex: 0,
    });
  });

  it('parses armistice zone notification', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-25T13:18:15.359Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entering Armistice Zone - Combat Prohibited: " [1] to queue. New queue size: 2, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
    );
    expect(events[0].payload).toMatchObject({
      notificationText: 'Entering Armistice Zone - Combat Prohibited: ',
      notificationIndex: 1,
    });
  });

  it('ignores UpdateNotificationItem lines', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-22T00:51:08.955Z> [Notice] <UpdateNotificationItem> Notification "Entered People's Alliance Jurisdiction: " [0], Action: StartFade [Team_CoreGameplayFeatures][Missions][Comms]`
    );
    expect(events).toHaveLength(0);
  });

  it('does not match blueprint notifications', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-25T13:54:43.986Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Corbel Core Halcyon: " [32] to queue. New queue size: 3, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
    );
    // Should produce BLUEPRINT_RECEIVED, NOT ZONE_ENTERED
    expect(events.every(e => e.type !== 'ZONE_ENTERED')).toBe(true);
  });
});

describe('BLUEPRINT_RECEIVED', () => {
  it('parses blueprint reward notification', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-25T13:54:43.986Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Corbel Core Halcyon: " [32] to queue. New queue size: 3, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('BLUEPRINT_RECEIVED');
    expect(events[0].payload).toMatchObject({
      blueprintName: 'Corbel Core Halcyon',
      notificationIndex: 32,
    });
  });

  it('parses a second blueprint with different name', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-25T14:02:29.622Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Palatino Core Metropolis: " [45] to queue. New queue size: 2, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
    );
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      blueprintName: 'Palatino Core Metropolis',
      notificationIndex: 45,
    });
  });
});

describe('LOCATION_CHANGE', () => {
  it('parses location change', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:51:03.583Z> [Notice] <Update Inventory Location> Player [Hasansa] is changing location. Landing [0] -> [3058615591]. Location [0] -> [3058615591]. Pending [0] [Team_CoreGameplayFeatures][Inventory]'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('LOCATION_CHANGE');
    expect(events[0].payload).toMatchObject({
      playerName: 'Hasansa',
      fromLandingId: '0',
      toLandingId: '3058615591',
      fromLocationId: '0',
      toLocationId: '3058615591',
    });
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd agent && npm test
```
Expected: FAIL — new tests fail

- [ ] **Step 3: Add patterns to `patterns.ts` (append to the `patterns` array)**

```typescript
  // ZONE_ENTERED — fires on SHUDEvent_OnNotification "Added notification", excluding blueprints
  {
    type: 'ZONE_ENTERED',
    match: (line) =>
      line.includes('<SHUDEvent_OnNotification>') &&
      line.includes('Added notification') &&
      !line.includes('"Received Blueprint:'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(/Added notification "([^"]+)" \[(\d+)\]/);
      if (!m) return null;
      return {
        type: 'ZONE_ENTERED',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          notificationText: m[1],
          notificationIndex: parseInt(m[2], 10),
        },
      };
    },
  },

  // BLUEPRINT_RECEIVED — SHUDEvent_OnNotification with "Received Blueprint:" text
  {
    type: 'BLUEPRINT_RECEIVED',
    match: (line) =>
      line.includes('<SHUDEvent_OnNotification>') &&
      line.includes('Added notification "Received Blueprint:'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(/Added notification "Received Blueprint: ([^:]+): " \[(\d+)\]/);
      if (!m) return null;
      return {
        type: 'BLUEPRINT_RECEIVED',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          blueprintName: m[1].trim(),
          notificationIndex: parseInt(m[2], 10),
        },
      };
    },
  },

  // LOCATION_CHANGE
  {
    type: 'LOCATION_CHANGE',
    match: (line) => line.includes('<Update Inventory Location>'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(
        /Player \[([^\]]+)\] is changing location\. Landing \[(\d+)\] -> \[(\d+)\]\. Location \[(\d+)\] -> \[(\d+)\]/
      );
      if (!m) return null;
      return {
        type: 'LOCATION_CHANGE',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          playerName: m[1],
          fromLandingId: m[2],
          toLandingId: m[3],
          fromLocationId: m[4],
          toLocationId: m[5],
        },
      };
    },
  },
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd agent && npm test
```
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add ZONE_ENTERED, BLUEPRINT_RECEIVED, and LOCATION_CHANGE patterns"
```

---

## Task 6: Parser patterns — inventory events

**Files:**
- Modify: `agent/src/parser/patterns.ts`
- Modify: `agent/tests/parser.test.ts`

Real log lines:
- `<2026-04-22T00:49:11.683Z> [Notice] <AttachmentReceived> Player[Hasansa] Attachment[body_01_noMagicPocket_200000000216, body_01_noMagicPocket, 200000000216] Status[persistent] Port[Body_ItemPort] Elapsed[29.601799] [Team_CoreGameplayFeatures][Inventory]`
- `<2026-04-22T01:20:31.927Z> [Notice] <StoreItem> Request[25] store 'cds_combat_light_backpack_01_02_01_9945947247211' [9945947247211] by 'acidrom' [201926431414] To Inventory[INVALID] Class[cds_combat_light_backpack_01_02_01] Rank[ampcsvjpvrigzzzzaaaaak] ItemsCount[68] [Team_CoreGameplayFeatures][Inventory]`

- [ ] **Step 1: Add inventory tests**

```typescript
// Add to agent/tests/parser.test.ts

describe('ATTACHMENT_RECEIVED', () => {
  it('parses gear attachment', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:49:11.683Z> [Notice] <AttachmentReceived> Player[Hasansa] Attachment[body_01_noMagicPocket_200000000216, body_01_noMagicPocket, 200000000216] Status[persistent] Port[Body_ItemPort] Elapsed[29.601799] [Team_CoreGameplayFeatures][Inventory]'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ATTACHMENT_RECEIVED');
    expect(events[0].payload).toMatchObject({
      playerName: 'Hasansa',
      attachmentName: 'body_01_noMagicPocket_200000000216',
      itemClass: 'body_01_noMagicPocket',
      itemId: '200000000216',
      status: 'persistent',
      port: 'Body_ItemPort',
    });
  });
});

describe('ITEM_STORED', () => {
  it('parses store item event', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      `<2026-04-22T01:20:31.927Z> [Notice] <StoreItem> Request[25] store 'cds_combat_light_backpack_01_02_01_9945947247211' [9945947247211] by 'acidrom' [201926431414] To Inventory[INVALID] Class[cds_combat_light_backpack_01_02_01] Rank[ampcsvjpvrigzzzzaaaaak] ItemsCount[68] [Team_CoreGameplayFeatures][Inventory]`
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ITEM_STORED');
    expect(events[0].payload).toMatchObject({
      requestId: 25,
      itemName: 'cds_combat_light_backpack_01_02_01_9945947247211',
      itemId: '9945947247211',
      playerName: 'acidrom',
      itemClass: 'cds_combat_light_backpack_01_02_01',
    });
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd agent && npm test
```

- [ ] **Step 3: Add patterns to `patterns.ts`**

```typescript
  // ATTACHMENT_RECEIVED — gear equipped at login
  {
    type: 'ATTACHMENT_RECEIVED',
    match: (line) => line.includes('<AttachmentReceived>'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(
        /Player\[([^\]]+)\] Attachment\[([^,]+), ([^,]+), (\d+)\] Status\[([^\]]+)\] Port\[([^\]]+)\]/
      );
      if (!m) return null;
      return {
        type: 'ATTACHMENT_RECEIVED',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          playerName: m[1],
          attachmentName: m[2],
          itemClass: m[3],
          itemId: m[4],
          status: m[5],
          port: m[6],
        },
      };
    },
  },

  // ITEM_STORED — player stores item to inventory
  {
    type: 'ITEM_STORED',
    match: (line) => line.includes('<StoreItem>') && line.includes("store '"),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(
        /Request\[(\d+)\] store '([^']+)' \[(\d+)\] by '([^']+)' \[(\d+)\].*Class\[([^\]]+)\]/
      );
      if (!m) return null;
      return {
        type: 'ITEM_STORED',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          requestId: parseInt(m[1], 10),
          itemName: m[2],
          itemId: m[3],
          playerName: m[4],
          itemClass: m[6],
        },
      };
    },
  },
```

- [ ] **Step 4: Run tests**

```bash
cd agent && npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add ATTACHMENT_RECEIVED and ITEM_STORED patterns"
```

---

## Task 7: Parser patterns — mission events

**Files:**
- Modify: `agent/src/parser/patterns.ts`
- Modify: `agent/tests/parser.test.ts`

Real log lines:
- `<2026-04-22T00:49:11.702Z> [Notice] <CSubsumptionMissionComponent::CreateMissionInstance> [MISSION] Creating subsumption mission module Libs/Subsumption/Missions/EA/FrontendHangar.xml with seed 1487958931 and EntityId 200000000239 [Team_MissionFeatures][Missions]`
- `<2026-04-22T00:50:26.222Z> [Notice] <CSubsumptionMissionComponent::HandleAuthorityChangeEvent> [MISSION] SubsumptionMissionComponent lost authority FrontendHangar [00000000-...] - EntityId: 200000000239`
- `<2026-04-22T01:06:03.597Z> [Notice] <GenerateLocationProperty> Generated Locations - variablename: DropoffLocation_BP[Destination], locations: (Wikelo Emporium Dasi Station [1231535936] [TheCollectorsAsteriod_Stanton1])(Wikelo Emporium Kinga Station [3168785171] [TheCollectorsAsteriod_Stanton4]) contract: TheCollector_Intro [Team_MissionFeatures][Missions]`

- [ ] **Step 1: Add mission tests**

```typescript
// Add to agent/tests/parser.test.ts

describe('MISSION_START', () => {
  it('parses mission creation', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:49:11.702Z> [Notice] <CSubsumptionMissionComponent::CreateMissionInstance> [MISSION] Creating subsumption mission module Libs/Subsumption/Missions/EA/FrontendHangar.xml with seed 1487958931 and EntityId 200000000239 [Team_MissionFeatures][Missions]'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('MISSION_START');
    expect(events[0].payload).toMatchObject({
      missionType: 'Libs/Subsumption/Missions/EA/FrontendHangar.xml',
      seed: '1487958931',
      entityId: '200000000239',
    });
  });
});

describe('MISSION_END', () => {
  it('parses mission authority lost (end proxy)', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:50:26.222Z> [Notice] <CSubsumptionMissionComponent::StopMissionLogic> [MISSION] Stopping subsumption mission module with EntityId 200000000239 [Team_MissionFeatures][Missions]'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('MISSION_END');
    expect(events[0].payload).toMatchObject({ entityId: '200000000239' });
  });
});

describe('MISSION_CONTRACT', () => {
  it('parses contract with destinations', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T01:06:03.597Z> [Notice] <GenerateLocationProperty> Generated Locations - variablename: DropoffLocation_BP[Destination], locations: (Wikelo Emporium Dasi Station [1231535936] [TheCollectorsAsteriod_Stanton1])(Wikelo Emporium Kinga Station [3168785171] [TheCollectorsAsteriod_Stanton4]) contract: TheCollector_Intro [Team_MissionFeatures][Missions]'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('MISSION_CONTRACT');
    const p = events[0].payload as any;
    expect(p.contractType).toBe('TheCollector_Intro');
    expect(p.variableName).toBe('DropoffLocation_BP[Destination]');
    expect(p.destinations).toHaveLength(2);
    expect(p.destinations[0]).toMatchObject({
      name: 'Wikelo Emporium Dasi Station',
      id: '1231535936',
      zone: 'TheCollectorsAsteriod_Stanton1',
    });
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd agent && npm test
```

- [ ] **Step 3: Add patterns to `patterns.ts`**

```typescript
  // MISSION_START
  {
    type: 'MISSION_START',
    match: (line) => line.includes('<CSubsumptionMissionComponent::CreateMissionInstance>'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(
        /Creating subsumption mission module (\S+) with seed (\d+) and EntityId (\d+)/
      );
      if (!m) return null;
      return {
        type: 'MISSION_START',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: { missionType: m[1], seed: m[2], entityId: m[3] },
      };
    },
  },

  // MISSION_END — fires when mission logic stops
  {
    type: 'MISSION_END',
    match: (line) => line.includes('<CSubsumptionMissionComponent::StopMissionLogic>'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(/Stopping subsumption mission module with EntityId (\d+)/);
      if (!m) return null;
      return {
        type: 'MISSION_END',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: { entityId: m[1] },
      };
    },
  },

  // MISSION_CONTRACT — contract destinations generated
  {
    type: 'MISSION_CONTRACT',
    match: (line) => line.includes('<GenerateLocationProperty>'),
    parse: (line, timestamp): ParsedEvent | null => {
      const headerMatch = line.match(
        /variablename: ([^,]+), locations: (.+) contract: (\S+)/
      );
      if (!headerMatch) return null;
      const [, variableName, locationsRaw, contractType] = headerMatch;
      const destinations: Array<{ name: string; id: string; zone: string }> = [];
      const locRe = /\(([^[]+) \[(\d+)\] \[([^\]]+)\]\)/g;
      let locMatch: RegExpExecArray | null;
      while ((locMatch = locRe.exec(locationsRaw)) !== null) {
        destinations.push({
          name: locMatch[1].trim(),
          id: locMatch[2],
          zone: locMatch[3],
        });
      }
      return {
        type: 'MISSION_CONTRACT',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: { variableName, contractType, destinations },
      };
    },
  },
```

- [ ] **Step 4: Run tests**

```bash
cd agent && npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add MISSION_START, MISSION_END, MISSION_CONTRACT patterns"
```

---

## Task 8: Parser patterns — ship events

**Files:**
- Modify: `agent/src/parser/patterns.ts`
- Modify: `agent/tests/parser.test.ts`

Real log lines:
- `<2026-04-22T00:51:59.944Z> [Notice] <CWallet::ProcessClaimToNextStep> New Insurance Claim Request - entitlementURN: urn:sc:global:entitlement:uuid:e5a6dcc1-1116-50aa-9b1c-dddc384a6b5c, requestId : 1 [Team_GameServices][Transaction]`
- `<2026-04-22T00:56:27.268Z> [CItemResourceHost::AddHostedNode] Resource container component was already registered! Entity :QTNK_ANVL_Hawk_841809760801  -- Host  :ANVL_Hawk_841809760599`

- [ ] **Step 1: Add ship tests**

```typescript
// Add to agent/tests/parser.test.ts

describe('SHIP_CLAIM', () => {
  it('parses new insurance claim (not duplicate)', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:51:59.944Z> [Notice] <CWallet::ProcessClaimToNextStep> New Insurance Claim Request - entitlementURN: urn:sc:global:entitlement:uuid:e5a6dcc1-1116-50aa-9b1c-dddc384a6b5c, requestId : 1 [Team_GameServices][Transaction]'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SHIP_CLAIM');
    expect(events[0].payload).toMatchObject({
      entitlementUrn: 'urn:sc:global:entitlement:uuid:e5a6dcc1-1116-50aa-9b1c-dddc384a6b5c',
      requestId: 1,
    });
  });

  it('ignores existing active claim lines', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:52:00.600Z> [Notice] <CWallet::ProcessClaimToNextStep> Existing Active Claim Found - Entitilement URN: urn:sc:global:entitlement:uuid:e5a6dcc1-1116-50aa-9b1c-dddc384a6b5c [Team_GameServices][Transaction]'
    );
    expect(events).toHaveLength(0);
  });
});

describe('SHIP_NEARBY', () => {
  it('parses ship streaming into area', () => {
    const parser = new LogParser();
    const events = parser.parseLine(
      '<2026-04-22T00:56:27.268Z> [CItemResourceHost::AddHostedNode] Resource container component was already registered! Entity :QTNK_ANVL_Hawk_841809760801  -- Host  :ANVL_Hawk_841809760599'
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SHIP_NEARBY');
    expect(events[0].payload).toMatchObject({
      shipClass: 'ANVL_Hawk',
      hostId: '841809760599',
    });
  });

  it('deduplicates same ship (multiple tank entries)', () => {
    // HTNK_ and QTNK_ both fire for the same host — we only emit once per host ID
    const parser = new LogParser();
    parser.parseLine(
      '<2026-04-22T00:56:27.268Z> [CItemResourceHost::AddHostedNode] Resource container component was already registered! Entity :HTNK_ANVL_Hawk_841809760797  -- Host  :ANVL_Hawk_841809760599'
    );
    const events = parser.parseLine(
      '<2026-04-22T00:56:27.268Z> [CItemResourceHost::AddHostedNode] Resource container component was already registered! Entity :QTNK_ANVL_Hawk_841809760801  -- Host  :ANVL_Hawk_841809760599'
    );
    expect(events).toHaveLength(0); // second entry for same host suppressed
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd agent && npm test
```

- [ ] **Step 3: Add patterns to `patterns.ts`** — also add `seenShipHosts: Set<string>` to `ParserState` in `types.ts`

Update `agent/src/parser/types.ts`:
```typescript
import { ParsedEvent } from '../../../shared/types';

export interface Pattern {
  type: string;
  match: (line: string) => boolean;
  parse: (line: string, timestamp: Date, state: ParserState) => ParsedEvent | null;
}

export interface ParserState {
  gameVersion: string;
  gameBranch: string;
  characterName: string;
  playerGeid: string;
  sessionStartEmitted: boolean;
  seenShipHosts: Set<string>;
}
```

Update `agent/src/parser/index.ts` — add `seenShipHosts` to initial state and `reset()`:
```typescript
  private state: ParserState = {
    gameVersion: '',
    gameBranch: '',
    characterName: '',
    playerGeid: '',
    sessionStartEmitted: false,
    seenShipHosts: new Set(),
  };

  reset(): void {
    this.state = {
      gameVersion: '',
      gameBranch: '',
      characterName: '',
      playerGeid: '',
      sessionStartEmitted: false,
      seenShipHosts: new Set(),
    };
  }
```

Add to `patterns.ts`:
```typescript
  // SHIP_CLAIM — fires only on "New Insurance Claim", not on "Existing Active"
  {
    type: 'SHIP_CLAIM',
    match: (line) =>
      line.includes('<CWallet::ProcessClaimToNextStep>') &&
      line.includes('New Insurance Claim Request'),
    parse: (line, timestamp): ParsedEvent | null => {
      const m = line.match(/entitlementURN: ([^,]+), requestId : (\d+)/);
      if (!m) return null;
      return {
        type: 'SHIP_CLAIM',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: {
          entitlementUrn: m[1].trim(),
          requestId: parseInt(m[2], 10),
        },
      };
    },
  },

  // SHIP_NEARBY — deduplicated by host entity ID per session
  {
    type: 'SHIP_NEARBY',
    match: (line) =>
      line.includes('[CItemResourceHost::AddHostedNode]') &&
      line.includes('-- Host'),
    parse: (line, timestamp, state): ParsedEvent | null => {
      const m = line.match(/-- Host\s+:(\w+)_(\d+)/);
      if (!m) return null;
      const shipClass = m[1];
      const hostId = m[2];
      const key = `${shipClass}_${hostId}`;
      if (state.seenShipHosts.has(key)) return null;
      state.seenShipHosts.add(key);
      return {
        type: 'SHIP_NEARBY',
        occurredAt: timestamp,
        parserVersion: PARSER_VERSION,
        payload: { shipClass, hostId },
      };
    },
  },
```

- [ ] **Step 4: Run tests**

```bash
cd agent && npm test
```
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add SHIP_CLAIM and SHIP_NEARBY patterns"
```

---

## Task 9: Agent config module

**Files:**
- Create: `agent/src/config.ts`
- Create: `agent/tests/config.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// agent/tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, writeConfig, AgentConfig } from '../src/config';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), 'sc-tracker-test-' + process.pid);

// Override config dir for tests
process.env['SC_TRACKER_CONFIG_DIR'] = testDir;

describe('config', () => {
  beforeEach(() => mkdirSync(testDir, { recursive: true }));
  afterEach(() => rmSync(testDir, { recursive: true, force: true }));

  it('returns null when no config file exists', () => {
    expect(readConfig()).toBeNull();
  });

  it('writes and reads config', () => {
    const config: AgentConfig = {
      token: 'test-token',
      logPath: 'C:\\path\\to\\Game.log',
      serverUrl: 'wss://example.com',
      localPort: 9242,
    };
    writeConfig(config);
    expect(readConfig()).toEqual(config);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd agent && npm test
```

- [ ] **Step 3: Write `agent/src/config.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface AgentConfig {
  token: string;
  logPath: string;
  serverUrl: string;
  localPort: number;
}

const SC_LOG_CANDIDATES = [
  'D:\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
  'D:\\Roberts Space Industries\\StarCitizen\\PTU\\Game.log',
  'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
  'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\PTU\\Game.log',
];

function getConfigDir(): string {
  if (process.env['SC_TRACKER_CONFIG_DIR']) {
    return process.env['SC_TRACKER_CONFIG_DIR'];
  }
  const appData = process.env['APPDATA'] ?? join(require('os').homedir(), 'AppData', 'Roaming');
  return join(appData, 'SCTracker');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function readConfig(): AgentConfig | null {
  const path = getConfigPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as AgentConfig;
  } catch {
    return null;
  }
}

export function writeConfig(config: AgentConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function detectLogPath(): string | null {
  return SC_LOG_CANDIDATES.find(existsSync) ?? null;
}
```

- [ ] **Step 4: Run tests**

```bash
cd agent && npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/
git commit -m "feat: add agent config module"
```

---

## Task 10: Agent log watcher

**Files:**
- Create: `agent/src/watcher.ts`

- [ ] **Step 1: Write `agent/src/watcher.ts`**

The watcher opens the file at its current end, then tails new lines as they arrive. On game restart (file size decreases), it seeks back to zero.

```typescript
import chokidar from 'chokidar';
import { createReadStream, statSync, existsSync } from 'fs';
import { createInterface } from 'readline';

export type LineHandler = (line: string) => void;

export function watchLog(logPath: string, onLine: LineHandler): () => void {
  if (!existsSync(logPath)) {
    console.warn(`[watcher] Log file not found: ${logPath}`);
  }

  let offset = existsSync(logPath) ? statSync(logPath).size : 0;

  function readFrom(start: number): void {
    const stat = statSync(logPath);
    if (stat.size < start) {
      // File was truncated (game restarted) — read from beginning
      offset = 0;
      readFrom(0);
      return;
    }
    if (stat.size === start) return;

    const stream = createReadStream(logPath, {
      start,
      end: stat.size - 1,
      encoding: 'utf-8',
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', onLine);
    rl.on('close', () => {
      offset = stat.size;
    });
  }

  const watcher = chokidar.watch(logPath, {
    persistent: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('change', () => readFrom(offset));
  watcher.on('add', () => {
    offset = 0;
    readFrom(0);
  });

  return () => { watcher.close(); };
}
```

- [ ] **Step 2: Manually verify against your real Game.log**

```bash
cd agent
tsx -e "
const { watchLog } = require('./src/watcher');
watchLog('D:/Roberts Space Industries/StarCitizen/PTU/Game.log', (line) => {
  if (line.includes('SHUDEvent') || line.includes('AttachmentReceived')) {
    console.log(line.slice(0, 120));
  }
});
console.log('Watching... (touch the log file or launch SC)');
"
```
Expected: Lines matching SHUDEvent or AttachmentReceived printed when they appear.

- [ ] **Step 3: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/src/watcher.ts
git commit -m "feat: add log file watcher"
```

---

## Task 11: Server database client and migrations

> **Note:** This task runs on the Replit server. Set up Claude Code in Replit (see design doc) and run these steps there, or develop locally with a local PostgreSQL instance for testing.

**Files:**
- Create: `server/src/db/client.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/tests/migrate.test.ts`

- [ ] **Step 1: Write `server/src/db/client.ts`**

```typescript
import { Pool } from 'pg';

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
});
```

- [ ] **Step 2: Write `server/src/db/migrate.ts`**

```typescript
import { pool } from './client';

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE SCHEMA IF NOT EXISTS sc_tracker`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.users (
        id          SERIAL PRIMARY KEY,
        discord_id  TEXT NOT NULL UNIQUE,
        discord_username TEXT NOT NULL,
        discord_avatar   TEXT,
        token       TEXT NOT NULL UNIQUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.sessions (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES sc_tracker.users(id),
        character_name  TEXT NOT NULL,
        game_version    TEXT,
        game_branch     TEXT,
        started_at      TIMESTAMPTZ NOT NULL,
        ended_at        TIMESTAMPTZ,
        duration_secs   INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.events (
        id             SERIAL PRIMARY KEY,
        session_id     INTEGER REFERENCES sc_tracker.sessions(id),
        user_id        INTEGER NOT NULL REFERENCES sc_tracker.users(id),
        event_type     TEXT NOT NULL,
        occurred_at    TIMESTAMPTZ NOT NULL,
        payload        JSONB NOT NULL DEFAULT '{}',
        parser_version INTEGER NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sc_tracker_events_user_id
        ON sc_tracker.events(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sc_tracker_events_session_id
        ON sc_tracker.events(session_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sc_tracker_events_type
        ON sc_tracker.events(event_type)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.ships (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES sc_tracker.users(id),
        entitlement_urn TEXT NOT NULL,
        display_name    TEXT,
        claims_count    INTEGER NOT NULL DEFAULT 0,
        last_claimed_at TIMESTAMPTZ,
        UNIQUE(user_id, entitlement_urn)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.discord_notifications (
        id              SERIAL PRIMARY KEY,
        event_id        INTEGER REFERENCES sc_tracker.events(id),
        channel_id      TEXT NOT NULL,
        sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_preview TEXT
      )
    `);

    await client.query('COMMIT');
    console.log('[migrate] sc_tracker schema ready');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Write migration test**

```typescript
// server/tests/migrate.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../src/db/client';
import { migrate } from '../src/db/migrate';

describe('migrate', () => {
  afterAll(() => pool.end());

  it('creates sc_tracker schema and tables without error', async () => {
    await expect(migrate()).resolves.not.toThrow();
  });

  it('is idempotent — running twice does not error', async () => {
    await expect(migrate()).resolves.not.toThrow();
  });

  it('sc_tracker.users table exists after migration', async () => {
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'sc_tracker' AND table_name = 'users'
    `);
    expect(result.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run migration tests** (requires DATABASE_URL to be set)

```bash
cd server
DATABASE_URL=your_connection_string npm test -- --reporter=verbose migrate
```
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add server/
git commit -m "feat: add database client and sc_tracker schema migration"
```

---

## Task 12: Server auth — tokens and Discord OAuth

**Files:**
- Create: `server/src/auth/tokens.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/tests/tokens.test.ts`

- [ ] **Step 1: Write token tests**

```typescript
// server/tests/tokens.test.ts
import { describe, it, expect } from 'vitest';

process.env['JWT_SECRET'] = 'test-secret-at-least-32-chars-long!!';

import { generateToken, verifyToken } from '../src/auth/tokens';

describe('tokens', () => {
  it('generates a verifiable token for a discord ID', () => {
    const token = generateToken('123456789');
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.discordId).toBe('123456789');
  });

  it('returns null for invalid token', () => {
    expect(verifyToken('not-a-token')).toBeNull();
  });

  it('returns null for tampered token', () => {
    const token = generateToken('123456789');
    expect(verifyToken(token + 'x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd server && npm test -- tokens
```

- [ ] **Step 3: Write `server/src/auth/tokens.ts`**

```typescript
import jwt from 'jsonwebtoken';

const secret = process.env['JWT_SECRET'];
if (!secret) throw new Error('JWT_SECRET environment variable is required');

interface TokenPayload {
  discordId: string;
}

export function generateToken(discordId: string): string {
  return jwt.sign({ discordId }, secret!, { expiresIn: '10y' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, secret!) as TokenPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run token tests**

```bash
cd server && JWT_SECRET=test-secret-at-least-32-chars-long!! npm test -- tokens
```
Expected: PASS

- [ ] **Step 5: Write `server/src/routes/auth.ts`**

```typescript
import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import { pool } from '../db/client';
import { generateToken, verifyToken } from '../auth/tokens';

export const authRouter = Router();

const DISCORD_API = 'https://discord.com/api/v10';
const CLIENT_ID = process.env['DISCORD_CLIENT_ID']!;
const CLIENT_SECRET = process.env['DISCORD_CLIENT_SECRET']!;
const REDIRECT_URI = process.env['DISCORD_REDIRECT_URI']!;

// Step 1 — redirect to Discord OAuth
authRouter.get('/discord', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

// Step 2 — Discord redirects here with code
authRouter.get('/discord/callback', async (req: Request, res: Response) => {
  const code = req.query['code'] as string | undefined;
  if (!code) return res.status(400).send('Missing code');

  // Exchange code for access token
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  const tokenData = await tokenRes.json() as { access_token?: string };
  if (!tokenData.access_token) return res.status(400).send('OAuth failed');

  // Fetch Discord user
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const user = await userRes.json() as { id: string; username: string; avatar?: string };

  // Upsert user in DB
  const agentToken = generateToken(user.id);
  await pool.query(
    `INSERT INTO sc_tracker.users (discord_id, discord_username, discord_avatar, token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE
       SET discord_username = EXCLUDED.discord_username,
           discord_avatar   = EXCLUDED.discord_avatar,
           token            = EXCLUDED.token,
           updated_at       = NOW()`,
    [user.id, user.username, user.avatar ?? null, agentToken]
  );

  // Show setup code to user — agent polls for this
  res.send(`
    <html><body style="font-family:monospace;padding:2rem">
      <h2>SC Tracker Connected!</h2>
      <p>Welcome, <b>${user.username}</b>. Your agent token:</p>
      <pre style="background:#eee;padding:1rem;font-size:1.2rem">${agentToken}</pre>
      <p>Paste this into your agent when prompted, or the agent will pick it up automatically if you started auth from the app.</p>
    </body></html>
  `);
});

// Agent calls this to verify its token
authRouter.get('/verify', async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  const result = await pool.query(
    'SELECT id, discord_username FROM sc_tracker.users WHERE discord_id = $1',
    [payload.discordId]
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'User not found' });
  res.json({ userId: result.rows[0].id, username: result.rows[0].discord_username });
});
```

- [ ] **Step 6: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add server/
git commit -m "feat: add JWT token auth and Discord OAuth routes"
```

---

## Task 13: Server WebSocket handler

**Files:**
- Create: `server/src/ws/handler.ts`
- Create: `server/tests/ws.test.ts`

- [ ] **Step 1: Write `server/src/ws/handler.ts`**

```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { pool } from '../db/client';
import { verifyToken } from '../auth/tokens';
import { WsClientMessage, WsServerMessage, ParsedEvent } from '../../../shared/types';

interface AuthedSocket {
  ws: WebSocket;
  userId: number;
  sessionId: number | null;
}

const connections = new Map<WebSocket, AuthedSocket>();

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let authed: AuthedSocket | null = null;

    ws.on('message', async (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsClientMessage;
      } catch {
        ws.close(1008, 'Invalid JSON');
        return;
      }

      if (msg.type === 'auth') {
        const payload = verifyToken(msg.token);
        if (!payload) {
          const resp: WsServerMessage = { type: 'auth_error', message: 'Invalid token' };
          ws.send(JSON.stringify(resp));
          ws.close();
          return;
        }
        const result = await pool.query(
          'SELECT id FROM sc_tracker.users WHERE discord_id = $1',
          [payload.discordId]
        );
        if (!result.rows[0]) {
          const resp: WsServerMessage = { type: 'auth_error', message: 'User not found' };
          ws.send(JSON.stringify(resp));
          ws.close();
          return;
        }
        authed = { ws, userId: result.rows[0].id, sessionId: null };
        connections.set(ws, authed);
        const ok: WsServerMessage = { type: 'auth_ok', userId: authed.userId };
        ws.send(JSON.stringify(ok));
        return;
      }

      if (msg.type === 'event') {
        if (!authed) {
          ws.close(1008, 'Not authenticated');
          return;
        }
        const eventId = await storeEvent(authed, msg.payload);
        const ack: WsServerMessage = { type: 'ack', eventId };
        ws.send(JSON.stringify(ack));
      }
    });

    ws.on('close', () => {
      if (authed) connections.delete(ws);
    });
  });
}

async function storeEvent(conn: AuthedSocket, event: ParsedEvent): Promise<number> {
  // Open or reuse session
  if (event.type === 'SESSION_START') {
    const p = event.payload as { characterName: string; gameVersion: string; gameBranch: string };
    const result = await pool.query(
      `INSERT INTO sc_tracker.sessions (user_id, character_name, game_version, game_branch, started_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [conn.userId, p.characterName, p.gameVersion, p.gameBranch, event.occurredAt]
    );
    conn.sessionId = result.rows[0].id;
  }

  if (event.type === 'SESSION_END' && conn.sessionId) {
    await pool.query(
      `UPDATE sc_tracker.sessions
       SET ended_at = $1,
           duration_secs = EXTRACT(EPOCH FROM ($1 - started_at))::INTEGER
       WHERE id = $2`,
      [event.occurredAt, conn.sessionId]
    );
  }

  const result = await pool.query(
    `INSERT INTO sc_tracker.events (session_id, user_id, event_type, occurred_at, payload, parser_version)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [conn.sessionId, conn.userId, event.type, event.occurredAt, JSON.stringify(event.payload), event.parserVersion]
  );

  // Handle SHIP_CLAIM — upsert ship record
  if (event.type === 'SHIP_CLAIM') {
    const p = event.payload as { entitlementUrn: string };
    await pool.query(
      `INSERT INTO sc_tracker.ships (user_id, entitlement_urn, claims_count, last_claimed_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, entitlement_urn) DO UPDATE
         SET claims_count    = sc_tracker.ships.claims_count + 1,
             last_claimed_at = EXCLUDED.last_claimed_at`,
      [conn.userId, p.entitlementUrn, event.occurredAt]
    );
  }

  return result.rows[0].id;
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add server/src/ws/
git commit -m "feat: add WebSocket handler with auth and event persistence"
```

---

## Task 14: Server main entry point

**Files:**
- Create: `server/src/main.ts`
- Create: `server/src/routes/tracker.ts`

- [ ] **Step 1: Write `server/src/routes/tracker.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { verifyToken } from '../auth/tokens';

export const trackerRouter = Router();

function requireAuth(req: Request, res: Response): number | null {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return null; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: 'Invalid token' }); return null; }
  return null; // userId resolved below via discord_id
}

trackerRouter.get('/sessions', async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const user = await pool.query(
    'SELECT id FROM sc_tracker.users WHERE discord_id = $1',
    [payload.discordId]
  );
  if (!user.rows[0]) return res.status(401).json({ error: 'User not found' });
  const userId = user.rows[0].id;

  const sessions = await pool.query(
    `SELECT id, character_name, game_version, game_branch, started_at, ended_at, duration_secs
     FROM sc_tracker.sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50`,
    [userId]
  );
  res.json(sessions.rows);
});

trackerRouter.get('/stats', async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const user = await pool.query(
    'SELECT id FROM sc_tracker.users WHERE discord_id = $1',
    [payload.discordId]
  );
  if (!user.rows[0]) return res.status(401).json({ error: 'User not found' });
  const userId = user.rows[0].id;

  const [eventCounts, shipClaims, sessionTotal] = await Promise.all([
    pool.query(
      `SELECT event_type, COUNT(*) as count FROM sc_tracker.events
       WHERE user_id = $1 GROUP BY event_type ORDER BY count DESC`,
      [userId]
    ),
    pool.query(
      `SELECT entitlement_urn, display_name, claims_count, last_claimed_at
       FROM sc_tracker.ships WHERE user_id = $1 ORDER BY claims_count DESC`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) as sessions, COALESCE(SUM(duration_secs), 0) as total_secs
       FROM sc_tracker.sessions WHERE user_id = $1`,
      [userId]
    ),
  ]);

  res.json({
    eventCounts: eventCounts.rows,
    ships: shipClaims.rows,
    sessions: sessionTotal.rows[0],
  });
});
```

- [ ] **Step 2: Write `server/src/main.ts`**

```typescript
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { migrate } from './db/migrate';
import { authRouter } from './routes/auth';
import { trackerRouter } from './routes/tracker';
import { attachWebSocket } from './ws/handler';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

async function main(): Promise<void> {
  await migrate();

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/api/tracker', trackerRouter);

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/agent' });
  attachWebSocket(wss);

  server.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify server starts locally**

```bash
cd server
DATABASE_URL=your_pg_url JWT_SECRET=test-secret DISCORD_CLIENT_ID=x DISCORD_CLIENT_SECRET=x DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback tsx src/main.ts
```
Expected output:
```
[migrate] sc_tracker schema ready
[server] Listening on port 3000
```

- [ ] **Step 4: Verify health endpoint**

```bash
curl http://localhost:3000/health
```
Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add server/
git commit -m "feat: add server entry point and tracker REST routes"
```

---

## Task 15: Agent WebSocket client

**Files:**
- Create: `agent/src/client.ts`

- [ ] **Step 1: Write `agent/src/client.ts`**

```typescript
import WebSocket from 'ws';
import { ParsedEvent, WsServerMessage, WsClientMessage } from '../../shared/types';

const RECONNECT_DELAY_MS = 5000;

export class AgentClient {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private queue: ParsedEvent[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly onAuthOk?: (userId: number) => void
  ) {}

  connect(): void {
    if (this.ws) return;
    this.ws = new WebSocket(this.serverUrl);

    this.ws.on('open', () => {
      const msg: WsClientMessage = { type: 'auth', token: this.token };
      this.ws!.send(JSON.stringify(msg));
    });

    this.ws.on('message', (raw) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'auth_ok') {
        this.authenticated = true;
        this.onAuthOk?.(msg.userId);
        this.flushQueue();
      } else if (msg.type === 'auth_error') {
        console.error('[client] Auth failed:', msg.message);
        this.ws?.close();
      }
    });

    this.ws.on('close', () => {
      this.ws = null;
      this.authenticated = false;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[client] WebSocket error:', err.message);
    });
  }

  send(event: ParsedEvent): void {
    if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage = { type: 'event', payload: event };
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(event);
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      this.send(event);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/src/client.ts
git commit -m "feat: add WebSocket client with auth handshake and reconnect"
```

---

## Task 16: Agent tray icon

**Files:**
- Create: `agent/src/tray.ts`

- [ ] **Step 1: Write `agent/src/tray.ts`**

```typescript
import Tray from 'systray2';
import open from 'open';

interface TrayOptions {
  dashboardUrl: string;
  localUrl: string;
  onQuit: () => void;
}

export function createTray(opts: TrayOptions): { destroy: () => void } {
  // systray2 requires a 16x16 ICO as base64 — using a minimal placeholder
  // Replace ICON_BASE64 with your actual icon before shipping
  const ICON_BASE64 =
    'AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

  const tray = new Tray({
    menu: {
      icon: ICON_BASE64,
      title: 'SC Tracker',
      tooltip: 'Star Citizen Tracker — running',
      items: [
        {
          title: 'Open Dashboard',
          tooltip: 'Open the web dashboard',
          checked: false,
          enabled: true,
        },
        {
          title: 'Open Local View',
          tooltip: 'Open local stats (offline)',
          checked: false,
          enabled: true,
        },
        Tray.separator,
        {
          title: 'Quit',
          tooltip: 'Stop the SC Tracker agent',
          checked: false,
          enabled: true,
        },
      ],
    },
    debug: false,
    copyDir: true,
  });

  tray.onClick((action) => {
    if (action.item.title === 'Open Dashboard') {
      open(opts.dashboardUrl);
    } else if (action.item.title === 'Open Local View') {
      open(opts.localUrl);
    } else if (action.item.title === 'Quit') {
      opts.onQuit();
      tray.kill();
    }
  });

  return { destroy: () => tray.kill() };
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/src/tray.ts
git commit -m "feat: add Windows system tray icon"
```

---

## Task 17: Agent main entry point

**Files:**
- Create: `agent/src/main.ts`

- [ ] **Step 1: Write `agent/src/main.ts`**

```typescript
import { readConfig, writeConfig, detectLogPath, AgentConfig } from './config';
import { watchLog } from './watcher';
import { LogParser } from './parser/index';
import { AgentClient } from './client';
import { createTray } from './tray';
import open from 'open';

const SERVER_URL = process.env['SC_TRACKER_SERVER'] ?? 'wss://your-site.replit.app';
const DASHBOARD_URL = SERVER_URL.replace('wss://', 'https://').replace('ws://', 'http://');
const LOCAL_PORT = 9242;

async function main(): Promise<void> {
  console.log('[agent] SC Tracker starting...');

  let config = readConfig();

  if (!config) {
    const logPath = detectLogPath();
    if (!logPath) {
      console.error('[agent] Could not detect Game.log. Set logPath manually in config.');
      process.exit(1);
    }

    console.log('[agent] First run — opening browser for Discord auth...');
    await open(`${DASHBOARD_URL}/auth/discord?agent=1`);
    console.log('[agent] Paste your agent token below and press Enter:');

    const token = await new Promise<string>((resolve) => {
      process.stdin.setEncoding('utf-8');
      process.stdin.once('data', (d) => resolve(d.toString().trim()));
    });

    config = { token, logPath, serverUrl: SERVER_URL, localPort: LOCAL_PORT };
    writeConfig(config);
    console.log('[agent] Config saved.');
  }

  const parser = new LogParser();
  const client = new AgentClient(config.serverUrl, config.token, (userId) => {
    console.log(`[agent] Authenticated as user ${userId}`);
  });

  client.connect();

  const stopWatcher = watchLog(config.logPath, (line) => {
    const events = parser.parseLine(line);
    for (const event of events) {
      console.log(`[agent] ${event.type}`, JSON.stringify(event.payload).slice(0, 80));
      client.send(event);
    }
  });

  const tray = createTray({
    dashboardUrl: DASHBOARD_URL,
    localUrl: `http://localhost:${config.localPort}`,
    onQuit: () => {
      console.log('[agent] Quitting...');
      stopWatcher();
      client.disconnect();
      process.exit(0);
    },
  });

  console.log('[agent] Running. Right-click the tray icon to access options.');

  // Keep process alive
  process.on('SIGINT', () => {
    stopWatcher();
    client.disconnect();
    tray.destroy();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[agent] Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run agent in dev mode against your real log**

```bash
cd agent
SC_TRACKER_SERVER=ws://localhost:3000 tsx src/main.ts
```

Expected: Agent starts, detects Game.log, either prompts for token (first run) or connects immediately. Parsed events logged to console as lines arrive.

- [ ] **Step 3: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/src/main.ts
git commit -m "feat: add agent entry point — wires parser, watcher, client, and tray"
```

---

## Task 18: End-to-end smoke test

Run both server and agent together against your real Game.log and verify events reach the database.

- [ ] **Step 1: Start server locally**

```bash
cd server
DATABASE_URL=your_pg_url \
JWT_SECRET=any-64-char-string \
DISCORD_CLIENT_ID=placeholder \
DISCORD_CLIENT_SECRET=placeholder \
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback \
tsx src/main.ts
```

- [ ] **Step 2: Insert a test user directly in DB (bypasses OAuth for smoke test)**

```sql
INSERT INTO sc_tracker.users (discord_id, discord_username, token)
VALUES ('test-discord-id', 'TestUser', 'your-generated-jwt-token');
```

Generate the token:
```bash
cd server
JWT_SECRET=any-64-char-string tsx -e "
const { generateToken } = require('./src/auth/tokens');
console.log(generateToken('test-discord-id'));
"
```

- [ ] **Step 3: Write the token into agent config**

```bash
cd agent
tsx -e "
const { writeConfig } = require('./src/config');
writeConfig({
  token: 'PASTE_TOKEN_HERE',
  logPath: 'D:/Roberts Space Industries/StarCitizen/PTU/Game.log',
  serverUrl: 'ws://localhost:3000',
  localPort: 9242
});
console.log('Config written');
"
```

- [ ] **Step 4: Run agent and launch Star Citizen (or touch the log file)**

```bash
cd agent && SC_TRACKER_SERVER=ws://localhost:3000 tsx src/main.ts
```

- [ ] **Step 5: Verify events in database**

```sql
SELECT event_type, occurred_at, payload
FROM sc_tracker.events
ORDER BY created_at DESC
LIMIT 20;
```

Expected: Rows for SESSION_START, ZONE_ENTERED, LOCATION_CHANGE, ATTACHMENT_RECEIVED etc.

- [ ] **Step 6: Commit**

```bash
cd C:\Claude_Stuff\sc-tracker
git commit --allow-empty -m "chore: phase 1 smoke test complete"
```

---

## Task 19: Build Windows .exe

- [ ] **Step 1: Build TypeScript**

```bash
cd agent && npm run build
```
Expected: `dist/` directory created with compiled JS.

- [ ] **Step 2: Bundle with pkg**

```bash
npm run bundle
```
Expected: `dist/SCTrackerAgent.exe` created (~25-40MB).

- [ ] **Step 3: Test the .exe on Windows**

Double-click `dist/SCTrackerAgent.exe` or run:
```
.\dist\SCTrackerAgent.exe
```
Expected: Tray icon appears, agent connects to server, events flow.

- [ ] **Step 4: Commit the build script config**

```bash
cd C:\Claude_Stuff\sc-tracker
git add agent/package.json
git commit -m "chore: configure pkg bundling for Windows .exe"
```

---

## Phase 1 Complete

At this point you have:
- A working log parser with patterns for all currently observable event types
- A PostgreSQL schema that stores every event with full payload
- An authenticated WebSocket pipeline from agent to server
- A Windows .exe that any community member can run
- REST endpoints ready for the web dashboard (Plan 2)

**Next: Plan 2 — Web dashboard and Discord bot**
