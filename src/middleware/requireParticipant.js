import { supabase } from '../config/supabase.js';

export const requireParticipant = async (req, res, next) => {
  const convId = req.params.id || req.params.convId;
  const userId = req.user.id;
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', convId)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .single();

  if (error || !data) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not a participant of this conversation', statusCode: 403 });
  }
  next();
};
