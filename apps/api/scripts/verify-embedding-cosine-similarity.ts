/**
 * Проверка: три фразы → эмбеддинги → косинусное сходство (пары A–B vs A–C).
 * Запуск из apps/api: npx tsx scripts/verify-embedding-cosine-similarity.ts
 */
import 'dotenv/config';
import { createEmbedding } from '../src/lib/openrouter.js';

const A = 'Я съел яблоко';
const B = 'Употребил в пищу фрукт';
const C = 'Завтра будет дождь';

function l2norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const na = l2norm(a);
  const nb = l2norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot / (na * nb);
}

function inRange(x: number, lo: number, hi: number): boolean {
  return x >= lo && x <= hi;
}

async function main(): Promise<void> {
  console.log('Шаг 1: эмбеддинги через createEmbedding() (как в API)…\n');
  const [embA, embB, embC] = await Promise.all([
    createEmbedding(A),
    createEmbedding(B),
    createEmbedding(C),
  ]);
  console.log(`  dim(A)=${embA.length}, dim(B)=${embB.length}, dim(C)=${embC.length}\n`);

  const simAB = cosineSimilarity(embA, embB);
  const simAC = cosineSimilarity(embA, embC);
  const simBC = cosineSimilarity(embB, embC);

  console.log('Шаг 2: косинусное сходство cos(u,v) = (u·v) / (‖u‖‖v‖)\n');
  console.log('| Пара | Косинусное сходство |');
  console.log('|------|---------------------|');
  console.log(`| A ↔ B | ${simAB.toFixed(4)} |`);
  console.log(`| A ↔ C | ${simAC.toFixed(4)} |`);
  console.log(`| B ↔ C | ${simBC.toFixed(4)} |`);
  console.log('');

  const tzAB = inRange(simAB, 0.8, 0.9);
  const tzAC = inRange(simAC, 0.2, 0.4);
  const orderOk = simAB > simAC + 0.05;

  console.log('Сверка с ориентирами из ТЗ:');
  console.log(`  A–B ∈ [0.8, 0.9]: ${tzAB ? 'да' : 'нет'} (факт ${simAB.toFixed(4)})`);
  console.log(`  A–C ∈ [0.2, 0.4]: ${tzAC ? 'да' : 'нет'} (факт ${simAC.toFixed(4)})`);
  console.log(`  Разделение sim(A,B) > sim(A,C): ${orderOk ? 'да' : 'нет'}`);
  console.log('');
  if (!tzAB || !tzAC) {
    console.log(
      'Пояснение: абсолютные значения сильно зависят от модели (OpenRouter chain) и длины фраз; для RAG важнее относительный порядок похожести, чем попадание в узкий числовой коридор.\n',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
