import { describe, it, expect } from 'vitest';
import { LogParser } from '../src/parser/index';

describe('LogParser', () => {
  it('returns empty array for unrecognized line', () => {
    const parser = new LogParser();
    const result = parser.parseLine('some random garbage line');
    expect(result).toEqual([]);
  });

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
});
