import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { getIO } from '../socket.js';
import { logger } from '../middleware/logger.js';

const QUEUE_NAME = 'realtime_messages';

// Create the Queue for dispatching jobs
export const messageQueue = new Queue(QUEUE_NAME, { connection: redis });

// Create the Worker to process the jobs
export const messageWorker = new Worker(QUEUE_NAME, async (job) => {
  const { event, receiverId, payload } = job.data;
  
  if (event === 'new_message') {
    // Dispatch via Socket.io instantly
    getIO().to(`user_${receiverId}`).emit('new_message', payload);
  } else if (event === 'messages_read') {
    getIO().to(`user_${receiverId}`).emit('messages_read', payload);
  } else if ([
    'incoming_call', 
    'call_accepted', 
    'call_rejected', 
    'call_ended', 
    'webrtc_ice_candidate', 
    'webrtc_offer', 
    'webrtc_answer',
    'new_conversation'
  ].includes(event)) {
    getIO().to(`user_${receiverId}`).emit(event, payload);
  }
  
}, { connection: redis });

messageWorker.on('completed', (job) => {
  logger.info(`⚡️ BullMQ: Delivered message job ${job.id}`);
});

messageWorker.on('failed', (job, err) => {
  logger.error(`❌ BullMQ: Failed message job ${job.id}`, err);
});
