import { pool } from './client';

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE SCHEMA IF NOT EXISTS sc_tracker`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.users (
        id          SERIAL PRIMARY KEY,
        discord_id  TEXT NOT NULL UNIQUE,
        discord_username TEXT NOT NULL,
        discord_avatar   TEXT,
        token       TEXT NOT NULL UNIQUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.sessions (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES sc_tracker.users(id),
        character_name  TEXT NOT NULL,
        game_version    TEXT,
        game_branch     TEXT,
        started_at      TIMESTAMPTZ NOT NULL,
        ended_at        TIMESTAMPTZ,
        duration_secs   INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.events (
        id             SERIAL PRIMARY KEY,
        session_id     INTEGER REFERENCES sc_tracker.sessions(id),
        user_id        INTEGER NOT NULL REFERENCES sc_tracker.users(id),
        event_type     TEXT NOT NULL,
        occurred_at    TIMESTAMPTZ NOT NULL,
        payload        JSONB NOT NULL DEFAULT '{}',
        parser_version INTEGER NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sc_tracker_events_user_id
        ON sc_tracker.events(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sc_tracker_events_session_id
        ON sc_tracker.events(session_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sc_tracker_events_type
        ON sc_tracker.events(event_type)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.ships (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES sc_tracker.users(id),
        entitlement_urn TEXT NOT NULL,
        display_name    TEXT,
        claims_count    INTEGER NOT NULL DEFAULT 0,
        last_claimed_at TIMESTAMPTZ,
        UNIQUE(user_id, entitlement_urn)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_tracker.discord_notifications (
        id              SERIAL PRIMARY KEY,
        event_id        INTEGER REFERENCES sc_tracker.events(id),
        channel_id      TEXT NOT NULL,
        sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_preview TEXT
      )
    `);

    await client.query('COMMIT');
    console.log('[migrate] sc_tracker schema ready');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
