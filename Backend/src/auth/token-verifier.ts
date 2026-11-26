import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../config/env.js';
import type { Actor } from '../db/database.js';
import { AppError } from '../http/errors.js';

export type TokenVerifier = (token: string) => Promise<Actor>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies Supabase Auth access tokens server-side. Supports Supabase asymmetric signing keys (JWKS) and
 * the legacy HS256 JWT secret. The user id and role are taken only from a verified token.
 */
export function createTokenVerifier(env: Env): TokenVerifier {
  const jwksUrl = env.SUPABASE_JWKS_URL ?? (env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json` : undefined);
  const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;
  const secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;
  const issuer = env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1` : undefined;

  return async (token: string) => {
    let payload: JWTPayload;
    try {
      const { alg } = decodeProtectedHeader(token);
      const options = { audience: env.JWT_AUDIENCE, issuer, clockTolerance: 5 };
      if (alg === 'HS256') {
        if (!secret) throw new Error('HS256 tokens are not accepted');
        payload = (await jwtVerify(token, secret, { ...options, algorithms: ['HS256'] })).payload;
      } else {
        if (!jwks) throw new Error('No JWKS configured');
        payload = (await jwtVerify(token, jwks, { ...options, algorithms: ['RS256', 'ES256', 'EdDSA'] })).payload;
      }
    } catch (e) {
      // A key-server outage must not look like an expired session: report it as 503 and keep the cause.
      const tokenProblem = e instanceof errors.JOSEError && !(e instanceof errors.JWKSTimeout);
      if (!tokenProblem && e instanceof Error && !/tokens are not accepted|No JWKS configured|Invalid Compact JWS|Invalid Token/i.test(e.message)) {
        throw new AppError(503, 'AUTH_UNAVAILABLE', 'Sign-in could not be checked right now. Please try again shortly.', undefined, e);
      }
      throw new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired. Sign in again.');
    }
    if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
      throw new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired. Sign in again.');
    }
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      claims: { sub: payload.sub, role: 'authenticated', email: payload.email, aal: payload.aal, session_id: payload.session_id },
    };
  };
}
