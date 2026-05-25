import express from 'express';
import { 
  createQrSession, 
  pollQrSession, 
  confirmQrSession, 
  exchangeQrSession, 
  getLinkedDevices,
  logoutLinkedDevice
} from '../controllers/auth.qr.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

// Web endpoints
router.post('/qr-session', createQrSession);
router.get('/qr-session/:id', pollQrSession);
router.post('/qr-exchange', exchangeQrSession);

// Mobile endpoints (require auth)
router.post('/qr-confirm', authenticate, confirmQrSession);
router.get('/linked-devices', authenticate, getLinkedDevices);
router.delete('/linked-devices/:sessionId', authenticate, logoutLinkedDevice);

export default router;
