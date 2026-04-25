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
];
