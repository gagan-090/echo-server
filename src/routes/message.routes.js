import { Router } from 'express';
import * as msgCtrl from '../controllers/message.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireParticipant } from '../middleware/requireParticipant.js';
import { validate } from '../middleware/validate.js';
import { createMessageSchema } from '../validators/message.validator.js';
import { messageLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.use(authenticate);
router.get('/:id/messages', requireParticipant, msgCtrl.list);
router.post('/:id/messages', requireParticipant, messageLimiter, validate(createMessageSchema), msgCtrl.create);
router.delete('/:id/messages/:msgId', requireParticipant, msgCtrl.remove);
router.patch('/:id/messages/read', requireParticipant, msgCtrl.markRead);
export default router;
