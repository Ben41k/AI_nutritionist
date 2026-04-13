import type { PrismaClient } from '@prisma/client';

export type RetrievedChunk = {
  id: string;
  documentId: string;
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

export async function insertChunkWithEmbedding(
  prisma: PrismaClient,
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
