import type { Actor } from '../db/database.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      actor?: Actor;
    }
  }
}

export {};
