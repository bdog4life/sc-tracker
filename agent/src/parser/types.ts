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
