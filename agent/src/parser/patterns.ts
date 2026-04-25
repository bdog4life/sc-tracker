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
