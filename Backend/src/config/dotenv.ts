import { existsSync } from 'node:fs';

/** Loads Backend/.env when present (Node's built-in loader). Real environment variables are not overridden. */
export function loadDotEnv(path = '.env') {
  if (existsSync(path)) process.loadEnvFile(path);
}
