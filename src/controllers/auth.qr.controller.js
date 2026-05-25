import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { generateTokens } from '../crypto/tokenUtils.js';

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const createQrSession = async (req, res) => {
  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const { data, error } = await supabase
      .from('qr_sessions')
      .insert({
        token_hash: tokenHash,
        status: 'pending'
      })
      .select('id, expires_at')
      .single();

    if (error) throw error;

    res.json({
      data: {
        sessionId: data.id,
        qrToken: rawToken,
        expiresAt: data.expires_at
      }
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: 'Failed to create QR session' });
  }
};

export const pollQrSession = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('qr_sessions')
      .select('status, expires_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (new Date(data.expires_at) < new Date() && data.status === 'pending') {
      await supabase.from('qr_sessions').update({ status: 'expired' }).eq('id', id);
      return res.json({ data: { status: 'expired' } });
    }

    res.json({ data });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: 'Failed to poll QR session' });
  }
};

export const confirmQrSession = async (req, res) => {
  try {
    const { qrToken } = req.body;
    const userId = req.user.id;

    if (!qrToken) return res.status(400).json({ error: 'qrToken required' });

    const tokenHash = hashToken(qrToken);

    // Find pending session
    const { data: session, error: fetchError } = await supabase
      .from('qr_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: 'Invalid or expired QR code' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'QR code already used' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(400).json({ error: 'QR code expired' });
    }

    // Generate tokens for web
    const { accessToken, refreshToken } = await generateTokens(userId);

    // Save tokens in session (for web to claim)
    const { error: updateError } = await supabase
      .from('qr_sessions')
      .update({
        status: 'confirmed',
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
        web_access_token: accessToken,
        web_refresh_token: refreshToken,
        web_user_agent: req.headers['user-agent'] || 'Unknown Device',
        web_ip_address: req.ip || '0.0.0.0'
      })
      .eq('id', session.id);

    if (updateError) throw updateError;

    res.json({ data: { success: true } });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: 'Failed to confirm QR session' });
  }
};

export const exchangeQrSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const { data: session, error } = await supabase
      .from('qr_sessions')
      .select('*, users(id, email, display_name, avatar_url, echo_id)')
      .eq('id', sessionId)
      .single();

    if (error || !session || session.status !== 'confirmed') {
      return res.status(400).json({ error: 'Invalid or unconfirmed session' });
    }

    // Mark as used
    await supabase.from('qr_sessions').update({ status: 'used' }).eq('id', sessionId);

    // Set cookie for web
    res.cookie('refreshToken', session.web_refresh_token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: process.env.COOKIE_SAME_SITE || 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      data: {
        accessToken: session.web_access_token,
        user: session.users
      }
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: 'Failed to exchange QR session' });
  }
};

export const getLinkedDevices = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('qr_sessions')
      .select('id, web_user_agent, web_ip_address, confirmed_at, status')
      .eq('confirmed_by', req.user.id)
      .in('status', ['confirmed', 'used'])
      .order('confirmed_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: 'Failed to fetch linked devices' });
  }
};

export const logoutLinkedDevice = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { error } = await supabase
      .from('qr_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('confirmed_by', req.user.id); // ensure ownership

    if (error) throw error;
    res.json({ data: { success: true } });
  } catch (error) {
    req.log.error(error);
    res.status(500).json({ error: 'Failed to logout device' });
  }
};
