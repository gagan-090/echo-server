import { supabase } from '../config/supabase.js';
import { v4 as uuid } from 'uuid';

export async function uploadFile(buffer, filename, mimetype, userId) {
  const path = `uploads/${userId}/${uuid()}-${filename}`;
  const { error } = await supabase.storage.from('attachments').upload(path, buffer, { contentType: mimetype });
  if (error) throw new Error(error.message);
  const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
  return { url: urlData.publicUrl, path, size: buffer.length };
}

export async function deleteFile(path) {
  await supabase.storage.from('attachments').remove([path]);
}
