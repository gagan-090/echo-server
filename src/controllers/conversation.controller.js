import * as convService from '../services/conversation.service.js';

export async function list(req, res, next) {
  try { res.json({ data: await convService.listByUser(req.user.id) }); }
  catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const targetUserId = req.body.userId;
    const conv = await convService.getOrCreate(req.user.id, targetUserId);
    
    // Attempt to notify the remote user of the new conversation via socket
    try {
      const { messageQueue } = await import('../workers/realtime.worker.js');
      messageQueue.add('new_conversation_manual', {
        event: 'new_conversation',
        receiverId: targetUserId,
        payload: conv,
      });
    } catch (e) {
      console.error('Failed to notify remote user of new conversation:', e);
    }
    
    res.status(201).json({ data: conv });
  }
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
