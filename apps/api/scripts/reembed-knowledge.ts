/**
 * Recompute embeddings for all knowledge chunks (or one document) using current OpenRouter chain.
 * Run from apps/api: npm run reembed:knowledge
 * Optional: --documentId=<id>
 */
import 'dotenv/config';
import { prisma } from '../src/prisma.js';
import { createEmbedding } from '../src/lib/openrouter.js';
import { updateKnowledgeChunkEmbedding } from '../src/lib/vectorSearch.js';

function parseDocumentIdArg(): string | undefined {
  const prefix = '--documentId=';
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) {
      const id = a.slice(prefix.length).trim();
      return id.length > 0 ? id : undefined;
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const documentId = parseDocumentIdArg();
  const chunks = await prisma.knowledgeChunk.findMany({
    where: documentId ? { documentId } : undefined,
    select: { id: true, content: true },
    orderBy: [{ documentId: 'asc' }, { chunkIndex: 'asc' }],
  });

  const total = chunks.length;
  if (total === 0) {
    console.log(documentId ? `No chunks for document ${documentId}.` : 'No knowledge chunks in database.');
    return;
  }

  console.log(`Re-embedding ${total} chunk(s)${documentId ? ` for document ${documentId}` : ''}…`);

  let ok = 0;
  let failed = 0;
  let i = 0;
  for (const row of chunks) {
    i += 1;
    try {
      const embedding = await createEmbedding(row.content);
      await updateKnowledgeChunkEmbedding(prisma, row.id, embedding);
      ok += 1;
      if (i % 20 === 0 || i === total) {
        console.log(`[${i}/${total}] progress: ${ok} ok, ${failed} failed`);
      }
    } catch (e) {
      failed += 1;
      console.error(`[${i}/${total}] chunk ${row.id} failed:`, e);
    }
  }

  console.log(`Done. ${ok} succeeded, ${failed} failed.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
