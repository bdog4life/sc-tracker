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
