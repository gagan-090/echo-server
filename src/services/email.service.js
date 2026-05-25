import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';
import db from '../db/supabase.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Echo <noreply@echo.chat>';

export async function register(email, password, displayName) {
  // 1. Check if email exists
  const { data: existingUser } = await db.from('users').select('id, email_verified').eq('email', email).single();

  if (existingUser) {
    if (existingUser.email_verified) {
      const err = new Error('Email already registered.');
      err.code = 'EMAIL_TAKEN';
      err.statusCode = 409;
      throw err;
    }
    // If not verified, we can resend verification, but we shouldn't create a duplicate.
    return { success: true, message: 'Check your email to verify your account', userId: existingUser.id, isResend: true };
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // 3. Insert user
  const { data: newUser, error: insertErr } = await db.from('users').insert({
    email,
    password_hash: passwordHash,
    display_name: displayName,
    auth_provider: 'email',
    email_verified: false,
    registration_step: 'pending_email_verify',
  }).select().single();

  if (insertErr) throw new Error('Failed to register user.');

  return { success: true, message: 'Check your email to verify your account', userId: newUser.id, isResend: false };
}

export async function sendVerificationEmail(userId, email, displayName, purpose = 'verify_email') {
  // 1. Generate raw token
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 2. Check cooldown
  const { data: recentToken } = await db.from('email_verifications')
    .select('next_resend_allowed')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .gt('next_resend_allowed', new Date().toISOString())
    .single();

  if (recentToken) {
    const err = new Error('Please wait before requesting a new email.');
    err.code = 'EMAIL_COOLDOWN';
    err.statusCode = 429;
    err.retryAfter = recentToken.next_resend_allowed;
    throw err;
  }

  // 3. Invalidate old tokens
  await db.from('email_verifications').update({ is_used: true }).eq('user_id', userId).eq('purpose', purpose).eq('is_used', false);

  // 4. Insert new token
  const { data: newToken, error: insertErr } = await db.from('email_verifications').insert({
    user_id: userId,
    email,
    token_hash: tokenHash,
    purpose,
  }).select().single();

  if (insertErr) throw new Error('Database error generating verification token.');

  // 5. Build URL and HTML
  const url = `${FRONTEND_URL}/verify-email?token=${rawToken}&purpose=${purpose}`;
  
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #18A0A0;">Echo</h2>
      <h3>Verify your email address</h3>
      <p>Hi ${displayName || 'there'},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${url}" style="display:inline-block; padding:12px 24px; background:#18A0A0; color:#fff; text-decoration:none; border-radius:8px;">Verify Email</a>
      <p>If the button doesn't work, copy and paste this link: <br> ${url}</p>
    </div>
  `;

  // 6. Send email via Resend
  let providerMessageId = null;
  try {
    if (process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: purpose === 'verify_email' ? 'Verify your Echo account' : 'Your Echo sign-in link',
        html: htmlContent,
      });
      if (error) throw error;
      providerMessageId = data.id;
    } else {
      console.log(`[DEV ONLY] Verification URL for ${email}: ${url}`);
      providerMessageId = 'dev_mock_id';
    }
  } catch (emailErr) {
    console.error('Email send error:', emailErr);
    throw new Error('Failed to send email. Please try again.');
  }

  // Update provider message ID
  await db.from('email_verifications').update({ provider_message_id: providerMessageId }).eq('id', newToken.id);

  return { success: true };
}

export async function verifyEmailToken(rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { data: row } = await db.from('email_verifications')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('is_used', false)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!row) {
    const err = new Error('This link is invalid or has expired.');
    err.code = 'INVALID_TOKEN';
    err.statusCode = 400;
    throw err;
  }

  // Mark as used
  await db.from('email_verifications').update({ is_used: true, used_at: new Date().toISOString() }).eq('id', row.id);

  let userToReturn = null;
  let isNewUser = false;

  if (row.purpose === 'verify_email') {
    await db.from('users').update({ email_verified: true, registration_step: 'complete' }).eq('id', row.user_id);
    const { data: user } = await db.from('users').select('*').eq('id', row.user_id).single();
    userToReturn = user;
    isNewUser = true;
  } else if (row.purpose === 'magic_link_login') {
    const { data: user } = await db.from('users').select('*').eq('id', row.user_id).single();
    if (!user || !user.email_verified) throw new Error('Email must be verified first.');
    await db.from('users').update({ updated_at: new Date().toISOString() }).eq('id', user.id);
    userToReturn = user;
  } else if (row.purpose === 'change_email') {
    await db.from('users').update({ email: row.new_email, email_verified: true }).eq('id', row.user_id);
    return { success: true, message: 'Email updated successfully' };
  }

  return { user: userToReturn, isNewUser };
}

export async function login(email, password) {
  const { data: user } = await db.from('users').select('*').eq('email', email).single();
  
  if (!user) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    err.statusCode = 401;
    throw err;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    err.statusCode = 401;
    throw err;
  }

  if (!user.email_verified) {
    const err = new Error('Please verify your email first');
    err.code = 'EMAIL_NOT_VERIFIED';
    err.statusCode = 403;
    err.action = 'resend_verification';
    err.userId = user.id;
    throw err;
  }

  return { user };
}
