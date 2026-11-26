import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { handler, idParams, optionalText, pagination, send, text } from '../../http/http.js';
import { rpc, rpcOne, type DbClient } from '../../db/database.js';
import { AppError, forbidden, notFound } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';
import { elevate, hasAnywhere, hasGlobal, hasOffice, isActiveUser, paged, singleFile } from '../shared.js';
import { validateUpload } from '../../integrations/storage/storage.js';
import { mockEmbedding, type SourceChunk } from '../../integrations/ai-providers/provider.js';
import { processDocument, toVector } from './knowledge.js';

const MAX_KNOWLEDGE_BYTES = 20 * 1024 * 1024;
const PUBLIC_SESSION_HOURS = 2;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface Setting { id: string; provider: string; model: string; embedding_dimensions: number | null; secret_ref: string | null;
  max_requests_per_user_per_day: number; max_input_tokens: number | null; max_output_tokens: number | null; timeout_ms: number | null; temperature: number | null }

interface AiConfig { chat?: Setting; embedding?: Setting; templates: Record<string, { id: string; body: string }> }

/** Provider settings and prompts are admin-only under RLS, so the server reads them with the service role. */
async function loadConfig(c: DbClient): Promise<AiConfig> {
  const settings = (await c.query(`select * from public.ai_provider_settings where is_enabled and is_default`)).rows as (Setting & { purpose: string })[];
  const templates = (await c.query(
    `select distinct on (code) code, id, body from public.ai_prompt_templates where is_active order by code, version desc`)).rows;
  return {
    chat: settings.find((s) => s.purpose === 'chat'),
    embedding: settings.find((s) => s.purpose === 'embedding'),
    templates: Object.fromEntries(templates.map((t) => [t.code, { id: t.id, body: t.body }])),
  };
}

