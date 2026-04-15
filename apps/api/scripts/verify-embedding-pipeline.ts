/**
 * Smoke test: показывает цепочку эмбеддингов, вызывает тот же путь что и API, печатает источник и размерность.
 *
 *   npx tsx scripts/verify-embedding-pipeline.ts
 *   npx tsx scripts/verify-embedding-pipeline.ts --db   # дополнительно пишет вектор в ChatMessage (нужен DATABASE_URL)
 */
import 'dotenv/config';
import { config } from '../src/config.js';
import { createEmbeddingWithSource } from '../src/lib/openrouter.js';
import { prisma } from '../src/prisma.js';
import { setChatMessageEmbedding } from '../src/lib/vectorSearch.js';

const sample =
  'Проверка пайплайна: белок, железо, витамин D. Embedding pipeline smoke test.';

function printChain(): void {
  console.log('\nЦепочка OpenRouter (порядок попыток):\n');
  console.log('| № | Модель (slug) |');
  console.log('|---|----------------|');
  config.openRouterEmbeddingModelChain.forEach((m, i) => {
    const tag = i === 0 ? 'основная' : 'fallback';
    console.log(`| ${i + 1} | \`${m}\` (${tag}) |`);
  });
  console.log('');
}

async function main(): Promise<void> {
  const withDb = process.argv.includes('--db');

  printChain();

  const { embedding, source } = await createEmbeddingWithSource(sample);

  if (source.startsWith('openrouter:')) {
    const used = source.slice('openrouter:'.length);
    const primary = config.openRouterEmbeddingModelChain[0];
    if (used !== primary) {
      console.log(
        `[Примечание] Основная модель \`${primary}\` не дала успешный эмбеддинг; сработал fallback \`${used}\`.\n`,
      );
    }
  }

  console.log('Результат вызова createEmbeddingWithSource (как в проде):\n');
  console.log(`| Поле | Значение |`);
  console.log(`|------|----------|`);
  console.log(`| Источник | \`${source}\` |`);
  console.log(`| Размерность | ${embedding.length} (ожидается ${config.embeddingDimensions}) |`);
  console.log(
    `| Первые 4 координаты | ${embedding
      .slice(0, 4)
      .map((n) => n.toFixed(6))
      .join(', ')} |`,
  );
  console.log('\nOK: эмбеддинг получен.\n');

  if (!withDb) {
    console.log('Подсказка: `npx tsx scripts/verify-embedding-pipeline.ts --db` — проверить запись vector(1536) в БД.\n');
    return;
  }

  const email = `embed-pipeline-${Date.now()}@local.test`;
  const user = await prisma.user.create({
    data: { email, passwordHash: 'unused', role: 'USER' },
  });
  const thread = await prisma.chatThread.create({
    data: { userId: user.id, title: 'embed-pipeline' },
  });
  const msg = await prisma.chatMessage.create({
    data: { threadId: thread.id, role: 'USER', content: sample.slice(0, 200) },
  });

  await setChatMessageEmbedding(prisma, msg.id, embedding);

  const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
    `SELECT (embedding IS NOT NULL) AS ok FROM "ChatMessage" WHERE id = $1`,
    msg.id,
  );
  const persisted = rows[0]?.ok === true;

  await prisma.user.deleteMany({ where: { id: user.id } });

  if (!persisted) {
    console.error('Ошибка: вектор не сохранился в ChatMessage.embedding');
    process.exit(1);
  }
  console.log('OK: тот же вектор записан в PostgreSQL (pgvector) и строка удалена.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
