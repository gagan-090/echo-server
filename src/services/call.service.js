import { supabase } from '../config/supabase.js';
import { messageQueue } from '../workers/realtime.worker.js';

export async function logCall(callerId, conversationId, callType, status, durationSeconds) {
  const fileUrl = `CALL_LOG|${callType}|${status}|${durationSeconds || 0}`;

  const insertData = {
    conversation_id: conversationId,
    sender_id: callerId,
    message_type: 'text',
    file_url: fileUrl,
    sent_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('messages')
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(error.message);

  let preview = '';
  if (status === 'completed') {
    preview = callType === 'video' ? '📹 Video call' : '📞 Voice call';
  } else if (status === 'rejected') {
    preview = callType === 'video' ? '📹 Declined video call' : '📞 Declined voice call';
  } else {
    preview = callType === 'video' ? '📹 Missed video call' : '📞 Missed voice call';
  }

  const { data: conv } = await supabase
    .from('conversations')
    .update({
      last_message_preview: preview,
      last_message_at: insertData.sent_at,
      last_message_id: data.id
    })
    .eq('id', conversationId)
    .select('participant_a, participant_b')
    .single();

  if (conv) {
    const receiverId = conv.participant_a === callerId ? conv.participant_b : conv.participant_a;
    await messageQueue.add('notify_message', {
      event: 'new_message',
      receiverId: receiverId,
      payload: { conversation_id: conversationId }
    });
    await messageQueue.add('notify_message', {
      event: 'new_message',
      receiverId: callerId,
      payload: { conversation_id: conversationId }
    });
  }

  return data;
}

export async function getUserCalls(userId) {
  const { data: convs, error: convError } = await supabase
    .from('conversations')
    .select(`
      id,
      participant_a,
      participant_b,
      user_a:users!conversations_participant_a_fkey(id, display_name, avatar_url, echo_id),
      user_b:users!conversations_participant_b_fkey(id, display_name, avatar_url, echo_id)
    `)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`);

  if (convError) throw new Error(convError.message);
  if (!convs || convs.length === 0) return [];

  const convIds = convs.map(c => c.id);

  const { data: calls, error: callsError } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', convIds)
    .like('file_url', 'CALL_LOG|%')
    .order('sent_at', { ascending: false });

  if (callsError) throw new Error(callsError.message);

  return calls.map(call => {
    const conv = convs.find(c => c.id === call.conversation_id);
    const isCaller = call.sender_id === userId;
    const otherUser = conv.participant_a === userId ? conv.user_b : conv.user_a;
    
    const [, type, status, duration] = call.file_url.split('|');

    return {
      id: call.id,
      conversation_id: call.conversation_id,
      caller_id: call.sender_id,
      call_type: type,
      status: status,
      duration_seconds: parseInt(duration) || 0,
      created_at: call.sent_at,
      is_caller: isCaller,
      other_user: otherUser
    };
  });
}
