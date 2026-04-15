import type { PrismaClient } from '@prisma/client';

/** Raw SQL executor (works with `prisma` and interactive `$transaction` client). */
export type PrismaSqlClient = Pick<PrismaClient, '$executeRawUnsafe'>;

export type RetrievedChunk = {
  id: string;
  documentId: string;
  content: string;
};

export type RetrievedThreadMessage = {
  id: string;
  role: string;
  content: string;
};

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => Number(n).toFixed(8)).join(',')}]`;
}

/**
 * Cosine distance via pgvector `<=>` with vector_cosine_ops (default for ORDER BY).
 */
export async function searchSimilarChunks(
  prisma: PrismaClient,
  embedding: number[],
  limit: number,
): Promise<RetrievedChunk[]> {
  const vec = toVectorLiteral(embedding);
  const rows = await prisma.$queryRawUnsafe<RetrievedChunk[]>(
    `
    SELECT c.id, c."documentId", c.content
    FROM "KnowledgeChunk" c
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
    `,
    vec,
    limit,
  );
  return rows;
}

/**
 * Semantically similar prior turns in the same thread (requires `ChatMessage.embedding`).
 * Excludes the current message so the fresh user turn does not rank as the only perfect match.
 */
export async function searchSimilarThreadMessages(
  prisma: PrismaClient,
  params: {
    threadId: string;
    excludeMessageId: string;
    embedding: number[];
    limit: number;
  },
): Promise<RetrievedThreadMessage[]> {
  const vec = toVectorLiteral(params.embedding);
  const rows = await prisma.$queryRawUnsafe<RetrievedThreadMessage[]>(
    `
    SELECT m.id, m.role::text AS role, m.content
    FROM "ChatMessage" m
    WHERE m."threadId" = $1
      AND m.embedding IS NOT NULL
      AND m.id <> $2
      AND m.role IN ('USER', 'ASSISTANT')
    ORDER BY m.embedding <=> $3::vector
    LIMIT $4
    `,
    params.threadId,
    params.excludeMessageId,
    vec,
    params.limit,
  );
  return rows;
}

export async function setChatMessageEmbedding(
  prisma: PrismaClient,
  messageId: string,
  embedding: number[],
): Promise<void> {
  const vec = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `
    UPDATE "ChatMessage"
    SET embedding = $1::vector
    WHERE id = $2
    `,
    vec,
    messageId,
  );
}

export async function insertChunkWithEmbedding(
  prisma: PrismaSqlClient,
  params: {
    id: string;
    documentId: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
  },
): Promise<void> {
  const vec = toVectorLiteral(params.embedding);
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "KnowledgeChunk" (id, "documentId", "chunkIndex", content, embedding)
    VALUES ($1, $2, $3, $4, $5::vector)
    `,
    params.id,
    params.documentId,
    params.chunkIndex,
    params.content,
    vec,
  );
}

export async function updateKnowledgeChunkEmbedding(
  prisma: PrismaSqlClient,
  chunkId: string,
  embedding: number[],
): Promise<void> {
  const vec = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `
    UPDATE "KnowledgeChunk"
    SET embedding = $1::vector
    WHERE id = $2
    `,
    vec,
    chunkId,
  );
}
