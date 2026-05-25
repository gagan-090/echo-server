import { supabase } from '../config/supabase.js';
import { encrypt, decrypt } from '../crypto/encryption.js';
import { deriveConversationKey } from '../crypto/keyDerivation.js';
import { messaging } from '../config/firebase.js';

/**
 * Get paginated messages for a conversation (cursor-based).
 * Decrypts each message before returning.
 */
export async function getMessages(convId, cursor, limit = 30, userId = null) {
  let query = supabase
    .from('messages')
    .select('*, read_receipts(user_id, delivered_at, read_at)')
    .eq('conversation_id', convId)
    .order('sent_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('sent_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const hasMore = data.length > limit;
  const messages = hasMore ? data.slice(0, limit) : data;
  const key = deriveConversationKey(convId);

  const decrypted = messages.map(msg => {
    let status = 'sent';
    if (userId && msg.sender_id === userId && msg.read_receipts && msg.read_receipts.length > 0) {
      const otherReceipts = msg.read_receipts.filter(r => r.user_id !== userId);
      if (otherReceipts.some(r => r.read_at)) {
        status = 'read';
      } else if (otherReceipts.some(r => r.delivered_at)) {
        status = 'delivered';
      }
    }

    if (msg.is_deleted) {
      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: null,
        message_type: msg.message_type,
        is_deleted: true,
        deleted_at: msg.deleted_at,
        sent_at: msg.sent_at,
        file_url: null,
        file_name: null,
        status
      };
    }

    try {
      const content = msg.content_encrypted ? decrypt(msg.content_encrypted, msg.iv, key) : null;
      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content,
        message_type: msg.message_type,
        file_url: msg.file_url,
        file_name: msg.file_name,
        file_size_bytes: msg.file_size_bytes,
        file_mime_type: msg.file_mime_type,
        is_deleted: false,
        sent_at: msg.sent_at,
        status
      };
    } catch {
      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: '[Decryption failed]',
        message_type: msg.message_type,
        is_deleted: false,
        sent_at: msg.sent_at,
        status
      };
    }
  });

  return {
    messages: decrypted,
    hasMore,
    nextCursor: messages.length ? messages[messages.length - 1].sent_at : null,
  };
}

import { messageQueue } from '../workers/realtime.worker.js';

/**
 * Create a new message. Encrypts content before storing.
 * The DB trigger updates the conversation's last_message_* fields.
 * After insert, we update last_message_preview with actual plaintext.
 */
export async function createMessage(convId, senderId, content, messageType = 'text', fileData = null) {
  const key = deriveConversationKey(convId);

  const insertData = {
    conversation_id: convId,
    sender_id: senderId,
    message_type: messageType,
    sent_at: new Date().toISOString(),
  };

  // Encrypt text content
  if (content) {
    const { iv, ciphertext } = encrypt(content, key);
    insertData.content_encrypted = ciphertext;
    insertData.iv = iv;
  }

  // Attach file metadata if present
  if (fileData) {
    insertData.file_url = fileData.url;
    insertData.file_name = fileData.fileName;
    insertData.file_size_bytes = fileData.fileSize;
    insertData.file_mime_type = fileData.mimeType;
  }

  const { data, error } = await supabase
    .from('messages')
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update the conversation preview with real plaintext (truncated)
  const preview = content ? content.substring(0, 80) : (messageType === 'image' ? '📷 Photo' : '📎 File');
  await supabase
    .from('conversations')
    .update({ last_message_preview: preview })
    .eq('id', convId);

  // Dispatch lightning fast WebSocket notification via BullMQ -> Redis -> Socket.io
  const { data: conv } = await supabase.from('conversations').select('participant_a, participant_b').eq('id', convId).single();
  if (conv) {
    const receiverId = conv.participant_a === senderId ? conv.participant_b : conv.participant_a;
    await messageQueue.add('notify_message', {
      event: 'new_message',
      receiverId,
      payload: { conversation_id: convId }
    });

    // Send FCM Push Notification
    const { data: receiverData } = await supabase.from('users').select('fcm_token').eq('id', receiverId).single();
    if (receiverData && receiverData.fcm_token && messaging) {
      const { data: senderData } = await supabase.from('users').select('display_name').eq('id', senderId).single();
      const senderName = senderData ? senderData.display_name : 'Someone';
      
      try {
        await messaging().send({
          token: receiverData.fcm_token,
          notification: {
            title: `New message from ${senderName}`,
            body: preview
          },
          data: {
            conversation_id: convId,
            type: 'new_message'
          }
        });
      } catch (err) {
        console.error('Failed to send FCM notification:', err.message);
      }
    }
  }

  return {
    id: data.id,
    conversation_id: data.conversation_id,
    sender_id: data.sender_id,
    content,
    message_type: data.message_type,
    file_url: data.file_url,
    file_name: data.file_name,
    file_size_bytes: data.file_size_bytes,
    is_deleted: false,
    sent_at: data.sent_at,
  };
}

/**
 * Soft delete a message (only the sender can delete their own messages).
 * Clears encrypted content and sets is_deleted + deleted_at.
 */
export async function softDelete(msgId, userId) {
  const { data: msg } = await supabase
    .from('messages')
    .select('sender_id')
    .eq('id', msgId)
    .single();

  if (!msg || msg.sender_id !== userId) {
    throw Object.assign(new Error('Can only delete your own messages'), { statusCode: 403, code: 'FORBIDDEN' });
  }

  const { error } = await supabase
    .from('messages')
    .update({
      is_deleted: true,
      content_encrypted: null,
      iv: null,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', msgId);

  if (error) throw new Error(error.message);
}

/**
 * Mark all messages in a conversation as read for a user.
 * Uses the DB's mark_conversation_read() function for efficiency.
 */
export async function markRead(convId, userId) {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conv_id: convId,
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);

  const { data: conv } = await supabase.from('conversations').select('participant_a, participant_b').eq('id', convId).single();
  if (conv) {
    const senderId = conv.participant_a === userId ? conv.participant_b : conv.participant_a;
    await messageQueue.add('notify_message', {
      event: 'messages_read',
      receiverId: senderId,
      payload: { conversation_id: convId }
    });
  }
}
