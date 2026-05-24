import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
app.use(globalLimiter);

// Mount API routes
app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, statusCode: 404 });
});

// Global error handler
app.use(errorHandler);

export default app;
