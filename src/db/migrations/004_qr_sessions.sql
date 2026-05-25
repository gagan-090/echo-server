-- Migration 004: QR Sessions for scan-to-login
CREATE TABLE public.qr_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash          TEXT NOT NULL UNIQUE,   -- SHA-256 of raw QR token
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'used', 'expired')),
    
    -- Set after mobile confirms
    confirmed_by        UUID REFERENCES public.users(id) ON DELETE CASCADE,
    confirmed_at        TIMESTAMPTZ,
    
    -- Encrypted web tokens (set after confirmation, consumed once on exchange)
    web_access_token    TEXT,       -- AES encrypted with session secret
    web_refresh_token   TEXT,       -- hashed, stored in refresh_tokens table
    
    -- Device info (for "Linked Devices" screen)
    web_user_agent      TEXT,
    web_ip_address      INET,
    
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX qr_sessions_status_expires_idx ON public.qr_sessions (status, expires_at);

ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_sessions_no_client" ON public.qr_sessions FOR ALL TO authenticated USING (false);
