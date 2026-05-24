import http from 'http';
import app from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/middleware/logger.js';

import { initSocket } from './src/socket.js';
import './src/workers/realtime.worker.js';

const server = http.createServer(app);

// Initialize Socket.io with Redis Adapter
initSocket(server);

const PORT = parseInt(env.PORT);

server.listen(PORT, () => {
  logger.info(`🚀 Echo server running on http://localhost:${PORT} [${env.NODE_ENV}]`);
});

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
