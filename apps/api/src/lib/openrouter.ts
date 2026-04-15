import { config } from '../config.js';
import { HttpError } from './errors.js';

const BASE = 'https://openrouter.ai/api/v1';

/** OpenRouter requires Referer + Title for many upstream providers (embeddings often fail without them). */
function openRouterHeaders(): Record<string, string> {
  const referer = config.openRouterHttpReferer || config.clientOrigin;
  return {
    Authorization: `Bearer ${config.openRouterApiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': referer,
    'X-Title': config.openRouterAppTitle,
  };
}

function openRouterErrorCode(status: number): string {
  switch (status) {
    case 401:
      return 'OPENROUTER_UNAUTHORIZED';
    case 403:
      return 'OPENROUTER_FORBIDDEN';
    case 429:
      return 'OPENROUTER_RATE_LIMITED';
    case 400:
      return 'OPENROUTER_BAD_REQUEST';
    default:
      return 'OPENROUTER_ERROR';
  }
}

function parseOpenRouterMessage(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string } };
    if (typeof j?.error?.message === 'string' && j.error.message.length > 0) {
      return j.error.message;
    }
  } catch {
    /* ignore */
  }
  const trimmed = bodyText.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : 'OpenRouter request failed';
}

/** Forward only statuses that map cleanly to our API client; others become 502. */
function mapUpstreamHttpStatus(status: number): number {
  if (status === 401 || status === 403 || status === 429 || status === 400) {
    return status;
  }
  return 502;
}

function throwOpenRouterHttpError(status: number, bodyText: string): never {
  const message = parseOpenRouterMessage(bodyText);
  const httpStatus = mapUpstreamHttpStatus(status);
  throw new HttpError(
    httpStatus,
    openRouterErrorCode(status),
    message,
    config.isProd
      ? undefined
      : {
          openRouterStatus: status,
          openRouterBodySnippet: bodyText.slice(0, 1200),
        },
  );
}

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Google Gemma/Gemini (and similar) on OpenRouter often return 400 if:
 * - a separate `system` message is sent (upstream expects instructions differently), or
 * - `temperature` is set (some routes reject non-default sampling).
 */
function modelNeedsGoogleNativeChatWorkarounds(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return m.includes('gemma') || m.includes('gemini');
}

function sanitizeChatMessages(messages: ChatCompletionMessage[]): ChatCompletionMessage[] {
  return messages
    .map((m) => ({
      ...m,
      content: typeof m.content === 'string' ? m.content.trim() : '',
    }))
    .filter((m) => m.content.length > 0);
}

/** Fold `system` turns into the first `user` message so providers that disallow `system` still see instructions. */
function normalizeMessagesForModel(
  messages: ChatCompletionMessage[],
  modelId: string,
): ChatCompletionMessage[] {
  if (!modelNeedsGoogleNativeChatWorkarounds(modelId)) {
    return messages;
  }
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  const rest = messages.filter((m) => m.role !== 'system') as {
    role: 'user' | 'assistant';
    content: string;
  }[];
  if (!systemText) return rest;
  if (rest.length === 0) return [{ role: 'user', content: systemText }];
  if (rest[0].role === 'user') {
    return [
      { role: 'user', content: `${systemText}\n\n---\n\n${rest[0].content}` },
      ...rest.slice(1),
    ];
  }
  return [{ role: 'user', content: systemText }, ...rest];
}

async function createChatCompletionForModel(
  modelId: string,
  params: { messages: ChatCompletionMessage[]; temperature?: number },
): Promise<string> {
  const messages = normalizeMessagesForModel(sanitizeChatMessages(params.messages), modelId);

  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
  };
  if (!modelNeedsGoogleNativeChatWorkarounds(modelId)) {
    payload.temperature = params.temperature ?? 0.4;
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throwOpenRouterHttpError(res.status, text);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, 'OPENROUTER_ERROR', 'OpenRouter: empty completion');
  }
  return content;
}

/**
 * Chat completions: try `OPENROUTER_CHAT_MODEL`, then models from
 * `OPENROUTER_CHAT_FALLBACK_MODELS` or built-in defaults (free Gemma / Llama / Hermes on OpenRouter).
 * 401 stops the chain (invalid API key). Per-model message normalization applies (e.g. Gemma).
 */
export async function createChatCompletion(params: {
  messages: ChatCompletionMessage[];
  temperature?: number;
}): Promise<string> {
  let lastError: unknown;
  for (const modelId of config.openRouterChatModelChain) {
    try {
      return await createChatCompletionForModel(modelId, params);
    } catch (e) {
      lastError = e;
      if (e instanceof HttpError && e.status === 401) {
        throw e;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new HttpError(502, 'OPENROUTER_ERROR', 'All OpenRouter chat models failed');
}

function parseEmbeddingResponse(data: unknown): number[] {
  const j = data as { data?: { embedding?: number[] }[] };
  const emb = j.data?.[0]?.embedding;
  if (!emb?.length) {
    throw new HttpError(502, 'EMBEDDING_ERROR', 'Embeddings API returned empty vector');
  }
  if (emb.length !== config.embeddingDimensions) {
    throw new HttpError(
      502,
      'EMBEDDING_ERROR',
      `Embedding length ${emb.length} does not match EMBEDDING_DIMENSIONS ${config.embeddingDimensions}`,
    );
  }
  return emb;
}

function parseGeminiEmbeddingResponse(data: unknown): number[] {
  const j = data as { embedding?: { values?: number[] } };
  const emb = j.embedding?.values;
  if (!emb?.length) {
    throw new HttpError(502, 'EMBEDDING_ERROR', 'Gemini embedContent returned empty vector');
  }
  if (emb.length !== config.embeddingDimensions) {
    throw new HttpError(
      502,
      'EMBEDDING_ERROR',
      `Gemini embedding length ${emb.length} does not match EMBEDDING_DIMENSIONS ${config.embeddingDimensions}`,
    );
  }
  return emb;
}

/** https://ai.google.dev/gemini-api/docs/embeddings — `outputDimensionality` must match DB `vector(1536)`. */
async function createEmbeddingViaGemini(input: string): Promise<number[]> {
  const key = config.geminiApiKey;
  if (!key) {
    throw new HttpError(500, 'EMBEDDING_ERROR', 'GEMINI_API_KEY (or GOOGLE_API_KEY) is not configured');
  }
  const model = config.geminiEmbeddingModel.replace(/^models\//, '');
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`,
  );
  url.searchParams.set('key', key);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: input }] },
      outputDimensionality: config.embeddingDimensions,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(
      mapUpstreamHttpStatus(res.status),
      'GEMINI_EMBEDDING_ERROR',
      parseOpenRouterMessage(text),
      config.isProd ? undefined : { geminiStatus: res.status },
    );
  }
  return parseGeminiEmbeddingResponse(await res.json());
}

