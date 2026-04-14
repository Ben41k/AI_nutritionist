import { config } from '../config.js';
import { HttpError } from './errors.js';

const BASE = 'https://openrouter.ai/api/v1';

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
    config.isProd ? undefined : { openRouterStatus: status },
  );
}

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** Google Gemma on OpenRouter often returns 400 if a `system` message is sent (provider rejects it). */
function modelRejectsSystemRole(modelId: string): boolean {
  return modelId.toLowerCase().includes('gemma');
}

/** Fold `system` turns into the first `user` message so providers that disallow `system` still see instructions. */
function normalizeMessagesForModel(
  messages: ChatCompletionMessage[],
  modelId: string,
): ChatCompletionMessage[] {
  if (!modelRejectsSystemRole(modelId)) {
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

export async function createChatCompletion(params: {
  messages: ChatCompletionMessage[];
  temperature?: number;
}): Promise<string> {
  const modelId = config.openRouterChatModel;
  const messages = normalizeMessagesForModel(params.messages, modelId);

  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
  };
  if (!modelRejectsSystemRole(modelId)) {
    payload.temperature = params.temperature ?? 0.4;
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'Content-Type': 'application/json',
    },
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

export async function createEmbedding(input: string): Promise<number[]> {
  const res = await fetch(`${BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openRouterEmbeddingModel,
      input,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throwOpenRouterHttpError(res.status, text);
  }

  const data = (await res.json()) as {
    data?: { embedding?: number[] }[];
  };
  const emb = data.data?.[0]?.embedding;
  if (!emb?.length) {
    throw new HttpError(502, 'OPENROUTER_ERROR', 'OpenRouter: empty embedding');
  }
  if (emb.length !== config.embeddingDimensions) {
    throw new HttpError(
      502,
      'OPENROUTER_ERROR',
      `Embedding length ${emb.length} does not match EMBEDDING_DIMENSIONS ${config.embeddingDimensions}`,
    );
  }
  return emb;
}
