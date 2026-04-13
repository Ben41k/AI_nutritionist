import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken, authCookie } from '../lib/jwt.js';
import { sendError } from '../lib/errors.js';
import { config } from '../config.js';
import { Role } from '@prisma/client';
import { getBearerUser } from '../auth/context.js';

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginBody = registerBody;

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const { email, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      sendError(reply, 409, 'EMAIL_TAKEN', 'Email already registered');
      return;
    }
    const passwordHash = await hashPassword(password);
    const isBootstrapAdmin =
      config.bootstrapAdminEmail && email.toLowerCase() === config.bootstrapAdminEmail;
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role: isBootstrapAdmin ? Role.ADMIN : Role.USER,
        profile: {
          create: {},
        },
      },
    });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    reply.setCookie(authCookie.name, token, {
      path: '/',
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: authCookie.maxAgeSec,
    });
    await reply.send({ user: { id: user.id, email: user.email, role: user.role } });
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      sendError(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      return;
    }
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    reply.setCookie(authCookie.name, token, {
      path: '/',
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: authCookie.maxAgeSec,
    });
    await reply.send({ user: { id: user.id, email: user.email, role: user.role } });
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(authCookie.name, { path: '/' });
    await reply.send({ ok: true });
  });

  app.get('/auth/me', async (req, reply) => {
    const u = getBearerUser(req);
    if (!u) {
      await reply.send({ user: null });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: u.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      reply.clearCookie(authCookie.name, { path: '/' });
      await reply.send({ user: null });
      return;
    }
    await reply.send({ user });
  });
}
