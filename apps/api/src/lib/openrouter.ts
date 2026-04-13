import { config } from '../config.js';

const BASE = 'https://openrouter.ai/api/v1';

export async function createChatCompletion(params: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
}): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openRouterChatModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter chat error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter: empty completion');
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
    throw new Error(`OpenRouter embeddings error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    data?: { embedding?: number[] }[];
  };
  const emb = data.data?.[0]?.embedding;
  if (!emb?.length) throw new Error('OpenRouter: empty embedding');
  if (emb.length !== config.embeddingDimensions) {
    throw new Error(
      `Embedding length ${emb.length} does not match EMBEDDING_DIMENSIONS ${config.embeddingDimensions}`,
    );
  }
  return emb;
}
