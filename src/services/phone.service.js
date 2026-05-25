import twilio from 'twilio';
import crypto from 'crypto';
import db from '../db/supabase.js'; // Assuming direct pg/supabase client is exposed here
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

export async function sendOTP(phoneNumberRaw, purpose) {
  // 1. Validate and normalize phone number
  if (!isValidPhoneNumber(phoneNumberRaw)) {
    const err = new Error('Invalid phone number format');
    err.code = 'INVALID_PHONE';
    err.statusCode = 400;
    throw err;
  }
  const phoneNumber = parsePhoneNumber(phoneNumberRaw).format('E.164');

  // 2. Check cooldown
  const { data: recentOtp, error: cooldownErr } = await db
    .from('otp_codes')
    .select('cooldown_until')
    .eq('phone_number', phoneNumber)
    .eq('purpose', purpose)
    .gt('cooldown_until', new Date().toISOString())
    .single();

  if (recentOtp) {
    const err = new Error('Please wait before requesting another code.');
    err.code = 'COOLDOWN';
    err.statusCode = 429;
    err.retryAfter = recentOtp.cooldown_until;
    throw err;
  }

  // 3. Check user existence based on purpose
  const { data: user } = await db.from('users').select('id, phone_verified').eq('phone_number', phoneNumber).single();

  if (purpose === 'phone_login' && (!user || !user.phone_verified)) {
    const err = new Error('Phone number not registered or not verified.');
    err.code = 'NOT_REGISTERED';
    err.statusCode = 404;
    throw err;
  }

  if (purpose === 'phone_signup' && user && user.phone_verified) {
    const err = new Error('Phone number already registered. Please login.');
    err.code = 'ALREADY_REGISTERED';
    err.statusCode = 409;
    throw err;
  }

  // 4. Invalidate old OTPs
  await db
    .from('otp_codes')
    .update({ is_used: true })
    .eq('phone_number', phoneNumber)
    .eq('purpose', purpose)
    .eq('is_used', false);

  // 5. Generate 6-digit cryptographic OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  // 6. Hash OTP
  const codeHash = crypto.createHash('sha256').update(otp + phoneNumber).digest('hex');

  // 7. Try Twilio Verification
  let providerMessageId = null;
  try {
    if (VERIFY_SERVICE_SID) {
      // Use Twilio Verify if configured
      const verification = await client.verify.v2.services(VERIFY_SERVICE_SID)
        .verifications.create({ to: phoneNumber, channel: 'sms' });
      providerMessageId = verification.sid;
    } else {
      // Fallback: Just log it in development if no Twilio SID
      console.log(`[DEV ONLY] OTP for ${phoneNumber}: ${otp}`);
      providerMessageId = 'dev_mock_id';
    }
  } catch (twilioErr) {
    console.error('Twilio Error:', twilioErr);
    const err = new Error('Failed to send SMS. Please try again later.');
    err.code = 'SMS_FAILED';
    err.statusCode = 500;
    throw err;
  }

  // 8. Insert into DB
  const { error: insertErr } = await db.from('otp_codes').insert({
    phone_number: phoneNumber,
    code_hash: codeHash,
    purpose: purpose,
    provider_message_id: providerMessageId,
    // defaults handle expires_at (+10m) and cooldown_until (+60s)
  });

  if (insertErr) {
    console.error('OTP Insert Error:', insertErr);
    throw new Error('Database error generating OTP');
  }

  return { success: true, expiresIn: 600, cooldownSeconds: 60 };
}

export async function verifyOTP(phoneNumberRaw, code, purpose) {
  const phoneNumber = parsePhoneNumber(phoneNumberRaw).format('E.164');
  const codeHash = crypto.createHash('sha256').update(code + phoneNumber).digest('hex');

  const { data: row, error: fetchErr } = await db
    .from('otp_codes')
    .select('*')
    .eq('phone_number', phoneNumber)
    .eq('purpose', purpose)
    .eq('is_used', false)
    .eq('is_locked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!row) {
    const err = new Error('No active OTP found. Please request a new one.');
    err.code = 'OTP_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (row.code_hash !== codeHash) {
    const newAttempts = row.attempts + 1;
    if (newAttempts >= row.max_attempts) {
      await db.from('otp_codes').update({ is_locked: true, locked_at: new Date().toISOString(), attempts: newAttempts }).eq('id', row.id);
      const err = new Error('Too many attempts. Request a new code.');
      err.code = 'OTP_LOCKED';
      err.statusCode = 429;
      throw err;
    } else {
      await db.from('otp_codes').update({ attempts: newAttempts }).eq('id', row.id);
      const err = new Error(`Wrong code. ${row.max_attempts - newAttempts} attempts left.`);
      err.code = 'OTP_INVALID';
      err.statusCode = 401;
      err.attemptsLeft = row.max_attempts - newAttempts;
      throw err;
    }
  }

  // OTP matches!
  await db.from('otp_codes').update({ is_used: true, used_at: new Date().toISOString() }).eq('id', row.id);

  let userToReturn = null;
  let isNewUser = false;

  if (purpose === 'phone_login') {
    const { data: user } = await db.from('users').select('*').eq('phone_number', phoneNumber).eq('phone_verified', true).single();
    if (!user) throw new Error('User not found after OTP verification.');
    
    // Update last seen
    await db.from('users').update({ updated_at: new Date().toISOString() }).eq('id', user.id);
    userToReturn = user;
    
  } else if (purpose === 'phone_signup') {
    // Create new user
    // Note: display_name will be empty initially until onboarding
    const { data: newUser, error: insertErr } = await db.from('users').insert({
      phone_number: phoneNumber,
      phone_verified: true,
      auth_provider: 'phone',
      registration_step: 'pending_onboarding', // custom step if needed
      email: `${phoneNumber.replace('+', '')}@phone.echo.local`, // dummy email for Supabase unique constraint
    }).select().single();
    
    if (insertErr) throw new Error('Failed to create user account.');
    userToReturn = newUser;
    isNewUser = true;
    
  } else if (purpose === 'phone_verify') {
    // We would need req.user.id here, but let's assume it's passed differently or handled upstream
    return { success: true, verifiedPhone: phoneNumber };
  }

  return { user: userToReturn, isNewUser };
}
