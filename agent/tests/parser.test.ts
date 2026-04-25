import { describe, it, expect } from 'vitest';
import { LogParser } from '../src/parser/index';

describe('LogParser', () => {
  it('returns empty array for unrecognized line', () => {
    const parser = new LogParser();
    const result = parser.parseLine('some random garbage line');
    expect(result).toEqual([]);
  });
});
