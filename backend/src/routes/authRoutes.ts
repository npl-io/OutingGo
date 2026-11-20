import { Router } from 'express';
import { env } from '../config/env';
import { login, me, register } from '../controllers/authController';
import { authenticate } from '../middlewares/authenticate';
import { createAuthRateLimiter } from '../middlewares/rateLimiters';
import { validate } from '../middlewares/validate';
import { loginSchema, registerSchema } from '../schemas/auth.schema';

const authRateLimiter = createAuthRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
});

export const authRoutes = Router();

authRoutes.post('/register', authRateLimiter, validate({ body: registerSchema }), register);
authRoutes.post('/login', authRateLimiter, validate({ body: loginSchema }), login);
authRoutes.get('/me', authenticate, me);
