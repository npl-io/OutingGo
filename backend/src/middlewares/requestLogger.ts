import type { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(2)}ms`);
  });

  next();
}
