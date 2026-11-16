import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  let code = 'INTERNAL_ERROR';
  let httpStatus = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof AppError) {
    code = err.code;
    httpStatus = err.httpStatus;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    if (process.env.NODE_ENV !== 'production') {
      message = err.message;
    }
    console.error('Unhandled error:', err);
  }

  const body: ErrorEnvelope = { error: { code, message } };

  if (details !== undefined) {
    body.error.details = details;
  }

  if (process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack !== undefined) {
    body.error.stack = err.stack;
  }

  res.status(httpStatus).json(body);
}
