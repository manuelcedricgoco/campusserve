import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Env } from '../config/env.js';

export type DbClient = pg.PoolClient;

export interface Actor {
  id: string;
  email?: string;
  claims: Record<string, unknown>;
}

export interface Database {
  pool: pg.Pool;
  /** Runs fn in a transaction as the `authenticated` role with the caller's JWT claims (RLS applies). */
  asUser<T>(actor: Actor, fn: (c: DbClient) => Promise<T>): Promise<T>;
  /**
   * Runs fn in a transaction as `service_role` (bypasses RLS). Only for trusted backend work:
   * webhooks, storage indexing, workers, public read-only data. When an actorId is given it is set as
   * the JWT subject so audit triggers record who caused the change.
   */
  asService<T>(fn: (c: DbClient) => Promise<T>, actorId?: string): Promise<T>;
  close(): Promise<void>;
}

// numeric -> number, bigint ids stay strings to avoid precision loss
pg.types.setTypeParser(1700, (v) => Number(v));
// date -> 'YYYY-MM-DD' as stored. The default parser builds a JS Date at local midnight, which shifts the
// calendar day when the server's time zone is not UTC. Campus dates are Asia/Manila calendar dates.
pg.types.setTypeParser(1082, (v) => v);

export function createDatabase(env: Env): Database {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.DATABASE_SSL_VERIFY, ...(env.DATABASE_SSL_CA_FILE ? { ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') } : {}) } : undefined,
    application_name: 'campusserve-backend',
  });

  async function inTransaction<T>(setup: (c: DbClient) => Promise<void>, fn: (c: DbClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('statement_timeout', $1, true)`, [String(env.DATABASE_STATEMENT_TIMEOUT_MS)]);
      await setup(client);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    asUser(actor, fn) {
      return inTransaction(async (c) => {
        await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
          JSON.stringify({ ...actor.claims, sub: actor.id, role: 'authenticated' }),
          actor.id,
        ]);
        await c.query('set local role authenticated');
      }, fn);
    },
    asService(fn, actorId) {
      return inTransaction(async (c) => {
        await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
          JSON.stringify(actorId ? { sub: actorId, role: 'service_role' } : { role: 'service_role' }),
          actorId ?? '',
        ]);
        await c.query('set local role service_role');
      }, fn);
    },
    close: () => pool.end(),
  };
}

/** Wraps a value so it is sent as JSON text (for jsonb parameters). */
export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Calls a CampusServe database function with named arguments. Function names are fixed in code. */
export async function rpc<T = Record<string, unknown>>(
  c: DbClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error(`Invalid function name ${fn}`);
  const keys = Object.keys(args).filter((k) => args[k] !== undefined);
  for (const k of keys) if (!/^p_[a-z0-9_]+$/.test(k)) throw new Error(`Invalid argument name ${k}`);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const { rows } = await c.query(`select * from public.${fn}(${list})`, keys.map((k) => args[k]));
  return rows as T[];
}

export async function rpcOne<T = Record<string, unknown>>(c: DbClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const rows = await rpc<T>(c, fn, args);
  return rows[0] as T;
}

/** For functions returning a scalar (jsonb, integer, void): returns the single value. */
export async function rpcValue<T = unknown>(c: DbClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const row = await rpcOne<Record<string, unknown>>(c, fn, args);
  return (row ? Object.values(row)[0] : undefined) as T;
}

/**
 * Returns the first connection string that actually connects: DATABASE_URL, then DATABASE_URL_ALTERNATIVES
 * (comma-separated). Lets a local setup list both Supabase pooler hosts without knowing which one applies.
 */
export async function pickDatabaseUrl(env: Env, log: (msg: string) => void): Promise<string> {
  const candidates = [env.DATABASE_URL, ...(env.DATABASE_URL_ALTERNATIVES ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
  if (candidates.length === 1) return env.DATABASE_URL;
  let lastError: unknown;
  for (const url of candidates) {
    const client = new pg.Client({
      connectionString: url, connectionTimeoutMillis: 10_000,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.DATABASE_SSL_VERIFY, ...(env.DATABASE_SSL_CA_FILE ? { ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') } : {}) } : undefined,
    });
    const host = url.replace(/^[^@]*@/, '').replace(/\/.*$/, '');
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      log(`database: connected via ${host}`);
      return url;
    } catch (e) {
      lastError = e;
      log(`database: ${host} did not work (${e instanceof Error ? e.message : String(e)})`);
      await client.end().catch(() => undefined);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No database connection string worked.');
}
