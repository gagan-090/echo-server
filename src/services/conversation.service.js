import { supabase } from '../config/supabase.js';
import { deriveConversationKey } from '../crypto/keyDerivation.js';

/**
 * Get or create a 1-on-1 conversation using the DB's atomic function.
 * The DB function enforces canonical ordering (participant_a < participant_b).
 */
export async function getOrCreate(userA, userB) {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    user_a: userA,
    user_b: userB,
  });

  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
  return data;
}

/**
 * List all conversations for a user with participant profiles.
 * Returns conversations sorted by last_message_at DESC.
 */
export async function listByUser(userId) {
  // Query conversations where user is either participant_a or participant_b
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      participant_a_profile:users!conversations_participant_a_fkey(id, display_name, avatar_url, last_seen_at),
      participant_b_profile:users!conversations_participant_b_fkey(id, display_name, avatar_url, last_seen_at)
    `)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  // Enrich each conversation with the "other" user and the correct unread count
  return (data || []).map(conv => {
    const isA = conv.participant_a === userId;
    return {
      ...conv,
      other_user: isA ? conv.participant_b_profile : conv.participant_a_profile,
      unread_count: isA ? conv.unread_count_a : conv.unread_count_b,
      // Remove raw profile objects from response
      participant_a_profile: undefined,
      participant_b_profile: undefined,
    };
  });
}

/**
 * Get a single conversation by ID.
 */
export async function getById(convId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', convId)
    .single();
  if (error || !data) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  return data;
}

/**
 * Get the derived AES-256 encryption key for a conversation.
 * Returns base64-encoded 32-byte key.
 */
export function getConversationKey(convId) {
  const key = deriveConversationKey(convId);
  return key.toString('base64');
}
