import * as msgService from '../services/message.service.js';

export async function list(req, res, next) {
  try {
    const { cursor, limit } = req.query;
    const result = await msgService.getMessages(req.params.id, cursor, parseInt(limit) || 30, req.user.id);
    res.json({
      data: result.messages,
      meta: { cursor: result.nextCursor, hasMore: result.hasMore },
    });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const msg = await msgService.createMessage(
      req.params.id,
      req.user.id,
      req.body.content,
      req.body.type || 'text',
      req.body.fileData || null
    );
    res.status(201).json({ data: msg });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await msgService.softDelete(req.params.msgId, req.user.id);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    await msgService.markRead(req.params.id, req.user.id);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}
