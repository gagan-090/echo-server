import { supabase } from '../config/supabase.js';

export async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('id, echo_id, email, display_name, avatar_url, bio, last_seen_at, is_active, created_at')
    .eq('id', id)
    .single();
  if (error || !data) throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  return data;
}

export async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id, echo_id, email, display_name, avatar_url, bio, last_seen_at')
    .eq('email', email)
    .single();
  if (error || !data) throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  return data;
}

export async function updateUser(id, updates) {
  // Only allow safe fields
  const allowed = {};
  if (updates.display_name !== undefined) allowed.display_name = updates.display_name;
  if (updates.avatar_url !== undefined) allowed.avatar_url = updates.avatar_url;
  if (updates.bio !== undefined) allowed.bio = updates.bio;
  if (updates.fcm_token !== undefined) allowed.fcm_token = updates.fcm_token;

  const { data, error } = await supabase
    .from('users')
    .update(allowed)
    .eq('id', id)
    .select('id, echo_id, email, display_name, avatar_url, bio, last_seen_at')
    .single();
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
  return data;
}

export async function searchUsers(query, excludeId) {
  if (!query || query.trim().length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id, echo_id, email, display_name, avatar_url, last_seen_at')
    .or(`display_name.ilike.%${query}%,echo_id.eq.${query}`)
    .neq('id', excludeId)
    .eq('is_active', true)
    .limit(20);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateLastSeen(id) {
  await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', id);
}

export async function uploadAvatarFile(userId, fileBuffer, mimeType, extension) {
  // Try to create bucket just in case (will fail silently if exists due to RLS or exists)
  await supabase.storage.createBucket('avatars', { public: true }).catch(() => {});
  
  const fileName = `${userId}/avatar_${Date.now()}.${extension}`;
  
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(fileName, fileBuffer, {
      contentType: mimeType,
      upsert: true
    });
    
  if (error) {
    // Fallback: If storage fails (e.g. no permissions), store as base64 string
    const base64 = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    return updateUser(userId, { avatar_url: base64 });
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
  return updateUser(userId, { avatar_url: urlData.publicUrl });
}
