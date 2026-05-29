import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';
import { supabase as db } from '../config/supabase.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Echo <verifyecho@gaganshukla.in>';

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

  if (insertErr) {
    console.error('INSERT ERROR:', insertErr);
    throw new Error('Failed to register user.');
  }

  return { success: true, message: 'Check your email to verify your account', userId: newUser.id, isResend: false };
}

export async function sendVerificationEmail(userId, email, displayName, purpose = 'verify_email', ref = null) {
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
  let url = `${FRONTEND_URL}/verify-email?token=${rawToken}&purpose=${purpose}`;
  if (ref) url += `&ref=${ref}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Lora:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f2f4f6; font-family: 'DM Sans', Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f2f4f6" style="padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="max-width: 500px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); overflow: hidden;">
                <tr>
                  <td align="center" style="padding: 48px 32px;">
                    
                    <!-- Logo -->
                    <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 8px;">
                      <tr>
                        <td align="center">
                          <svg fill="none" height="28" viewBox="0 0 48 24" width="56" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 12C2 12 6 2 10 2C14 2 18 22 22 22C26 22 30 12 34 12C38 12 42 22 46 22" stroke="#067268" stroke-linecap="round" stroke-width="3" />
                          </svg>
                        </td>
                      </tr>
                    </table>

                    <h1 style="margin: 0 0 4px 0; font-family: 'Lora', Georgia, serif; font-size: 28px; color: #067268; font-weight: 400; letter-spacing: -0.5px;">Echo</h1>
                    <p style="margin: 0 0 40px 0; font-family: 'Lora', Georgia, serif; font-size: 16px; color: #6b7280; font-style: italic;">Clear conversations.</p>

                    <!-- Icon -->
                    <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                      <tr>
                        <td align="center" width="64" height="64" bgcolor="#067268" style="border-radius: 50%;">
                          <img src="https://api.iconify.design/material-symbols:mail-outline.svg?color=%23ffffff" width="32" height="32" alt="Mail" />
                        </td>
                      </tr>
                    </table>

                    <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #1f2937; font-weight: 500;">${purpose === 'verify_email' ? 'Verify your email' : 'Sign in to Echo'}</h2>
                    <p style="margin: 0 0 32px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
                      ${purpose === 'verify_email' ? 'Click the button below to verify your email address and join Echo.' : 'Click the button below to securely sign in to your Echo account.'}
                    </p>

                    <!-- Button -->
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" bgcolor="#067268" style="border-radius: 9999px;">
                          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: 'DM Sans', Arial, sans-serif; font-size: 15px; color: #ffffff; text-decoration: none; font-weight: 500;">
                            ${purpose === 'verify_email' ? 'Verify Email Address' : 'Sign In'}
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 40px 0 0 0; font-size: 13px; color: #9ca3af;">
                      If you didn't request this, you can safely ignore this email.
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
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
      if (error) {
        if (error.name === 'validation_error') {
          console.warn(`[DEV ONLY - RESEND DOMAIN UNVERIFIED] URL for ${email}: ${url}`);
          providerMessageId = 'dev_mock_id';
        } else {
          throw error;
        }
      } else {
        providerMessageId = data.id;
      }
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

export async function checkStatus(email) {
  const { data: user } = await db.from('users').select('email_verified').eq('email', email).single();
  return user ? user.email_verified : false;
}

export async function inviteFriend(referrerId, email) {
  // 1. Check if email exists in users
  const { data: existingUser } = await db.from('users').select('id, email_verified').eq('email', email).single();
  
  let userId;
  if (existingUser) {
    if (existingUser.email_verified) {
      const err = new Error('This user is already registered on Echo.');
      err.code = 'EMAIL_TAKEN';
      err.statusCode = 409;
      throw err;
    }
    userId = existingUser.id;
  } else {
    // 2. Create pending user record with placeholder password hash
    const tempPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    
    const { data: newUser, error: insertErr } = await db.from('users').insert({
      email,
      password_hash: tempPasswordHash,
      display_name: 'Invited Friend',
      auth_provider: 'email',
      email_verified: false,
      registration_step: 'pending_email_verify',
    }).select().single();
    
    if (insertErr) {
      console.error('INSERT ERROR:', insertErr);
      throw new Error('Failed to create invited user record.');
    }
    userId = newUser.id;
  }

  // 3. Generate raw token and hash
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 4. Invalidate old verify/invite tokens for this user
  await db.from('email_verifications').update({ is_used: true }).eq('user_id', userId).eq('purpose', 'verify_email').eq('is_used', false);

  // 5. Insert email verification token
  const { data: newToken, error: tokenErr } = await db.from('email_verifications').insert({
    user_id: userId,
    email,
    token_hash: tokenHash,
    purpose: 'verify_email',
  }).select().single();

  if (tokenErr) {
    console.error('TOKEN INSERT ERROR:', tokenErr);
    throw new Error('Database error generating invitation token.');
  }

  // 6. Build URL and send invitation email
  const url = `${FRONTEND_URL}/accept-invite?token=${rawToken}&ref=${referrerId}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Lora:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f2f4f6; font-family: 'DM Sans', Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f2f4f6" style="padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="max-width: 500px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); overflow: hidden;">
              <tr>
                <td align="center" style="padding: 48px 32px;">
                  <!-- Logo -->
                  <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 8px;">
                    <tr>
                      <td align="center">
                        <svg fill="none" height="28" viewBox="0 0 48 24" width="56" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2 12C2 12 6 2 10 2C14 2 18 22 22 22C26 22 30 12 34 12C38 12 42 22 46 22" stroke="#3b82f6" stroke-linecap="round" stroke-width="3" />
                        </svg>
                      </td>
                    </tr>
                  </table>
                  <h1 style="margin: 0 0 4px 0; font-family: 'Lora', Georgia, serif; font-size: 28px; color: #3b82f6; font-weight: 400; letter-spacing: -0.5px;">Echo</h1>
                  <p style="margin: 0 0 40px 0; font-family: 'Lora', Georgia, serif; font-size: 16px; color: #6b7280; font-style: italic;">Clear conversations.</p>

                  <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #1f2937; font-weight: 500;">You are invited to join Echo!</h2>
                  <p style="margin: 0 0 32px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
                    Your friend has invited you to join Echo. Click the button below to verify your email, set your password, and instantly start chatting!
                  </p>

                  <!-- Button -->
                  <table border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" bgcolor="#3b82f6" style="border-radius: 9999px;">
                        <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: 'DM Sans', Arial, sans-serif; font-size: 15px; color: #ffffff; text-decoration: none; font-weight: 500;">
                          Accept Invitation
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin: 40px 0 0 0; font-size: 13px; color: #9ca3af;">
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  let providerMessageId = null;
  try {
    if (resend) {
      const { data, error } = await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: 'Invitation to join Echo',
        html: htmlContent,
      });
      if (error) {
        if (error.name === 'validation_error') {
          console.warn(`[DEV ONLY - RESEND DOMAIN UNVERIFIED] URL for ${email}: ${url}`);
          providerMessageId = 'dev_mock_id';
        } else {
          throw error;
        }
      } else {
        providerMessageId = data.id;
      }
    } else {
      console.log(`[DEV ONLY] Invite URL for ${email}: ${url}`);
      providerMessageId = 'dev_mock_id';
    }
  } catch (emailErr) {
    console.error('Email send error:', emailErr);
    throw new Error('Failed to send invite email. Please try again.');
  }

  // Update token with provider message ID
  await db.from('email_verifications').update({ provider_message_id: providerMessageId }).eq('id', newToken.id);

  return { success: true, message: 'Invitation email sent successfully.' };
}

export async function acceptInvite(rawToken, password, displayName) {
  // 1. Verify token
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { data: row } = await db.from('email_verifications')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('is_used', false)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!row) {
    const err = new Error('This invitation link is invalid or has expired.');
    err.code = 'INVALID_TOKEN';
    err.statusCode = 400;
    throw err;
  }

  // 2. Mark token as used
  await db.from('email_verifications').update({ is_used: true, used_at: new Date().toISOString() }).eq('id', row.id);

  // 3. Hash the actual password
  const passwordHash = await bcrypt.hash(password, 12);

  // 4. Update the user record
  const { data: user, error: updateErr } = await db.from('users')
    .update({
      password_hash: passwordHash,
      display_name: displayName,
      email_verified: true,
      registration_step: 'complete'
    })
    .eq('id', row.user_id)
    .select()
    .single();

  if (updateErr) {
    console.error('UPDATE USER ERROR:', updateErr);
    throw new Error('Failed to complete user registration.');
  }

  return { user };
}
