import { send } from '../../http/http.js';
import { AppError } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';

export function healthModule({ deps, api }: ModuleContext) {
  api.get('/health', (_req, res) => send(res, { status: 'ok', service: 'campusserve-backend' }));

  api.get('/health/ready', async (_req, res, next) => {
    try {
      await deps.db.pool.query('select 1');
      send(res, { status: 'ready', database: 'ok' });
    } catch {
      next(new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is not reachable.'));
    }
  });
}
