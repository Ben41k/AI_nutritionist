/**
 * One-off: verify pgvector write paths used by chat + knowledge base.
 * Run: DATABASE_URL=... npx tsx scripts/verify-embedding-write.ts
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/prisma.js';
import { insertChunkWithEmbedding, setChatMessageEmbedding } from '../src/lib/vectorSearch.js';

const DIM = 1536;

/** First axis unit vector (length 1536) — valid `vector(1536)` payload. */
function unitVector(dim: number): number[] {
  const v = new Array<number>(dim).fill(0);
  v[0] = 1;
  return v;
}

async function main(): Promise<void> {
  const emb = unitVector(DIM);
  const email = `embed-verify-${Date.now()}@local.test`;

  const user = await prisma.user.create({
    data: { email, passwordHash: 'unused', role: 'USER' },
  });
  const thread = await prisma.chatThread.create({
    data: { userId: user.id, title: 'verify' },
  });
  const msg = await prisma.chatMessage.create({
    data: { threadId: thread.id, role: 'USER', content: 'ping' },
  });

  await setChatMessageEmbedding(prisma, msg.id, emb);

  const doc = await prisma.knowledgeDocument.create({
    data: { title: 'verify-doc', content: 'chunk body' },
  });
  const chunkId = randomUUID();
  await insertChunkWithEmbedding(prisma, {
    id: chunkId,
    documentId: doc.id,
    chunkIndex: 0,
    content: 'chunk body',
    embedding: emb,
  });

  const rows = await prisma.$queryRawUnsafe<{ msg_ok: boolean; chunk_ok: boolean }[]>(
    `
    SELECT
      (m.embedding IS NOT NULL) AS "msg_ok",
      (c.embedding IS NOT NULL) AS "chunk_ok"
    FROM "ChatMessage" m
    CROSS JOIN "KnowledgeChunk" c
    WHERE m.id = $1 AND c.id = $2
    `,
    msg.id,
    chunkId,
  );

  const row = rows[0];
  const ok = row?.msg_ok === true && row?.chunk_ok === true;

  await prisma.knowledgeDocument.deleteMany({ where: { id: doc.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });

  if (!ok) {
    console.error('Embedding write check failed:', { row });
    process.exit(1);
  }
  console.log('OK: ChatMessage + KnowledgeChunk embeddings persisted (vector(1536)).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
