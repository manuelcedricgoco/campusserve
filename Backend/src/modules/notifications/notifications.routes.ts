import { z } from 'zod';
import { handler, idParams, pagination, send } from '../../http/http.js';
import { notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { paged } from '../shared.js';

/** In-app notifications. Users can only read and mark their own (RLS + column grant on read_at). */
export function notificationsModule({ deps, authed }: ModuleContext) {
  const { db } = deps;

  authed.get('/notifications', handler({ query: pagination.extend({ unread: z.enum(['true', 'false']).optional() }) }, async (req, res, { query }) => {
    const result = await db.asUser(req.actor!, async (c) => {
      const page = await paged(c, `select * from public.notifications where user_id = auth.uid() and ($1::boolean is null or (read_at is null) = $1)`,
        [query.unread === undefined ? null : query.unread === 'true'], query, 'created_at desc');
      const unread = (await c.query(`select count(*)::int as n from public.notifications where user_id = auth.uid() and read_at is null`)).rows[0].n;
      return { ...page, unread };
    });
    send(res, result.rows, 200, { ...result.meta, unread: result.unread });
  }));

  authed.post('/notifications/:id/read', handler({ params: idParams }, async (req, res, { params }) => {
    const row = await db.asUser(req.actor!, async (c) => (await c.query(
      `update public.notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = auth.uid() returning *`, [params.id])).rows[0]);
    if (!row) throw notFound('Notification');
    send(res, row);
  }));

  authed.post('/notifications/read-all', handler({}, async (req, res) => {
    const n = await db.asUser(req.actor!, async (c) => (await c.query(
      `update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null`)).rowCount);
    send(res, { updated: n ?? 0 });
  }));
}
