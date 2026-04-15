import type { FastifyRequest } from 'fastify';
import { getBearerUser } from '../auth/context.js';

/** Distinct keys for OpenRouter-heavy routes (prefer user id when authenticated). */
export function openRouterRateLimitKey(req: FastifyRequest): string {
  const u = getBearerUser(req);
  if (u) return `or:u:${u.sub}`;
  return `or:ip:${req.ip}`;
}
