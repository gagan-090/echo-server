import { verifyAccessToken } from '../crypto/tokenUtils.js';
import { logger } from './logger.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token', statusCode: 401 });
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    logger.warn({ err }, 'JWT verification failed');
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token', statusCode: 401 });
  }
};
