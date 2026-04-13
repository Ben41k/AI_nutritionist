import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerMealRoutes } from './routes/meals.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAdminKnowledgeRoutes } from './routes/adminKnowledge.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: config.isProd ? 'info' : 'debug',
      transport: config.isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true },
          },
    },
    bodyLimit: 1_048_576,
    genReqId: () => randomUUID(),
  });

  await app.register(cookie, { secret: config.jwtSecret });
  await app.register(cors, {
    origin: config.clientOrigin,
    credentials: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: 400,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request error');
    if (reply.sent) return;
    const e = err as Error & { statusCode?: number };
    const status = e.statusCode ?? 500;
    const code = status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR';
    const message = status === 500 ? 'Internal server error' : e.message;
    void reply.status(status).send({ error: { code, message } });
  });

  await registerAuthRoutes(app);
  await registerProfileRoutes(app);
  await registerMealRoutes(app);

  await app.register(
    async (scope) => {
      await scope.register(rateLimit, {
        global: true,
        max: 40,
        timeWindow: '1 minute',
      });
      await registerChatRoutes(scope);
    },
    { prefix: '/' },
  );

  await registerAdminKnowledgeRoutes(app);

  app.get('/health', async () => ({ ok: true }));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`API listening on ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
