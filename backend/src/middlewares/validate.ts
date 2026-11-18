import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/AppError';

interface ValidationIssue {
  path: PropertyKey[];
  message: string;
}

interface ValidationSchema {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: ValidationIssue[] } };
}

interface ValidateOptions {
  body?: ValidationSchema;
  params?: ValidationSchema;
  query?: ValidationSchema;
}

interface ValidationDetail {
  field: string;
  message: string;
}

function formatIssues(issues: ValidationIssue[], source: string): ValidationDetail[] {
  return issues.map((issue) => ({
    field: `${source}.${issue.path.join('.') || 'unknown'}`,
    message: issue.message,
  }));
}

export function validate(options: ValidateOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const details: ValidationDetail[] = [];

    if (options.body) {
      const result = options.body.safeParse(req.body);
      if (result.success) {
        req.body = result.data;
      } else {
        details.push(...formatIssues(result.error.issues, 'body'));
      }
    }

    if (options.params) {
      const result = options.params.safeParse(req.params);
      if (result.success) {
        req.params = result.data as typeof req.params;
      } else {
        details.push(...formatIssues(result.error.issues, 'params'));
      }
    }

    if (options.query) {
      const result = options.query.safeParse(req.query);
      if (result.success) {
        // Express 5 exposes req.query as a read-only getter, so store the
        // parsed value on res.locals instead of reassigning it.
        res.locals.query = result.data;
      } else {
        details.push(...formatIssues(result.error.issues, 'query'));
      }
    }

    if (details.length > 0) {
      next(new AppError('VALIDATION_ERROR', 422, 'Invalid input', details));
      return;
    }

    next();
  };
}
