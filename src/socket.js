import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from './config/redis.js';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import fs from 'fs';
import path from 'path';

let io;
const userSockets = new Map(); // userId -> Set of socketIds

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Attach Redis adapter for horizontal scaling / fast pub-sub
  io.adapter(createAdapter(pubClient, subClient));

  // Load public key for JWT verification
  let publicKey;
  let isRSA = false;
  try {
    publicKey = process.env.JWT_PUBLIC_KEY || fs.readFileSync(path.resolve('keys/public.pem'), 'utf8');
    isRSA = publicKey.includes('-----BEGIN');
  } catch {
    publicKey = env.COOKIE_SECRET;
  }
  // Middleware: Authenticate socket connections using the RS256/HS256 JWT
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication error: Token missing'));

      const decoded = jwt.verify(token, publicKey, { algorithms: [isRSA ? 'RS256' : 'HS256'] });
      socket.user = { id: decoded.sub, ...decoded }; // map sub to id
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected: ${socket.user.id} (${socket.id})`);

    const userId = socket.user.id;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Every user joins a private room named after their ID for direct routing
    socket.join(`user_${userId}`);

    // Broadcast updated online list to everyone
    io.emit('online_users', Array.from(userSockets.keys()));

    // --- Typing Indicators (Lightning Fast via Redis pub/sub) ---
    // Payload: { conversationId, receiverId }
    socket.on('typing_start', ({ conversationId, receiverId }) => {
      // Broadcast instantly to the receiver's private room
      socket.to(`user_${receiverId}`).emit('typing_start', {
        conversationId,
        senderId: socket.user.id
      });
    });

    socket.on('typing_end', ({ conversationId, receiverId }) => {
      socket.to(`user_${receiverId}`).emit('typing_end', {
        conversationId,
        senderId: socket.user.id
      });
    });

    // --- WebRTC Signaling ---
    socket.on('webrtc_signal', ({ receiverId, signalData, type, conversationId }) => {
      socket.to(`user_${receiverId}`).emit('webrtc_signal', {
        senderId: socket.user.id,
        signalData,
        type,
        conversationId
      });
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket disconnected: ${socket.user.id} (${socket.id})`);
      const userSocketSet = userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          userSockets.delete(userId);
        }
      }
      io.emit('online_users', Array.from(userSockets.keys()));
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
