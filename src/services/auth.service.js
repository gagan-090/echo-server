import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../crypto/tokenUtils.js';
import { SALT_ROUNDS } from '../config/constants.js';
import { logger } from '../middleware/logger.js';

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function login(email, password, { userAgent, ip } = {}) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !user) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  const accessToken = generateAccessToken({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString();

  await supabase.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: userAgent || null,
    ip_address: ip || null,
  });

  // Update last_seen
  await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id);

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
}

export async function register(email, password, display_name, { userAgent, ip } = {}) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ email, password_hash: passwordHash, display_name })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
    }
    throw Object.assign(new Error(error.message), { statusCode: 400 });
  }

  const accessToken = generateAccessToken({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString();

  await supabase.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: userAgent || null,
    ip_address: ip || null,
  });

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
}

export async function refresh(token, { userAgent, ip } = {}) {
  const oldHash = hashToken(token);
  const newRefreshToken = generateRefreshToken();
  const newHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS).toISOString();

  // Use the DB function for atomic rotation with replay detection
  const { data, error } = await supabase.rpc('rotate_refresh_token', {
    p_old_hash: oldHash,
    p_new_hash: newHash,
    p_expires_at: expiresAt,
    p_user_agent: userAgent || null,
    p_ip_address: ip || null,
  });

  if (error) {
    logger.error({ error }, 'rotate_refresh_token RPC failed');
    throw Object.assign(new Error('Token rotation failed'), { statusCode: 500 });
  }

  const result = data?.[0] || data;
  if (!result?.success) {
    const reason = result?.error_reason || 'unknown';
    if (reason === 'token_reuse_detected') {
      logger.warn({ familyId: result.family_id, userId: result.user_id }, '🚨 Refresh token reuse detected — family revoked');
    }
    throw Object.assign(new Error(`Refresh failed: ${reason}`), { statusCode: 401, code: 'REFRESH_FAILED' });
  }

  // Issue new access token
  const { data: user } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', result.user_id)
    .single();

  const accessToken = generateAccessToken({ sub: user.id, email: user.email });
  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(token) {
  const tokenHash = hashToken(token);
  await supabase
    .from('refresh_tokens')
    .update({ is_revoked: true, revoked_at: new Date().toISOString(), revoked_reason: 'logout' })
    .eq('token_hash', tokenHash);
}
