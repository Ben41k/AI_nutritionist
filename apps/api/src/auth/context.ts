import type { FastifyRequest } from 'fastify';
import { verifyToken, authCookie, type JwtPayload } from '../lib/jwt.js';

export type AuthedUser = JwtPayload;

export function getBearerUser(req: FastifyRequest): AuthedUser | null {
  const raw = req.cookies[authCookie.name];
  if (!raw) return null;
  try {
    return verifyToken(raw);
  } catch {
    return null;
  }
}

export function requireUser(req: FastifyRequest): AuthedUser {
  const u = getBearerUser(req);
  if (!u) {
    const err = new Error('Unauthorized');
    (err as { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return u;
}
