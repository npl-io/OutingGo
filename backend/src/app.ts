import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { query } from './config/db';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestLogger } from './middlewares/requestLogger';
import { authRoutes } from './routes/authRoutes';

export const app = express();

if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use(requestLogger);

app.get('/api/v1/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ data: { status: 'ok', db: 'up' } });
  } catch {
    res.status(503).json({
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'Database is down',
        details: { db: 'down' },
      },
    });
  }
});

app.use('/api/v1/auth', authRoutes);

app.use(notFound);
app.use(errorHandler);

