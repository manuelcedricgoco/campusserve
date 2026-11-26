/** Public configuration only. Secrets never reach the browser. */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  apiUrl: ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, ''),
  /** Developer tokens are honoured only in `vite dev` with VITE_DEV_AUTH=true, never in a production build. */
  devAuth: import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true',
};
