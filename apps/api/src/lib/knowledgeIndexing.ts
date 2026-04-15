import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { chunkText } from './chunkText.js';
import { createEmbedding } from './openrouter.js';
import { insertChunkWithEmbedding } from './vectorSearch.js';

export type IndexedDocumentResult = {
  id: string;
  title: string;
  chunkCount: number;
};

async function embedChunkTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await createEmbedding(text));
  }
  return embeddings;
}

/**
 * Create a knowledge document and persist chunks + embeddings in one transaction.
 */
export async function createKnowledgeDocumentIndexed(
  prisma: PrismaClient,
  title: string,
  content: string,
): Promise<IndexedDocumentResult> {
  const chunks = chunkText(content);
  const embeddings = chunks.length > 0 ? await embedChunkTexts(chunks) : [];

  return prisma.$transaction(async (tx) => {
    const doc = await tx.knowledgeDocument.create({
      data: { title, content },
    });
    let idx = 0;
    for (let i = 0; i < chunks.length; i++) {
      await insertChunkWithEmbedding(tx, {
        id: randomUUID(),
        documentId: doc.id,
        chunkIndex: idx,
        content: chunks[i],
        embedding: embeddings[i],
      });
      idx += 1;
    }
    return { id: doc.id, title: doc.title, chunkCount: idx };
  });
}

/**
 * Update title and/or content. When `content` is provided, replaces all chunks and embeddings atomically in a transaction.
 */
export async function updateKnowledgeDocumentIndexed(
  prisma: PrismaClient,
  documentId: string,
  patch: { title?: string; content?: string },
): Promise<IndexedDocumentResult | null> {
  const existing = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
  });
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const content = patch.content ?? existing.content;
  const reembed = patch.content !== undefined;

  if (!reembed) {
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { title },
    });
    const chunkCount = await prisma.knowledgeChunk.count({ where: { documentId } });
    return { id: documentId, title, chunkCount };
  }

  const chunks = chunkText(content);
  const embeddings = chunks.length > 0 ? await embedChunkTexts(chunks) : [];

  return prisma.$transaction(async (tx) => {
    await tx.knowledgeDocument.update({
      where: { id: documentId },
      data: { title, content },
    });
    await tx.knowledgeChunk.deleteMany({ where: { documentId } });
    let idx = 0;
    for (let i = 0; i < chunks.length; i++) {
      await insertChunkWithEmbedding(tx, {
        id: randomUUID(),
        documentId,
        chunkIndex: idx,
        content: chunks[i],
        embedding: embeddings[i],
      });
      idx += 1;
    }
    return { id: documentId, title, chunkCount: idx };
  });
}
