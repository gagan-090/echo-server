-- ============================================================
-- Migration 005: Phone number auth + OTP verification
-- Depends on: 001_create_users.sql
-- Note: I am naming this 005 instead of 010 to follow the actual chronological order in this project's migrations (latest was 004).
-- ============================================================

-- Add phone fields to users table
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_number       TEXT,           -- E.164 format: +919876543210
    ADD COLUMN IF NOT EXISTS phone_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auth_provider      TEXT NOT NULL DEFAULT 'email'
                                                CHECK (auth_provider IN ('email', 'phone', 'both')),
    ADD COLUMN IF NOT EXISTS registration_step  TEXT NOT NULL DEFAULT 'complete'
                                                CHECK (registration_step IN ('pending_phone_verify', 'pending_email_verify', 'complete'));

-- Phone number must be unique when set
ALTER TABLE public.users
    ADD CONSTRAINT users_phone_unique UNIQUE (phone_number);

-- E.164 format validation (+[country code][number], 7-15 digits total)
ALTER TABLE public.users
    ADD CONSTRAINT users_phone_format
    CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{6,14}$');

-- ============================================================
-- OTP Codes table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Target (phone or email — one must be set)
    phone_number        TEXT,           -- E.164 format
    email               TEXT,           -- for email OTP (alternative to magic link)
    
    -- The OTP itself (stored as SHA-256 hash — never plaintext)
    code_hash           TEXT NOT NULL,
    
    -- Purpose
    purpose             TEXT NOT NULL
                        CHECK (purpose IN (
                            'phone_login',        -- first login via phone
                            'phone_signup',       -- new account via phone
                            'phone_verify',       -- verify phone number added to existing account
                            'email_verify_otp',   -- 6-digit code alternative to magic link
                            'phone_change'        -- changing phone number
                        )),
    
    -- Associated user (may be null for signup before user is created)
    user_id             UUID REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Attempt tracking (lockout after OTP_MAX_ATTEMPTS)
    attempts            INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 3,
    is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at           TIMESTAMPTZ,
    
    -- Status
    is_used             BOOLEAN NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMPTZ,
    
    -- Timing
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
    
    -- Cooldown: prevent OTP spam (next OTP not allowed until cooldown_until)
    cooldown_until      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
    
    -- Twilio / MSG91 tracking
    provider_message_id TEXT,          -- Twilio SID or MSG91 request ID
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Only one active OTP per phone/purpose at a time
    CONSTRAINT otp_one_per_phone_purpose EXCLUDE USING btree (
        phone_number WITH =,
        purpose WITH =
    ) WHERE (is_used = FALSE AND is_locked = FALSE),
    
    -- Must have either phone or email
    CONSTRAINT otp_target_required CHECK (
        (phone_number IS NOT NULL) OR (email IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS otp_codes_updated_at ON public.otp_codes;
CREATE TRIGGER otp_codes_updated_at
    BEFORE UPDATE ON public.otp_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS otp_codes_phone_purpose_idx
    ON public.otp_codes (phone_number, purpose, expires_at DESC)
    WHERE is_used = FALSE;

CREATE INDEX IF NOT EXISTS otp_codes_cleanup_idx
    ON public.otp_codes (expires_at)
    WHERE is_used = FALSE;

-- Cleanup expired OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes()
RETURNS INTEGER AS $$
DECLARE cnt INTEGER;
BEGIN
    DELETE FROM public.otp_codes WHERE expires_at < NOW() - INTERVAL '1 hour';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RETURN cnt;
END;
$$ LANGUAGE plpgsql;

-- RLS: backend service role only
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "otp_codes_no_client" ON public.otp_codes;
CREATE POLICY "otp_codes_no_client" ON public.otp_codes FOR ALL TO authenticated USING (false);
DROP POLICY IF EXISTS "otp_codes_no_anon" ON public.otp_codes;
CREATE POLICY "otp_codes_no_anon" ON public.otp_codes FOR ALL TO anon USING (false);
