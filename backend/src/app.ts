import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestLogger } from './middlewares/requestLogger';

export const app = express();

app.use(helmet());
app.use(express.json());
app.use(requestLogger);

app.get('/api/v1/health', (_req, res) => {
  res.json({ data: { status: 'ok' } });
});

app.use(notFound);
app.use(errorHandler);
