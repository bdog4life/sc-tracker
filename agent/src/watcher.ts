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
