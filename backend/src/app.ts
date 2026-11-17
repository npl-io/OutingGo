import express from 'express';
import helmet from 'helmet';
import { query } from './config/db';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestLogger } from './middlewares/requestLogger';

export const app = express();

app.use(helmet());
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

app.use(notFound);
app.use(errorHandler);

