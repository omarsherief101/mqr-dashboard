import { neon } from '@neondatabase/serverless';

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.NEON_DATABASE_URL;

if (!url) {
  const keys = Object.keys(process.env)
    .filter(k => k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('NEON'));
  throw new Error(`No DB connection string. Available: ${keys.join(', ') || 'none'}`);
}

export const sql = neon(url);

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}
