import type { Router } from 'express';
import type { AppDeps } from '../app.js';

export interface ModuleContext {
  deps: AppDeps;
  /** Unauthenticated routes under /api/v1 (health only). */
  api: Router;
  /** Routes that require a verified Supabase session. */
  authed: Router;
  /** Signed-out routes under /api/v1/public (rate limited, served with p_public_only). */
  publicRouter: Router;
  /** Provider webhooks under /api/v1/webhooks (raw body). */
  webhooks: Router;
}
