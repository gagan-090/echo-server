import { Router } from 'express';
import * as userCtrl from '../controllers/user.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../validators/user.validator.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

const router = Router();
router.use(authenticate);
router.get('/me', userCtrl.getMe);
router.patch('/me', validate(updateProfileSchema), userCtrl.updateProfile);
router.post('/me/avatar', upload.single('avatar'), userCtrl.uploadAvatar);
router.patch('/me/presence', userCtrl.updatePresence);
router.post('/me/device-token', userCtrl.updateDeviceToken);
router.get('/search', userCtrl.searchUsers);
router.get('/:id', userCtrl.getById);
export default router;
