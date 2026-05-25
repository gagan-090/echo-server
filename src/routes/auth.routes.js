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

// Phone Auth
router.post('/phone/send-otp', authLimiter, authCtrl.sendPhoneOtp);
router.post('/phone/verify-otp', authLimiter, authCtrl.verifyPhoneOtp);

// Email Auth
router.post('/email/register', authLimiter, authCtrl.registerEmail);
router.post('/email/verify', authLimiter, authCtrl.verifyEmailTokenHandler);
router.post('/email/resend-verification', authLimiter, authCtrl.resendVerification);
router.post('/email/login', authLimiter, authCtrl.loginEmail);
router.post('/email/check-status', authLimiter, authCtrl.checkEmailStatus);
export default router;
