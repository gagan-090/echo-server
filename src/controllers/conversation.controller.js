import * as convService from '../services/conversation.service.js';

export async function list(req, res, next) {
  try { res.json({ data: await convService.listByUser(req.user.id) }); }
  catch (err) { next(err); }
}

export async function create(req, res, next) {
  try { res.status(201).json({ data: await convService.getOrCreate(req.user.id, req.body.userId) }); }
  catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try { res.json({ data: await convService.getById(req.params.id) }); }
  catch (err) { next(err); }
}

export async function getKey(req, res, next) {
  try { res.json({ data: { key: convService.getConversationKey(req.params.id) } }); }
  catch (err) { next(err); }
}
