import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../src/errors/AppError';
import { validate } from '../src/middlewares/validate';
import { registerSchema } from '../src/schemas/auth.schema';

function createMocks(): {
  req: Record<string, unknown>;
  res: { locals: Record<string, unknown> };
  next: ReturnType<typeof vi.fn>;
} {
  const req: Record<string, unknown> = { body: {}, params: {}, query: {} };
  const res = { locals: {} };
  const next = vi.fn();
  return { req, res, next };
}

function run(
  middleware: ReturnType<typeof validate>,
  req: Record<string, unknown>,
  res: { locals: Record<string, unknown> },
  next: ReturnType<typeof vi.fn>,
): void {
  middleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction);
}

describe('validate', () => {
  it('parses a valid body and reassigns the parsed result to req.body', () => {
    const { req, res, next } = createMocks();
    req.body = {
      email: '  User@Example.com ',
      password: 'Password1',
      fullName: '  Test User ',
    };

    run(validate({ body: registerSchema }), req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({
      email: 'user@example.com',
      password: 'Password1',
      fullName: 'Test User',
    });
  });

  it('parses and reassigns req.params', () => {
    const { req, res, next } = createMocks();
    req.params = { id: '7' };

    run(validate({ params: z.object({ id: z.coerce.number() }) }), req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: 7 });
  });

  it('stores parsed query in res.locals.query and leaves req.query untouched', () => {
    const { req, res, next } = createMocks();
    req.query = { page: '2', q: ' Coffee ' };

    run(
      validate({
        query: z.object({ page: z.coerce.number(), q: z.string().trim().toLowerCase() }),
      }),
      req,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: '2', q: ' Coffee ' });
    expect(res.locals.query).toEqual({ page: 2, q: 'coffee' });
  });

  it('reports a specific field message for an invalid email', () => {
    const { req, res, next } = createMocks();
    req.body = { email: 'not-an-email', password: 'Password1', fullName: 'Test User' };

    run(validate({ body: registerSchema }), req, res, next);

    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.httpStatus).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([
      expect.objectContaining({ field: 'body.email', message: expect.stringContaining('email') }),
    ]);
  });

  it('reports a specific field message for a short password', () => {
    const { req, res, next } = createMocks();
    req.body = { email: 'user@example.com', password: 'short1', fullName: 'Test User' };

    run(validate({ body: registerSchema }), req, res, next);

    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.details).toEqual([
      expect.objectContaining({
        field: 'body.password',
        message: expect.stringContaining('8 characters'),
      }),
    ]);
  });

  it('reports a specific field message for a missing field', () => {
    const { req, res, next } = createMocks();
    req.body = { email: 'user@example.com', password: 'Password1' };

    run(validate({ body: registerSchema }), req, res, next);

    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.details).toEqual([
      expect.objectContaining({
        field: 'body.fullName',
        message: expect.stringContaining('expected string'),
      }),
    ]);
  });
});
