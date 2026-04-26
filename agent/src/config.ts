import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentConfig {
  token: string;
  logPath: string;
  serverUrl: string;
  localPort: number;
}

const SC_SUBDIRS = [
  'Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
  'Roberts Space Industries\\StarCitizen\\PTU\\Game.log',
  'Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
  'Program Files\\Roberts Space Industries\\StarCitizen\\PTU\\Game.log',
];

function buildLogCandidates(): string[] {
  const drives = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const candidates: string[] = [];
  for (const drive of drives) {
    for (const sub of SC_SUBDIRS) {
      candidates.push(`${drive}:\\${sub}`);
    }
  }
  return candidates;
}

function getConfigDir(): string {
  if (process.env['SC_TRACKER_CONFIG_DIR']) {
    return process.env['SC_TRACKER_CONFIG_DIR'];
  }
  const appData = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming');
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
  return buildLogCandidates().find(existsSync) ?? null;
}
