/** Public configuration only. Secrets never reach the browser. */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  apiUrl: ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, ''),
  /**
   * Map tiles. OpenStreetMap's public tile servers are for light use only; set a production tile provider
   * (with its attribution) for deployment.
   */
  mapTileUrl: (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution: (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  /** Developer tokens are honoured only in `vite dev` with VITE_DEV_AUTH=true, never in a production build. */
  devAuth: import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true',
};
