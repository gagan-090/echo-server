import { Router } from 'express';
import * as callCtrl from '../controllers/call.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);

router.get('/', callCtrl.list);
router.post('/', callCtrl.create);

export default router;
