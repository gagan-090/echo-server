import { supabase } from '../config/supabase.js';

/**
 * Upsert a delivery receipt (delivered_at) for a message.
 */
export async function markDelivered(messageId, userId) {
  await supabase
    .from('read_receipts')
    .upsert(
      { message_id: messageId, user_id: userId, delivered_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id', ignoreDuplicates: false }
    );
}

/**
 * Upsert a read receipt (read_at) for a message.
 */
export async function markMessageRead(messageId, userId) {
  await supabase
    .from('read_receipts')
    .upsert(
      { message_id: messageId, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id', ignoreDuplicates: false }
    );
}

/**
 * Get all receipts for a specific message (for read tick display).
 */
export async function getReceiptsForMessage(messageId) {
  const { data } = await supabase
    .from('read_receipts')
    .select('user_id, delivered_at, read_at')
    .eq('message_id', messageId);
  return data || [];
}

/**
 * Get unread message count for a user in a conversation.
 * Uses the denormalized unread_count on the conversations table for speed.
 */
export async function getUnreadCount(convId, userId) {
  const { data } = await supabase
    .from('conversations')
    .select('participant_a, unread_count_a, unread_count_b')
    .eq('id', convId)
    .single();

  if (!data) return 0;
  return data.participant_a === userId ? data.unread_count_a : data.unread_count_b;
}
