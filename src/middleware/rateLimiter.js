import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const globalLimiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests', statusCode: 429 },
});

export const authLimiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
  max: parseInt(env.RATE_LIMIT_MAX_AUTH),
  message: { error: 'RATE_LIMITED', message: 'Too many auth attempts', statusCode: 429 },
});

export const messageLimiter = rateLimit({
  windowMs: 60_000,
  max: parseInt(env.RATE_LIMIT_MAX_MESSAGES),
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'RATE_LIMITED', message: 'Too many messages', statusCode: 429 },
});
