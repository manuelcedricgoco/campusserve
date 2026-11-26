import { pino } from 'pino';
import { loadEnv } from './config/env.js';
import { loadDotEnv } from './config/dotenv.js';
import { createDatabase } from './db/database.js';
import { runAutomationBatch } from './workers/automation-worker.js';

loadDotEnv();
const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const db = createDatabase(env);
let stopping = false;

async function loop() {
  while (!stopping) {
    try {
      const n = await runAutomationBatch(db, logger, `worker-${process.pid}`);
      if (n > 0) logger.info({ processed: n }, 'automation batch');
    } catch (e) {
      logger.error({ err: e }, 'worker iteration failed');
    }
    await new Promise((r) => setTimeout(r, env.WORKER_POLL_MS));
  }
  await db.close();
}

for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => { stopping = true; });
logger.info('CampusServe worker started');
void loop();
