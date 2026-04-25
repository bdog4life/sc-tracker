// server/tests/migrate.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../src/db/client';
import { migrate } from '../src/db/migrate';

describe('migrate', () => {
  afterAll(() => pool.end());

  it('creates sc_tracker schema and tables without error', async () => {
    await expect(migrate()).resolves.not.toThrow();
  });

  it('is idempotent — running twice does not error', async () => {
    await expect(migrate()).resolves.not.toThrow();
  });

  it('sc_tracker.users table exists after migration', async () => {
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'sc_tracker' AND table_name = 'users'
    `);
    expect(result.rows).toHaveLength(1);
  });
});
