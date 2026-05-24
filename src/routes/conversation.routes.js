import { Router } from 'express';
import * as convCtrl from '../controllers/conversation.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireParticipant } from '../middleware/requireParticipant.js';

const router = Router();
router.use(authenticate);
router.get('/', convCtrl.list);
router.post('/', convCtrl.create);
router.get('/:id', requireParticipant, convCtrl.getById);
router.get('/:id/key', requireParticipant, convCtrl.getKey);
export default router;
