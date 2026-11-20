import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema';
import * as authService from '../services/authService';

export async function register(req: Request, res: Response): Promise<void> {
  const user = await authService.register(req.body as RegisterInput);
  res.status(201).json({ data: { user } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json({ data: { token: result.token, user: result.user } });
}

export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (userId === undefined) {
    throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
  }

  const user = await authService.getMe(userId);
  res.status(200).json({ data: { user } });
}
