import { neon } from '@neondatabase/serverless';

let _sql = null;

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('No Neon DATABASE_URL env var found');
    _sql = neon(url);
  }
  return _sql;
}

// Run once to create the users table if it doesn't exist
export async function ensureSchema() {
  await sql()(
    `CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      email     TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      name      TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
}
