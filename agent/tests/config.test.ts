import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, writeConfig, AgentConfig } from '../src/config';
import { mkdirSync, rmSync } from 'fs';
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
