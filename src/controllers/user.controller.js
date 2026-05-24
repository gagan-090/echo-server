import * as userService from '../services/user.service.js';

export async function getMe(req, res, next) {
  try { res.json({ data: await userService.getUserById(req.user.id) }); }
  catch (err) { next(err); }
}

export async function updateProfile(req, res, next) {
  try { res.json({ data: await userService.updateUser(req.user.id, req.body) }); }
  catch (err) { next(err); }
}

export async function searchUsers(req, res, next) {
  try { res.json({ data: await userService.searchUsers(req.query.q || '', req.user.id) }); }
  catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try { res.json({ data: await userService.getUserById(req.params.id) }); }
  catch (err) { next(err); }
}

export async function updatePresence(req, res, next) {
  try { await userService.updateLastSeen(req.user.id); res.json({ data: { success: true } }); }
  catch (err) { next(err); }
}

export async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) throw Object.assign(new Error('No file provided'), { statusCode: 400 });
    const ext = req.file.originalname.split('.').pop();
    const result = await userService.uploadAvatarFile(req.user.id, req.file.buffer, req.file.mimetype, ext);
    res.json({ data: result });
  } catch (err) { next(err); }
}
