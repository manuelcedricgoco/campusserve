import type { ModuleContext } from './context.js';
import { healthModule } from './health/health.routes.js';
import { meModule } from './me/me.routes.js';

/** Registers every feature module. Order matters only for overlapping paths. */
export function registerModules(ctx: ModuleContext) {
  healthModule(ctx);
  meModule(ctx);
}
