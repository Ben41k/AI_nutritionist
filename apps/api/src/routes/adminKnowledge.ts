import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { chunkText } from '../lib/chunkText.js';
import { createEmbedding } from '../lib/openrouter.js';
import { insertChunkWithEmbedding } from '../lib/vectorSearch.js';

const createDocBody = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(500000),
});

function requireAdmin(
  req: Parameters<typeof getBearerUser>[0],
  reply: import('fastify').FastifyReply,
): boolean {
  const u = getBearerUser(req);
  if (!u) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
    return false;
  }
  if (u.role !== 'ADMIN') {
    sendError(reply, 403, 'FORBIDDEN', 'Admin only');
    return false;
  }
  return true;
}

export async function registerAdminKnowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/knowledge/documents', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const docs = await prisma.knowledgeDocument.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
    await reply.send({
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        chunkCount: d._count.chunks,
      })),
    });
  });

  app.get('/admin/knowledge/documents/:documentId', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { documentId } = req.params as { documentId: string };
    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          select: { id: true, chunkIndex: true, content: true },
        },
      },
    });
    if (!doc) {
      sendError(reply, 404, 'NOT_FOUND', 'Document not found');
      return;
    }
    await reply.send({ document: doc });
  });

  app.post('/admin/knowledge/documents', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = createDocBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const { title, content } = parsed.data;
    const doc = await prisma.knowledgeDocument.create({
      data: { title, content },
    });

    const chunks = chunkText(content);
    let idx = 0;
    for (const text of chunks) {
      const embedding = await createEmbedding(text);
      await insertChunkWithEmbedding(prisma, {
        id: randomUUID(),
        documentId: doc.id,
        chunkIndex: idx,
        content: text,
        embedding,
      });
      idx += 1;
    }

    await reply.status(201).send({ document: { id: doc.id, title: doc.title, chunks: idx } });
  });

  app.delete('/admin/knowledge/documents/:documentId', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { documentId } = req.params as { documentId: string };
    await prisma.knowledgeDocument.deleteMany({ where: { id: documentId } });
    await reply.send({ ok: true });
  });
}
