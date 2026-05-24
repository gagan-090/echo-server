import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.validator.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.post('/login', authLimiter, validate(loginSchema), authCtrl.login);
router.post('/register', authLimiter, validate(registerSchema), authCtrl.register);
router.post('/refresh', authCtrl.refresh);
router.post('/logout', authCtrl.logout);
export default router;
