import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => issue.path.join('.')).filter(Boolean);
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: { fields } },
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    const status = error.type === 'entity.parse.failed' ? 400 : 413;
    response.status(status).json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } });
    return;
  }

  console.error('Unhandled API error');
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
