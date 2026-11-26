import { pino } from 'pino';
import { loadEnv } from './config/env.js';
import { loadDotEnv } from './config/dotenv.js';
import { createDatabase, pickDatabaseUrl } from './db/database.js';
import { createTokenVerifier } from './auth/token-verifier.js';
import { createStorage } from './integrations/storage/storage.js';
import { createPaymentRegistry } from './integrations/payment-providers/registry.js';
import { createAiProvider } from './integrations/ai-providers/provider.js';
import { createApp } from './app.js';

loadDotEnv();
const loaded = loadEnv();
const logger = pino({ level: loaded.LOG_LEVEL, redact: ['*.password', '*.token', '*.secret'] });
const env = { ...loaded, DATABASE_URL: await pickDatabaseUrl(loaded, (m) => logger.info(m)) };
const db = createDatabase(env);
const app = createApp({
  env,
  db,
  logger,
  verifyToken: createTokenVerifier(env),
  storage: createStorage(env),
  payments: createPaymentRegistry(env),
  ai: createAiProvider({ baseUrls: JSON.parse(env.AI_PROVIDER_BASE_URLS) as Record<string, string>, env: process.env }),
});

if (env.PAYMENT_SANDBOX) logger.warn('PAYMENT SANDBOX ENABLED: simulated payments only, no money moves.');

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'CampusServe API listening');
  if (env.SERVE_STATIC_DIR) console.log(`\n  CampusServe is running: open http://localhost:${env.PORT}\n`);
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await db.close().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
