import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import * as userRepository from '../repositories/userRepository';
import { verifyToken } from '../services/authService';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header) {
    next(new AppError('UNAUTHENTICATED', 401, 'Missing Authorization header'));
    return;
  }

  const [scheme, token, extra] = header.split(' ');
  if (scheme !== 'Bearer' || !token || extra !== undefined) {
    next(new AppError('UNAUTHENTICATED', 401, 'Malformed Authorization header'));
    return;
  }

  const verified = verifyToken(token);

  const userId = Number(verified.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    next(new AppError('INVALID_TOKEN', 401, 'Invalid or expired token'));
    return;
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    next(new AppError('INVALID_TOKEN', 401, 'User no longer exists'));
    return;
  }

  if (!user.isActive) {
    next(new AppError('ACCOUNT_DISABLED', 403, 'Account is disabled'));
    return;
  }

  // Use the role loaded from the database, never the role inside the token.
  req.user = { id: user.id, role: user.role };
  next();
}
