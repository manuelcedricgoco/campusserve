import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { DbClient } from '../db/database.js';
import type { StorageAdapter } from '../integrations/storage/storage.js';
import { validateUpload } from '../integrations/storage/storage.js';

export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/**
 * Validates the uploaded file, stores it privately, then runs `record` (the metadata insert) in the same
 * transaction. If recording fails, the stored object is removed so no orphan is left behind.
 */
export async function storeUpload<T>(
  req: Request,
  storage: StorageAdapter,
  bucket: string,
  folder: string,
  maxBytes: number,
  record: (file: { path: string; name: string; type: string; size: number }) => Promise<T>,
): Promise<T> {
  const { type, name } = validateUpload(req.file, [...EVIDENCE_TYPES], maxBytes);
  const path = `${folder}/${randomUUID()}-${name}`;
  await storage.upload(bucket, path, req.file!.buffer, type);
  try {
    return await record({ path, name, type, size: req.file!.size });
  } catch (error) {
    await storage.remove(bucket, path).catch(() => undefined);
    throw error;
  }
}

export async function signed(storage: StorageAdapter, bucket: string, path: string) {
  return { url: await storage.signedUrl(bucket, path, 300), expiresInSeconds: 300 };
}

export type { DbClient };
