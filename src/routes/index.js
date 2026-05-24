import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import conversationRoutes from './conversation.routes.js';
import messageRoutes from './message.routes.js';
import uploadRoutes from './upload.routes.js';
import healthRoutes from './health.routes.js';
import callRoutes from './call.routes.js';

const router = Router();
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/conversations', messageRoutes);
router.use('/upload', uploadRoutes);
router.use('/health', healthRoutes);
router.use('/calls', callRoutes);
export default router;
