import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { upload, handleUpload } from '../controllers/upload.controller.js';

const router = Router();
router.post('/', authenticate, upload.single('file'), handleUpload);
export default router;
