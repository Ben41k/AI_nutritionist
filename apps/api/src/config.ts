import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  clientOrigin: required('CLIENT_ORIGIN'),
  openRouterApiKey: required('OPENROUTER_API_KEY'),
  openRouterChatModel: required('OPENROUTER_CHAT_MODEL'),
  openRouterEmbeddingModel: required('OPENROUTER_EMBEDDING_MODEL'),
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim(),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
};

if (config.embeddingDimensions !== 1536) {
  throw new Error(
    'Schema uses vector(1536). Set EMBEDDING_DIMENSIONS=1536 or change Prisma schema.',
  );
}
