import { logger } from './logger.js';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  logger.error({ err, path: req.path, method: req.method }, message);
  res.status(statusCode).json({
    error: err.code || 'INTERNAL_ERROR',
    message: env.NODE_ENV === 'production' && statusCode === 500 ? 'Internal Server Error' : message,
    statusCode,
  });
};
