import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AppError } from '../src/errors/AppError';
import { errorHandler } from '../src/middlewares/errorHandler';

interface MockResponseState {
  statusCode: number;
  body: unknown;
}

function createMockResponse(): { res: Response; state: MockResponseState } {
  const state: MockResponseState = { statusCode: 200, body: undefined };
  const res = {
    headersSent: false,
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
  };
  return { res: res as unknown as Response, state };
}

const mockReq = {} as unknown as Request;
const noop = (): void => { };

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an AppError as the error envelope', () => {
    const { res, state } = createMockResponse();

    errorHandler(new AppError('VALIDATION_ERROR', 422, 'bad input', [{ field: 'x' }]), mockReq, res, noop);

    expect(state.statusCode).toBe(422);
    expect(state.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'bad input', details: [{ field: 'x' }] },
    });
  });

  it('turns an unknown error into a 500 INTERNAL_ERROR', () => {
    const { res, state } = createMockResponse();
    vi.spyOn(console, 'error').mockImplementation(() => { });

    errorHandler(new Error('boom'), mockReq, res, noop);

    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });
  });

  it('hides stack traces and internal messages in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { res, state } = createMockResponse();
      vi.spyOn(console, 'error').mockImplementation(() => { });

      errorHandler(new Error('boom'), mockReq, res, noop);

      expect(state.statusCode).toBe(500);
      expect(state.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });
});