/** AI assistant. Answers only from permission-filtered sources; it has no write tools and decides nothing. */
export function aiModule({ deps, authed, publicRouter }: ModuleContext) {
  const { db, ai, storage } = deps;

  /** Retrieval as the caller (RLS + search_knowledge permission filter). */
  const config = () => db.asService(loadConfig);

  async function retrieve(c: DbClient, cfg: AiConfig, question: string, publicOnly: boolean) {
    const emb = cfg.embedding;
    let vector: string | null = null;
    if (emb?.embedding_dimensions) {
      const [v] = await ai.embed(emb.provider, [question], emb.model, emb.embedding_dimensions, emb.secret_ref);
      vector = v ? toVector(v) : null;
    }
    const rows = await rpc<Record<string, any>>(c, 'search_knowledge', {
      p_query_text: question, p_query_embedding: vector, p_provider_setting_id: vector ? emb!.id : null,
      p_match_count: 6, p_public_only: publicOnly,
    });
    return rows.map((r, i): SourceChunk & { chunkId: string; documentId: string; similarity: number | null } => ({
      index: i + 1, documentTitle: r.document_title, sourceName: r.source_name, isOfficial: r.is_official, content: r.content,
      chunkId: r.chunk_id, documentId: r.document_id, similarity: r.similarity,
    }));
  }

  async function answer(c: DbClient, cfg: AiConfig, opts: { question: string; history: { role: 'user' | 'assistant'; content: string }[]; publicOnly: boolean }) {
    const chat = cfg.chat;
    if (!chat) throw new AppError(503, 'AI_NOT_CONFIGURED', 'The assistant is not configured.');
    const template = cfg.templates[opts.publicOnly ? 'public_assistant' : 'campus_assistant'];
    if (!template) throw new AppError(503, 'AI_NOT_CONFIGURED', 'The assistant prompt is not configured.');
    const sources = await retrieve(c, cfg, opts.question, opts.publicOnly);
    const t0 = Date.now();
    const out = await ai.chat(chat.provider, {
      system: template.body, history: opts.history, question: opts.question, sources, model: chat.model,
      maxOutputTokens: chat.max_output_tokens ?? 800, temperature: chat.temperature ?? 0.2, timeoutMs: chat.timeout_ms ?? 20000, secretRef: chat.secret_ref,
    });
    const citations = sources.slice(0, 3).map((s) => ({ index: s.index, documentId: s.documentId, chunkId: s.chunkId, title: s.documentTitle, source: s.sourceName, isOfficial: s.isOfficial }));
    return { chat, template, out, citations, latencyMs: Date.now() - t0 };
  }

  // ---- Signed-in assistant ----------------------------------------------------------------------
  authed.post('/ai/chat', handler({
    body: z.object({ message: text(2000), conversationId: z.uuid().optional() }).strict(),
  }, async (req, res, { body }) => {
    const actor = req.actor!;
    const cfg = await config();
    const result = await db.asUser(actor, async (c) => {
      if (!(await isActiveUser(c))) throw forbidden('Your account is not active yet.');
      const chatSetting = cfg.chat;
      const used = (await c.query(
        `select count(*)::int as n from public.ai_usage_logs where user_id = auth.uid() and feature = 'assistant'
            and status = 'succeeded' and created_at > now() - interval '1 day'`)).rows[0].n;
      if (chatSetting && used >= chatSetting.max_requests_per_user_per_day) {
        await elevate(c);
        await c.query(`insert into public.ai_usage_logs (user_id, channel, feature, provider, model, status, error_code) values ($1, 'authenticated', 'assistant', $2, $3, 'rate_limited', 'DAILY_LIMIT')`,
          [actor.id, chatSetting.provider, chatSetting.model]);
        return { limited: true as const };
      }
      let history: { role: 'user' | 'assistant'; content: string }[] = [];
      if (body.conversationId) {
        const conv = (await c.query(`select id from public.ai_conversations where id = $1 and user_id = auth.uid() and status = 'active'`, [body.conversationId])).rows[0];
        if (!conv) throw notFound('Conversation');
        history = (await c.query(
          `select role, content from (select role, content, created_at from public.ai_messages where conversation_id = $1 and role in ('user', 'assistant')
             order by created_at desc limit 10) m order by created_at`, [body.conversationId])).rows;
      }
      const a = await answer(c, cfg, { question: body.message, history, publicOnly: false });
      await elevate(c);
      const conversationId = body.conversationId ?? (await c.query(
        `insert into public.ai_conversations (user_id, channel, title) values ($1, 'authenticated', $2) returning id`,
        [actor.id, body.message.slice(0, 80)])).rows[0].id;
      await c.query(`insert into public.ai_messages (conversation_id, role, content) values ($1, 'user', $2)`, [conversationId, body.message]);
      const msg = (await c.query(
        `insert into public.ai_messages (conversation_id, role, content, citations, provider, model, prompt_template_id, input_tokens, output_tokens, latency_ms)
         values ($1, 'assistant', $2, $3::jsonb, $4, $5, $6, $7, $8, $9) returning id, created_at`,
        [conversationId, a.out.text, JSON.stringify(a.citations), a.chat.provider, a.chat.model, a.template.id, a.out.inputTokens, a.out.outputTokens, a.latencyMs])).rows[0];
      await c.query(`update public.ai_conversations set last_message_at = now() where id = $1`, [conversationId]);
      await c.query(
        `insert into public.ai_usage_logs (user_id, conversation_id, channel, feature, provider, model, input_tokens, output_tokens, latency_ms, status)
         values ($1, $2, 'authenticated', 'assistant', $3, $4, $5, $6, $7, 'succeeded')`,
        [actor.id, conversationId, a.chat.provider, a.chat.model, a.out.inputTokens, a.out.outputTokens, a.latencyMs]);
      return { limited: false as const, conversationId, messageId: msg.id, answer: a.out.text, citations: a.citations, provider: a.chat.provider, createdAt: msg.created_at };
    });
    if (result.limited) throw new AppError(429, 'AI_DAILY_LIMIT', 'You have reached today\'s assistant limit. Please try again tomorrow.');
    send(res, { ...result, limited: undefined, isMock: result.provider === 'mock' });
  }));

  authed.get('/ai/conversations', handler({ query: pagination }, async (req, res, { query }) => {
    const r = await db.asUser(req.actor!, (c) => paged(c,
      `select id, title, status, last_message_at, created_at from public.ai_conversations where user_id = auth.uid() and status = 'active'`,
      [], query, 'last_message_at desc nulls last'));
    send(res, r.rows, 200, r.meta);
  }));

  authed.get('/ai/conversations/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const conv = (await c.query(`select * from public.ai_conversations where id = $1 and user_id = auth.uid() and status = 'active'`, [params.id])).rows[0];
      if (!conv) return null;
      const messages = (await c.query(
        `select id, role, content, citations, provider, created_at from public.ai_messages where conversation_id = $1 and role in ('user', 'assistant') order by created_at`,
        [params.id])).rows;
      return { ...conv, messages };
    });
    if (!data) throw notFound('Conversation');
    send(res, data);
  }));

  authed.delete('/ai/conversations/:id', handler({ params: idParams }, async (req, res, { params }) => {
    const ok = await db.asUser(req.actor!, async (c) => {
      const conv = (await c.query(`select id from public.ai_conversations where id = $1 and user_id = auth.uid()`, [params.id])).rows[0];
      if (!conv) return false;
      await elevate(c);
      await c.query(`delete from public.ai_conversations where id = $1`, [params.id]);
      return true;
    });
    if (!ok) throw notFound('Conversation');
    res.status(204).end();
  }));

  authed.post('/ai/messages/:id/feedback', handler({
    params: idParams, body: z.object({ rating: z.union([z.literal(-1), z.literal(1)]), reason: optionalText(60), comment: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'ai_submit_feedback', {
      p_message_id: params.id, p_rating: body.rating, p_reason: body.reason ?? null, p_comment: body.comment ?? null })), 201);
  }));

  // ---- Public (signed-out) assistant: public sources only, short-lived anonymous session ---------
  publicRouter.post('/ai/chat', handler({
    body: z.object({ message: text(1000), sessionToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/).optional() }).strict(),
  }, async (_req, res, { body }) => {
    const token = body.sessionToken ?? randomBytes(32).toString('base64url');
    const hash = sha256(token);
    const cfg = await config();
    const result = await db.asService(async (c) => {
      let conv = (await c.query(
        `select id from public.ai_conversations where channel = 'public' and public_session_hash = $1 and expires_at > now()`, [hash])).rows[0];
      const history = conv ? (await c.query(
        `select role, content from (select role, content, created_at from public.ai_messages where conversation_id = $1 and role in ('user','assistant')
           order by created_at desc limit 6) m order by created_at`, [conv.id])).rows : [];
      const a = await answer(c, cfg, { question: body.message, history, publicOnly: true });
      if (!conv) {
        conv = (await c.query(
          `insert into public.ai_conversations (channel, public_session_hash, title, expires_at) values ('public', $1, $2, now() + make_interval(hours => $3)) returning id`,
          [hash, body.message.slice(0, 80), PUBLIC_SESSION_HOURS])).rows[0];
      }
      await c.query(`insert into public.ai_messages (conversation_id, role, content) values ($1, 'user', $2)`, [conv.id, body.message]);
      await c.query(
        `insert into public.ai_messages (conversation_id, role, content, citations, provider, model, prompt_template_id, input_tokens, output_tokens, latency_ms)
         values ($1, 'assistant', $2, $3::jsonb, $4, $5, $6, $7, $8, $9)`,
        [conv.id, a.out.text, JSON.stringify(a.citations), a.chat.provider, a.chat.model, a.template.id, a.out.inputTokens, a.out.outputTokens, a.latencyMs]);
      await c.query(`update public.ai_conversations set last_message_at = now() where id = $1`, [conv.id]);
      await c.query(
        `insert into public.ai_usage_logs (conversation_id, channel, feature, provider, model, input_tokens, output_tokens, latency_ms, status)
         values ($1, 'public', 'assistant', $2, $3, $4, $5, $6, 'succeeded')`,
        [conv.id, a.chat.provider, a.chat.model, a.out.inputTokens, a.out.outputTokens, a.latencyMs]);
      return { answer: a.out.text, citations: a.citations, provider: a.chat.provider };
    });
    send(res, { ...result, sessionToken: token, isMock: result.provider === 'mock' });
  }));

  // ---- Knowledge management ---------------------------------------------------------------------
  authed.get('/ai/sources', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select s.*, (select count(*)::int from public.ai_knowledge_documents d where d.source_id = s.id and d.is_current) as document_count
         from public.ai_knowledge_sources s order by s.name`)).rows));
  }));

  authed.post('/ai/sources', handler({
    body: z.object({
      name: text(160), sourceType: z.enum(['official_policy', 'office_guide', 'faq', 'announcement', 'general']), visibility: z.enum(['public', 'authenticated', 'permission']),
      requiredPermission: z.string().max(60).optional(), ownerOfficeId: z.uuid().optional(), ownerOrganizationId: z.uuid().optional(), description: optionalText(1000),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'ai_register_knowledge_source', {
      p_name: body.name, p_source_type: body.sourceType, p_visibility: body.visibility, p_required_permission: body.requiredPermission ?? null,
      p_owner_office_id: body.ownerOfficeId ?? null, p_owner_organization_id: body.ownerOrganizationId ?? null, p_description: body.description ?? null })), 201);
  }));

  authed.post('/ai/sources/:id/official', handler({ params: idParams, body: z.object({ isOfficial: z.boolean() }).strict() }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'ai_approve_official_source', { p_source_id: params.id, p_is_official: body.isOfficial })));
  }));

  authed.get('/ai/sources/:id/documents', handler({ params: idParams }, async (req, res, { params }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select d.id, d.title, d.version, d.origin, d.mime_type, d.size_bytes, d.processing_status, d.processing_error, d.is_current, d.created_at, d.processed_at,
              (select count(*)::int from public.ai_document_chunks ch where ch.document_id = d.id) as chunk_count
         from public.ai_knowledge_documents d where d.source_id = $1 order by d.created_at desc`, [params.id])).rows));
  }));

  /** Registers a document as the caller (permission checked in the DB), then processes it as the service role. */
  async function ingest(actorReq: { actor?: { id: string } }, sourceId: string, title: string, file?: { data: Buffer; mime: string; name: string; size: number }, manualText?: string, replaces?: string) {
    const actor = actorReq.actor! as Parameters<typeof db.asUser>[0];
    const path = file ? `${sourceId}/${createHash('sha256').update(file.data).digest('hex').slice(0, 16)}-${file.name}` : null;
    const doc = await db.asUser(actor, (c) => rpcOne<{ id: string }>(c, 'ai_register_document', {
      p_source_id: sourceId, p_title: title, p_origin: file ? 'upload' : 'manual', p_storage_path: path, p_mime_type: file?.mime ?? null,
      p_size_bytes: file?.size ?? null, p_checksum_sha256: file ? createHash('sha256').update(file.data).digest('hex') : null,
      p_replaces_document_id: replaces ?? null,
    }));
    if (file && path) await storage.upload('ai-knowledge', path, file.data, file.mime);
    const outcome = await db.asService((c) => processDocument(c, ai, doc.id, file ? { data: file.data, mime: file.mime } : { text: manualText }), actor.id);
    return { documentId: doc.id, ...outcome };
  }

  authed.post('/ai/sources/:id/documents', singleFile(MAX_KNOWLEDGE_BYTES), handler({
    params: idParams, body: z.object({ title: text(200), replacesDocumentId: z.uuid().optional() }),
  }, async (req, res, { params, body }) => {
    const { type, name } = validateUpload(req.file, ['application/pdf', 'text/plain', 'text/markdown', 'text/html'], MAX_KNOWLEDGE_BYTES);
    send(res, await ingest(req, params.id, body.title, { data: req.file!.buffer, mime: type, name, size: req.file!.size }, undefined, body.replacesDocumentId), 201);
  }));

  authed.post('/ai/sources/:id/documents/manual', handler({
    params: idParams, body: z.object({ title: text(200), content: text(100_000, 20), replacesDocumentId: z.uuid().optional() }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await ingest(req, params.id, body.title, undefined, body.content, body.replacesDocumentId), 201);
  }));

  // ---- Request classification: a suggestion for staff, never a decision --------------------------
  authed.post('/ai/requests/:id/suggest-category', handler({ params: idParams }, async (req, res, { params }) => {
    const data = await db.asUser(req.actor!, async (c) => {
      const r = (await c.query(`select id, office_id, purpose, details from public.service_requests where id = $1`, [params.id])).rows[0];
      if (!r) throw notFound('Request');
      if (!(await hasOffice(c, r.office_id, 'requests.manage'))) throw forbidden();
      const services = (await c.query(
        `select code, name, coalesce(description, '') as description from public.services where is_active and service_kind in ('request', 'both')`)).rows;
      const emb = (await config()).embedding;
      const dims = emb?.embedding_dimensions ?? 384;
      const embed = async (texts: string[]) => emb ? ai.embed(emb.provider, texts, emb.model, dims, emb.secret_ref) : texts.map((t) => mockEmbedding(t, dims));
      const [q, ...vs] = await embed([`${r.purpose} ${r.details ?? ''}`, ...services.map((s) => `${s.name} ${s.description}`)]);
      const cos = (a: number[], b: number[]) => a.reduce((acc, x, i) => acc + x * (b[i] ?? 0), 0);
      const ranked = services.map((s, i) => ({ code: s.code as string, name: s.name as string, score: Math.max(0, cos(q!, vs[i]!)) })).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best) throw new AppError(422, 'NO_CATEGORIES', 'There are no request categories to suggest from.');
      const confidence = Math.min(0.99, Number(best.score.toFixed(2)));
      await rpc(c, 'record_request_ai_suggestion', { p_request_id: params.id, p_category: best.code, p_confidence: confidence });
      return { suggestedCategory: best.code, confidence, alternatives: ranked.slice(1, 3), provider: emb?.provider ?? 'mock', note: 'Suggestion only; staff decide.' };
    });
    send(res, data);
  }));

  authed.get('/ai/usage', handler({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => {
      if (!(await hasGlobal(c, 'ai.view_usage')) && !(await hasAnywhere(c, 'ai.view_usage'))) throw forbidden();
      return (await c.query(
        `select date_trunc('day', created_at)::date as day, channel, feature, provider, status, count(*)::int as requests,
                coalesce(sum(input_tokens), 0)::int as input_tokens, coalesce(sum(output_tokens), 0)::int as output_tokens, round(avg(latency_ms))::int as avg_latency_ms
           from public.ai_usage_logs where created_at > now() - make_interval(days => $1) group by 1, 2, 3, 4, 5 order by 1 desc, 2, 3`, [query.days])).rows;
    }));
  }));
}
