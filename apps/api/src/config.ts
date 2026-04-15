import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

/**
 * OpenRouter embedding model ids tried after `OPENROUTER_EMBEDDING_MODEL` fails.
 * All calls pass `dimensions: EMBEDDING_DIMENSIONS` (1536) so OpenAI 3-large and similar match `vector(1536)`.
 * Qwen3 0.6B may not reach 1536 on all routes; it is last before Codestral so failures skip to the next slug.
 */
export const DEFAULT_OPENROUTER_EMBEDDING_FALLBACK_MODELS: readonly string[] = [
  'qwen/qwen3-embedding-8b',
  'openai/text-embedding-3-small',
  'qwen/qwen3-embedding-4b',
  'qwen/qwen3-embedding-0.6b',
  'mistralai/codestral-embed-2505',
];

function parseEmbeddingFallbackModels(): string[] {
  const raw = process.env.OPENROUTER_EMBEDDING_FALLBACK_MODELS?.trim();
  if (!raw) return [...DEFAULT_OPENROUTER_EMBEDDING_FALLBACK_MODELS];
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function uniqueModelChain(primary: string, fallbacks: string[]): string[] {
  const chain: string[] = [primary];
  const seen = new Set<string>([primary.toLowerCase()]);
  for (const m of fallbacks) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push(m);
  }
  return chain;
}

/**
 * OpenRouter chat model ids tried after `OPENROUTER_CHAT_MODEL` fails (rate limits, provider errors, etc.).
 * Free-tier slugs end with `:free` where applicable.
 */
export const DEFAULT_OPENROUTER_CHAT_FALLBACK_MODELS: readonly string[] = [
  'google/gemma-3-4b-it:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];

function parseChatFallbackModels(): string[] {
  const raw = process.env.OPENROUTER_CHAT_FALLBACK_MODELS?.trim();
  if (!raw) return [...DEFAULT_OPENROUTER_CHAT_FALLBACK_MODELS];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const openRouterEmbeddingModel = required('OPENROUTER_EMBEDDING_MODEL');
const openRouterEmbeddingFallbackModels = parseEmbeddingFallbackModels();
const openRouterChatModel = required('OPENROUTER_CHAT_MODEL');
const openRouterChatFallbackModels = parseChatFallbackModels();

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  clientOrigin: required('CLIENT_ORIGIN'),
  /** Optional override; otherwise CLIENT_ORIGIN is sent (OpenRouter expects a real site URL for some providers). */
  openRouterHttpReferer: process.env.OPENROUTER_HTTP_REFERER?.trim(),
  openRouterAppTitle: process.env.OPENROUTER_X_TITLE?.trim() ?? 'AI Nutritionist',
  openRouterApiKey: required('OPENROUTER_API_KEY'),
  openRouterChatModel,
  openRouterChatFallbackModels,
  /** Primary first, then fallbacks; deduped case-insensitively. */
  openRouterChatModelChain: uniqueModelChain(openRouterChatModel, openRouterChatFallbackModels),
  openRouterEmbeddingModel,
  openRouterEmbeddingFallbackModels,
  /** Primary first, then fallbacks; deduped case-insensitively. */
  openRouterEmbeddingModelChain: uniqueModelChain(
    openRouterEmbeddingModel,
    openRouterEmbeddingFallbackModels,
  ),
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim(),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  /** Global HTTP rate limit (per IP) per minute. */
  apiRateLimitMax: (() => {
    const n = Number(process.env.API_RATE_LIMIT_MAX);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 400;
  })(),
  /** OpenRouter chat / meal analysis (per user or IP). */
  apiLlmRateLimitMax: (() => {
    const n = Number(process.env.API_LLM_RATE_LIMIT_MAX);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
  })(),
  apiLlmRateLimitWindow: process.env.API_LLM_RATE_LIMIT_WINDOW?.trim() || '1 minute',
  /** POST /meals without model analysis (same route, higher cap when body skips LLM). */
  apiMealsPostNonLlmMax: (() => {
    const n = Number(process.env.API_MEALS_POST_NON_LLM_MAX);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120;
  })(),
  /** Admin knowledge indexing (embeddings per user or IP). */
  apiKnowledgeIndexRateLimitMax: (() => {
    const n = Number(process.env.API_KNOWLEDGE_INDEX_RATE_LIMIT_MAX);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
  })(),
  apiKnowledgeIndexRateLimitWindow:
    process.env.API_KNOWLEDGE_INDEX_RATE_LIMIT_WINDOW?.trim() || '1 minute',
};

if (config.embeddingDimensions !== 1536) {
  throw new Error(
    'Schema uses vector(1536). Set EMBEDDING_DIMENSIONS=1536 or change Prisma schema.',
  );
}
