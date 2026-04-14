import type { FastifyReply } from 'fastify';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiErrorBody = { error: { code, message, details } };
  void reply.status(status).send(body);
}

export class HttpError extends Error {
  /** Same as `status`; Fastify reads `statusCode` on thrown errors. */
  public readonly statusCode: number;

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = status;
  }
}
