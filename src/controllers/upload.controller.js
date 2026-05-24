import multer from 'multer';
import * as uploadService from '../services/upload.service.js';
import { MAX_FILE_BYTES } from '../config/constants.js';

const storage = multer.memoryStorage();
export const upload = multer({ storage, limits: { fileSize: MAX_FILE_BYTES } });

export async function handleUpload(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'No file uploaded', statusCode: 400 });
    const result = await uploadService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, req.user.id);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
}
