const MAX_CHARS = 900;

/**
 * Split text into chunks by paragraphs, then hard-split long paragraphs.
 */
export function chunkText(fullText: string): string[] {
  const normalized = fullText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= MAX_CHARS) {
      chunks.push(para);
      continue;
    }
    for (let i = 0; i < para.length; i += MAX_CHARS) {
      chunks.push(para.slice(i, i + MAX_CHARS));
    }
  }
  return chunks;
}
