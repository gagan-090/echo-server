-- ============================================================
-- Migration 006: Email verification tokens (magic link)
-- Depends on: 001_create_users.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_verifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    
    -- SHA-256 hash of the raw verification token
    -- Raw token is embedded in the magic link URL: /verify-email?token=RAW_TOKEN
    token_hash          TEXT NOT NULL UNIQUE,
    
    -- Purpose
    purpose             TEXT NOT NULL DEFAULT 'verify_email'
                        CHECK (purpose IN (
                            'verify_email',       -- new signup email verification
                            'change_email',       -- changing to a new email
                            'magic_link_login'    -- passwordless email login
                        )),
    
    -- New email (only set for change_email purpose)
    new_email           TEXT,
    
    -- Status
    is_used             BOOLEAN NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMPTZ,
    
    -- Resend tracking
    resend_count        INTEGER NOT NULL DEFAULT 0,
    last_sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Resend cooldown (60s between resends)
    next_resend_allowed TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
    
    -- Expiry: 24 hours for verification, 15 minutes for magic link login
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Provider tracking (Resend / SendGrid message ID)
    provider_message_id TEXT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT email_verifications_max_resends CHECK (resend_count <= 5)
);

-- Indexes
CREATE INDEX IF NOT EXISTS email_verifications_user_purpose_idx
    ON public.email_verifications (user_id, purpose, expires_at DESC)
    WHERE is_used = FALSE;

CREATE INDEX IF NOT EXISTS email_verifications_cleanup_idx
    ON public.email_verifications (expires_at)
    WHERE is_used = FALSE;

-- Cleanup
CREATE OR REPLACE FUNCTION cleanup_expired_email_verifications()
RETURNS INTEGER AS $$
DECLARE cnt INTEGER;
BEGIN
    DELETE FROM public.email_verifications WHERE expires_at < NOW() - INTERVAL '48 hours';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RETURN cnt;
END;
$$ LANGUAGE plpgsql;

-- RLS: backend only
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_verif_no_client" ON public.email_verifications;
CREATE POLICY "email_verif_no_client" ON public.email_verifications FOR ALL TO authenticated USING (false);
DROP POLICY IF EXISTS "email_verif_no_anon" ON public.email_verifications;
CREATE POLICY "email_verif_no_anon" ON public.email_verifications FOR ALL TO anon USING (false);
