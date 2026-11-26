import type { ModuleContext } from './context.js';
import { healthModule } from './health/health.routes.js';
import { meModule } from './me/me.routes.js';
import { catalogModule } from './catalog/catalog.routes.js';
import { queueModule } from './queue/queue.routes.js';
import { requestsModule } from './requests/requests.routes.js';
import { receiptsModule } from './receipts/receipts.routes.js';
import { officesModule } from './offices/offices.routes.js';
import { clearanceModule } from './clearance/clearance.routes.js';
import { violationsModule } from './violations/violations.routes.js';
import { paymentsModule } from './payments/payments.routes.js';
import { notificationsModule } from './notifications/notifications.routes.js';
import { reportsModule } from './reports/reports.routes.js';
import { adminModule } from './admin/admin.routes.js';

/** Registers every feature module. */
export function registerModules(ctx: ModuleContext) {
  healthModule(ctx);
  meModule(ctx);
  catalogModule(ctx);
  queueModule(ctx);
  requestsModule(ctx);
  receiptsModule(ctx);
  officesModule(ctx);
  clearanceModule(ctx);
  violationsModule(ctx);
  paymentsModule(ctx);
  notificationsModule(ctx);
  reportsModule(ctx);
  adminModule(ctx);
}
