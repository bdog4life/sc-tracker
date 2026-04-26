import { readConfig, writeConfig, detectLogPath } from './config';
import { watchLog } from './watcher';
import { LogParser } from './parser/index';
import { AgentClient } from './client';
import { createTray } from './tray';
import open from 'open';

const BASE_URL = process.env['SC_TRACKER_SERVER'] ?? 'https://sc-tracker.replit.app';
const WS_URL = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/agent';
const DASHBOARD_URL = BASE_URL + '/tracker';
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

    config = { token, logPath, serverUrl: WS_URL, localPort: LOCAL_PORT };
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
