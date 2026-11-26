import type { DbClient } from '../../db/database.js';
import { rpc } from '../../db/database.js';
import type { AiProvider } from '../../integrations/ai-providers/provider.js';

export interface Chunk { heading: string | null; content: string }

/** Plain text from supported formats. PDF and DOCX extraction are not implemented (no extractor installed). */
export function extractText(data: Buffer, mime: string): string {
  const text = data.toString('utf8');
  if (mime === 'text/html') {
    return text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n${'#'.repeat(Number(n))} `)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  if (mime === 'text/plain' || mime === 'text/markdown') return text.replace(/\r\n/g, '\n').trim();
  throw new Error(`Text extraction for ${mime} is not available yet.`);
}

/** Splits text into ~maxChars chunks on headings and paragraphs, keeping the nearest heading. */
export function chunkText(text: string, maxChars = 900): Chunk[] {
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let buf = '';
  const flush = () => { if (buf.trim()) chunks.push({ heading, content: buf.trim() }); buf = ''; };
  for (const block of text.split(/\n\s*\n/)) {
    const h = block.match(/^#{1,6}\s+(.+)$/m);
    if (h && block.trim().startsWith('#')) { flush(); heading = h[1]!.trim().slice(0, 200); }
    const body = block.trim();
    if (!body) continue;
    if (buf.length + body.length + 2 > maxChars) flush();
    if (body.length > maxChars) {
      for (const sentence of body.split(/(?<=[.!?])\s+/)) {
        if (buf.length + sentence.length + 1 > maxChars) flush();
        buf += (buf ? ' ' : '') + sentence.slice(0, maxChars);
      }
    } else buf += (buf ? '\n\n' : '') + body;
  }
  flush();
  return chunks;
}

const toVector = (v: number[]) => `[${v.join(',')}]`;

/**
 * Document pipeline (service role): extraction -> chunking -> embedding -> indexing, each stage logged.
 * On any failure the stage is recorded as failed with the error, and the document is not searchable.
 */
export async function processDocument(c: DbClient, ai: AiProvider, documentId: string, source: { data?: Buffer; mime?: string; text?: string }) {
  const stage = (s: string, status: string, extra: { ms?: number; error?: string; details?: unknown } = {}) =>
    rpc(c, 'ai_record_processing_stage', {
      p_document_id: documentId, p_stage: s, p_status: status, p_duration_ms: extra.ms ?? null,
      p_error_message: extra.error ?? null, p_details: JSON.stringify(extra.details ?? {}),
    });
  let current = 'extraction';
  try {
    let t0 = Date.now();
    await stage('extraction', 'started');
    const text = source.text ?? extractText(source.data!, source.mime!);
    if (!text.trim()) throw new Error('The document has no extractable text.');
    await stage('extraction', 'succeeded', { ms: Date.now() - t0, details: { characters: text.length } });

    current = 'chunking'; t0 = Date.now();
    await stage('chunking', 'started');
    const chunks = chunkText(text);
    await c.query(`delete from public.ai_document_chunks where document_id = $1`, [documentId]);
    const ids: string[] = [];
    for (const [i, ch] of chunks.entries()) {
      ids.push((await c.query(
        `insert into public.ai_document_chunks (document_id, chunk_index, heading, content, token_count)
         values ($1, $2, $3, $4, $5) returning id`, [documentId, i, ch.heading, ch.content, Math.ceil(ch.content.length / 4)])).rows[0].id);
    }
    await stage('chunking', 'succeeded', { ms: Date.now() - t0, details: { chunks: chunks.length } });

    current = 'embedding'; t0 = Date.now();
    await stage('embedding', 'started');
    const setting = (await c.query(
      `select id, provider, model, embedding_dimensions, secret_ref from public.ai_provider_settings
        where purpose = 'embedding' and is_enabled and is_default limit 1`)).rows[0];
    if (setting) {
      const vectors = await ai.embed(setting.provider, chunks.map((ch) => `${ch.heading ?? ''}\n${ch.content}`), setting.model, setting.embedding_dimensions, setting.secret_ref);
      for (const [i, v] of vectors.entries()) {
        await c.query(
          `insert into public.ai_embeddings (chunk_id, provider_setting_id, model, dimensions, embedding) values ($1, $2, $3, $4, $5::extensions.vector)`,
          [ids[i], setting.id, setting.model, setting.embedding_dimensions, toVector(v)]);
      }
    }
    await stage('embedding', 'succeeded', { ms: Date.now() - t0, details: { embedded: setting ? chunks.length : 0, provider: setting?.provider ?? null } });

    current = 'indexing';
    await stage('indexing', 'started');
    await stage('indexing', 'succeeded', { details: { searchable: true } });
    return { status: 'ready' as const, chunks: chunks.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await stage(current, 'failed', { error: error.slice(0, 500) });
    return { status: 'failed' as const, error };
  }
}

export { toVector };
