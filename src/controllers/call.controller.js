import * as callService from '../services/call.service.js';

export async function list(req, res, next) {
  try {
    const calls = await callService.getUserCalls(req.user.id);
    res.json({ data: calls });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { conversationId, callType, status, durationSeconds } = req.body;
    const call = await callService.logCall(req.user.id, conversationId, callType, status, durationSeconds);
    res.status(201).json({ data: call });
  } catch (err) {
    next(err);
  }
}
