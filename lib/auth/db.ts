import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The gate's only server-side state: who may use the routes that spend the
 * app's own money. Deliberately not where generated media lives — that stays
 * in each person's browser, so this table holds a handful of rows and never
 * grows with usage.
 *
 * SQLite via `node:sqlite` rather than a driver package: a single pm2 process
 * on one box needs no network hop, and a built-in module keeps the deploy
 * script free of native builds. Requires Node 22.5+.
 */
export type UserStatus = 'pending' | 'approved' | 'blocked';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  status: UserStatus;
  is_admin: number;
  created_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
}

const DEFAULT_PATH = 'data/auth.db';

let database: DatabaseSync | null = null;

export function authDatabasePath(): string {
  return resolve(process.env.AUTH_DB_PATH?.trim() || DEFAULT_PATH);
}

/** Opened lazily so importing this module during a build creates nothing. */
export function authDatabase(): DatabaseSync {
  if (database) return database;

  const path = authDatabasePath();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const opened = new DatabaseSync(path);
  opened.exec('PRAGMA journal_mode = WAL');
  opened.exec('PRAGMA foreign_keys = ON');
  migrate(opened);
  database = opened;
  return opened;
}

/** Test seam: point the gate at an in-memory database. */
export function useAuthDatabase(next: DatabaseSync | null) {
  database = next;
  if (next) migrate(next);
}

export function migrate(target: DatabaseSync) {
  target.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
  `);
}

/** The address that is approved and made admin on sign-up, so the first account can let others in. */
export function adminEmail(): string {
  return (process.env.AUTH_ADMIN_EMAIL ?? '').trim().toLowerCase();
}
