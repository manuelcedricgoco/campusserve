import { env } from './env';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as { path: string; message: string }[]).map((d) => [d.path, d.message]));
  }
}

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;
let onUnauthorized: () => void = () => undefined;

export function configureApi(opts: { getToken: TokenGetter; onUnauthorized: () => void }) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

export interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number; [k: string]: unknown } }

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const url = `${env.apiUrl}/api/v1${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; form?: FormData; headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach CampusServe. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  if (opts.raw && res.ok) return (await res.blob()) as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 401) onUnauthorized();
    throw new ApiError(res.status, e.code ?? 'HTTP_ERROR', e.message ?? `Request failed (${res.status}).`, e.details, e.requestId);
  }
  return json as T;
}

/** Unwraps `{ data }`. */
async function data<T>(p: Promise<{ data: T }>) { return (await p).data; }

export const api = {
  get: <T>(path: string, query?: Query) => data(request<{ data: T }>('GET', path, { query })),
  page: <T>(path: string, query?: Query) => request<Page<T>>('GET', path, { query }),
  post: <T>(path: string, body: unknown = {}, headers?: Record<string, string>) => data(request<{ data: T }>('POST', path, { body, headers })),
  put: <T>(path: string, body: unknown) => data(request<{ data: T }>('PUT', path, { body })),
  patch: <T>(path: string, body: unknown) => data(request<{ data: T }>('PATCH', path, { body })),
  del: (path: string) => request<void>('DELETE', path),
  upload: <T>(path: string, form: FormData) => data(request<{ data: T }>('POST', path, { form })),
  blob: (path: string, query?: Query) => request<Blob>('GET', path, { query, raw: true }),
};
