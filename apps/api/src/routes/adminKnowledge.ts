import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendError } from '../lib/errors.js';
import { getBearerUser } from '../auth/context.js';
import { openRouterRateLimitKey } from '../lib/rateLimitKeys.js';
import {
  createKnowledgeDocumentIndexed,
  updateKnowledgeDocumentIndexed,
} from '../lib/knowledgeIndexing.js';
import { clampLimit, decodeCursor, encodeCursor } from '../lib/cursorPagination.js';

const createDocBody = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(500000),
});

const documentsListQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().optional(),
});

const patchDocBody = z
  .object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().min(1).max(500000).optional(),
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, {
    message: 'Provide title and/or content',
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
    const qParsed = documentsListQuery.safeParse(req.query);
    if (!qParsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid query', qParsed.error.flatten());
      return;
    }
    const limit = clampLimit(qParsed.data.limit);
    const rawCursor = qParsed.data.cursor?.trim();
    const cur = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && cur == null) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid cursor');
      return;
    }
    const take = limit + 1;
    const cursorWhere =
      cur != null
        ? {
            OR: [
              { updatedAt: { lt: new Date(cur.t) } },
              { AND: [{ updatedAt: new Date(cur.t) }, { id: { lt: cur.id } }] },
            ],
          }
        : {};

    const docs = await prisma.knowledgeDocument.findMany({
      where: cursorWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
      include: { _count: { select: { chunks: true } } },
    });

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ t: last.updatedAt.toISOString(), id: last.id })
        : undefined;

    await reply.send({
      documents: page.map((d) => ({
        id: d.id,
        title: d.title,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        chunkCount: d._count.chunks,
      })),
      hasMore,
      nextCursor,
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

  const knowledgeIndexRateLimit = {
    max: config.apiKnowledgeIndexRateLimitMax,
    timeWindow: config.apiKnowledgeIndexRateLimitWindow,
    hook: 'preHandler' as const,
    keyGenerator: openRouterRateLimitKey,
    groupId: 'knowledge-index',
  };

  app.post(
    '/admin/knowledge/documents',
    { config: { rateLimit: knowledgeIndexRateLimit } },
    async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = createDocBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    const { title, content } = parsed.data;
    try {
      const result = await createKnowledgeDocumentIndexed(prisma, title, content);
      await reply.status(201).send({
        document: { id: result.id, title: result.title, chunks: result.chunkCount },
      });
    } catch {
      sendError(reply, 502, 'EMBEDDING_FAILED', 'Failed to index document (embedding or DB error)');
    }
  });

  const uploadNamePattern = /\.(txt|md|markdown)$/i;

  app.post(
    '/admin/knowledge/documents/upload',
    { config: { rateLimit: knowledgeIndexRateLimit } },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      if (!req.isMultipart()) {
        sendError(reply, 400, 'VALIDATION_ERROR', 'Expected multipart/form-data');
        return;
      }
      let fileBuf: Buffer | null = null;
      let filename = '';
      let titleField = '';
      try {
        const parts = req.parts();
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'file') {
            filename = part.filename;
            fileBuf = await part.toBuffer();
          } else if (part.type === 'field' && part.fieldname === 'title') {
            titleField = String(part.value ?? '').trim();
          }
        }
      } catch {
        sendError(reply, 400, 'VALIDATION_ERROR', 'Failed to read multipart upload');
        return;
      }
      if (!fileBuf || fileBuf.length === 0) {
        sendError(reply, 400, 'VALIDATION_ERROR', 'Missing file field "file"');
        return;
      }
      if (!uploadNamePattern.test(filename)) {
        sendError(reply, 400, 'VALIDATION_ERROR', 'Only .txt and .md files are supported');
        return;
      }
      const content = fileBuf.toString('utf8');
      if (!content.trim()) {
        sendError(reply, 400, 'VALIDATION_ERROR', 'File is empty');
        return;
      }
      let title =
        titleField.length > 0
          ? titleField.slice(0, 500)
          : filename.replace(/\.[^/.]+$/, '').trim();
      if (!title) title = 'Uploaded document';
      try {
        const result = await createKnowledgeDocumentIndexed(prisma, title, content);
        await reply.status(201).send({
          document: { id: result.id, title: result.title, chunks: result.chunkCount },
        });
      } catch {
        sendError(reply, 502, 'EMBEDDING_FAILED', 'Failed to index document (embedding or DB error)');
      }
    },
  );

  app.patch(
    '/admin/knowledge/documents/:documentId',
    { config: { rateLimit: knowledgeIndexRateLimit } },
    async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { documentId } = req.params as { documentId: string };
    const parsed = patchDocBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
      return;
    }
    try {
      const result = await updateKnowledgeDocumentIndexed(prisma, documentId, parsed.data);
      if (!result) {
        sendError(reply, 404, 'NOT_FOUND', 'Document not found');
        return;
      }
      await reply.send({
        document: {
          id: result.id,
          title: result.title,
          chunks: result.chunkCount,
        },
      });
    } catch {
      sendError(reply, 502, 'EMBEDDING_FAILED', 'Failed to reindex document (embedding or DB error)');
    }
  });

  app.delete('/admin/knowledge/documents/:documentId', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { documentId } = req.params as { documentId: string };
    await prisma.knowledgeDocument.deleteMany({ where: { id: documentId } });
    await reply.send({ ok: true });
  });
}
