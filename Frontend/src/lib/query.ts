import { QueryClient, useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, type Page } from './api';
import { useToast } from '@/components/ui/toast';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

/** GET a list endpoint with server-side pagination. */
export function usePaged<T>(key: string, path: string, filters: Record<string, string | number | undefined> = {}, pageSize = 20) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [key, path, filters, page, pageSize],
    queryFn: () => api.page<T>(path, { ...filters, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  return { ...q, page, setPage };
}

export function useGet<T>(key: unknown[], path: string, query?: Record<string, string | number | boolean | undefined>, enabled = true) {
  return useQuery({ queryKey: [...key, path, query], queryFn: () => api.get<T>(path, query), enabled });
}

/**
 * A server action. Success is announced only after the backend confirms it; nothing is updated optimistically.
 * `invalidate` lists query-key prefixes to refresh afterwards.
 */
export function useAction<TVars, TResult = unknown>(fn: (v: TVars) => Promise<TResult>, opts: {
  success?: string | ((r: TResult) => string); invalidate?: string[]; onSuccess?: (r: TResult) => void; silentError?: boolean;
} = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: [k] })));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => { if (!opts.silentError) toast.error('Not saved', e instanceof Error ? e.message : undefined); },
  });
}

export type { Page };