async function createEmbeddingViaOpenRouterModel(
  input: string,
  model: string,
): Promise<number[]> {
  const res = await fetch(`${BASE}/embeddings`, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      input,
      dimensions: config.embeddingDimensions,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throwOpenRouterHttpError(res.status, text);
  }
  return parseEmbeddingResponse(await res.json());
}

async function createEmbeddingViaOpenRouterChainWithModel(
  input: string,
): Promise<{ embedding: number[]; model: string }> {
  let lastError: unknown;
  for (const model of config.openRouterEmbeddingModelChain) {
    try {
      const embedding = await createEmbeddingViaOpenRouterModel(input, model);
      return { embedding, model };
    } catch (e) {
      lastError = e;
      if (e instanceof HttpError && e.status === 401) {
        throw e;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new HttpError(502, 'EMBEDDING_ERROR', 'All OpenRouter embedding models failed');
}

function shouldRetryEmbeddingWithGemini(err: unknown): boolean {
  if (!config.geminiApiKey) return false;
  if (!(err instanceof HttpError)) return false;
  if (err.status === 401) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes('terms of service')) return true;
  if (msg.includes('violation of provider')) return true;
  if (msg.includes('country') && msg.includes('not supported')) return true;
  return false;
}

/**
 * Same routing as {@link createEmbedding}, but returns which backend produced the vector
 * (`openrouter:<slug>` or `gemini:<model>`) for diagnostics and smoke tests.
 */
export async function createEmbeddingWithSource(
  input: string,
): Promise<{ embedding: number[]; source: string }> {
  try {
    const { embedding, model } = await createEmbeddingViaOpenRouterChainWithModel(input);
    return { embedding, source: `openrouter:${model}` };
  } catch (e) {
    if (shouldRetryEmbeddingWithGemini(e)) {
      const embedding = await createEmbeddingViaGemini(input);
      return { embedding, source: `gemini:${config.geminiEmbeddingModel}` };
    }
    throw e;
  }
}

/**
 * Embeddings: try OpenRouter models in order (`OPENROUTER_EMBEDDING_MODEL`, then
 * `OPENROUTER_EMBEDDING_FALLBACK_MODELS` or built-in defaults). Each request sets
 * `dimensions` to `EMBEDDING_DIMENSIONS` (1536) for schema compatibility.
 * If every OpenRouter attempt fails and `GEMINI_API_KEY` / `GOOGLE_API_KEY` is set,
 * and the last failure matches provider/TOS heuristics, falls back to Gemini `embedContent`.
 */
export async function createEmbedding(input: string): Promise<number[]> {
  const { embedding } = await createEmbeddingWithSource(input);
  return embedding;
}
