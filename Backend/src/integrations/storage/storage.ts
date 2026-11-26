import { createClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../http/errors.js';

/** Private file storage. Files are only reachable through short-lived signed URLs issued by the backend. */
export interface StorageAdapter {
  upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void>;
  signedUrl(bucket: string, path: string, expiresInSeconds?: number): Promise<string>;
  remove(bucket: string, path: string): Promise<void>;
}

export function createStorage(env: Env): StorageAdapter {
  if (env.STORAGE_MODE === 'memory') return createMemoryStorage();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase storage needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async upload(bucket, path, data, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, data, { contentType, upsert: false });
      if (error) throw new AppError(502, 'STORAGE_ERROR', 'The file could not be stored. Please try again.');
    },
    async signedUrl(bucket, path, expiresInSeconds = 300) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw new AppError(502, 'STORAGE_ERROR', 'The file link could not be created.');
      return data.signedUrl;
    },
    async remove(bucket, path) {
      await client.storage.from(bucket).remove([path]);
    },
  };
}

/** In-memory storage for tests and local development without Supabase Storage. */
export function createMemoryStorage(): StorageAdapter & { files: Map<string, { data: Buffer; contentType: string }> } {
  const files = new Map<string, { data: Buffer; contentType: string }>();
  return {
    files,
    async upload(bucket, path, data, contentType) {
      const key = `${bucket}/${path}`;
      if (files.has(key)) throw new AppError(409, 'FILE_EXISTS', 'A file already exists at this path.');
      files.set(key, { data, contentType });
    },
    async signedUrl(bucket, path) {
      if (!files.has(`${bucket}/${path}`)) throw new AppError(404, 'FILE_NOT_FOUND', 'File not found.');
      return `memory://${bucket}/${path}`;
    },
    async remove(bucket, path) {
      files.delete(`${bucket}/${path}`);
    },
  };
}

// ---- Upload validation ------------------------------------------------------
export type AllowedType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'text/plain' | 'text/markdown' | 'text/html' | 'application/geo+json';

/** Detects the real file type from its content (magic bytes), never trusting the client's MIME type. */
export function sniffType(data: Buffer, declared: string): AllowedType | null {
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  // Text formats: must be valid UTF-8 without NUL bytes; the declared subtype decides which.
  if (!data.includes(0) && Buffer.from(data.toString('utf8'), 'utf8').equals(data)) {
    if (declared === 'text/markdown' || declared === 'text/x-markdown') return 'text/markdown';
    if (declared === 'text/html') return 'text/html';
    if (declared === 'application/geo+json' || declared === 'application/json') return 'application/geo+json';
    if (declared === 'text/plain') return 'text/plain';
  }
  return null;
}

export function validateUpload(
  file: { buffer: Buffer; mimetype: string; size: number; originalname: string } | undefined,
  allowed: AllowedType[],
  maxBytes: number,
): { type: AllowedType; name: string } {
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Attach a file.');
  if (file.size === 0) throw new AppError(400, 'FILE_EMPTY', 'The file is empty.');
  if (file.size > maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `Files must be at most ${Math.round(maxBytes / 1048576)} MB.`);
  const type = sniffType(file.buffer, file.mimetype);
  if (!type || !allowed.includes(type)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `Allowed file types: ${allowed.join(', ')}.`);
  }
  const name = file.originalname.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'file';
  return { type, name };
}
