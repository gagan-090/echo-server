-- Echo Chat App — Main Schema (no CONCURRENTLY indexes)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    avatar_url      TEXT,
    bio             TEXT,
    last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 60),
    CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(bio) <= 200)
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_a       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    participant_b       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    last_message_id     UUID,
    last_message_at     TIMESTAMPTZ,
    last_message_preview TEXT,
    unread_count_a      INTEGER NOT NULL DEFAULT 0,
    unread_count_b      INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversations_unique_pair UNIQUE (participant_a, participant_b),
    CONSTRAINT conversations_different_participants CHECK (participant_a != participant_b),
    CONSTRAINT conversations_canonical_order CHECK (participant_a < participant_b)
);

CREATE TRIGGER conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION get_or_create_conversation(user_a UUID, user_b UUID)
RETURNS public.conversations AS $$
DECLARE
    p_a UUID; p_b UUID; conv public.conversations;
BEGIN
    IF user_a < user_b THEN p_a := user_a; p_b := user_b;
    ELSE p_a := user_b; p_b := user_a; END IF;
    SELECT * INTO conv FROM public.conversations WHERE participant_a = p_a AND participant_b = p_b;
    IF NOT FOUND THEN
        INSERT INTO public.conversations (participant_a, participant_b) VALUES (p_a, p_b) RETURNING * INTO conv;
    END IF;
    RETURN conv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TYPE public.message_type AS ENUM ('text', 'image', 'file');
CREATE TYPE public.message_status AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE public.messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_encrypted   TEXT,
    iv                  TEXT,
    message_type        public.message_type NOT NULL DEFAULT 'text',
    file_url            TEXT,
    file_name           TEXT,
    file_size_bytes     INTEGER,
    file_mime_type      TEXT,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_content_or_file CHECK (
        (is_deleted = TRUE) OR (content_encrypted IS NOT NULL AND iv IS NOT NULL) OR (file_url IS NOT NULL)
    ),
    CONSTRAINT messages_file_metadata CHECK (
        (message_type = 'text') OR (file_url IS NOT NULL)
    )
);

CREATE TRIGGER messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE preview TEXT;
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.is_deleted = FALSE) THEN
        CASE NEW.message_type
            WHEN 'text'  THEN preview := '...';
            WHEN 'image' THEN preview := '📷 Photo';
            WHEN 'file'  THEN preview := '📎 ' || COALESCE(NEW.file_name, 'File');
            ELSE preview := 'Message';
        END CASE;
        UPDATE public.conversations SET
            last_message_id = NEW.id, last_message_at = NEW.sent_at, last_message_preview = preview,
            unread_count_a = CASE WHEN participant_a != NEW.sender_id THEN unread_count_a + 1 ELSE unread_count_a END,
            unread_count_b = CASE WHEN participant_b != NEW.sender_id THEN unread_count_b + 1 ELSE unread_count_b END
        WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_update_conversation
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_last_message_fk
    FOREIGN KEY (last_message_id) REFERENCES public.messages(id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.read_receipts (
    message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);

CREATE TRIGGER read_receipts_updated_at
    BEFORE UPDATE ON public.read_receipts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION reset_unread_on_read()
RETURNS TRIGGER AS $$
DECLARE conv_id UUID; conv public.conversations%ROWTYPE;
BEGIN
    IF (NEW.read_at IS NOT NULL AND (OLD.read_at IS NULL)) THEN
        SELECT conversation_id INTO conv_id FROM public.messages WHERE id = NEW.message_id;
        SELECT * INTO conv FROM public.conversations WHERE id = conv_id;
        IF conv.participant_a = NEW.user_id THEN
            UPDATE public.conversations SET unread_count_a = 0 WHERE id = conv_id;
        ELSIF conv.participant_b = NEW.user_id THEN
            UPDATE public.conversations SET unread_count_b = 0 WHERE id = conv_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER read_receipts_reset_unread
    AFTER INSERT OR UPDATE ON public.read_receipts
    FOR EACH ROW EXECUTE FUNCTION reset_unread_on_read();

CREATE OR REPLACE FUNCTION mark_conversation_read(p_conv_id UUID, p_user_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.read_receipts (message_id, user_id, read_at)
    SELECT m.id, p_user_id, NOW() FROM public.messages m
    WHERE m.conversation_id = p_conv_id AND m.sender_id != p_user_id AND m.is_deleted = FALSE
      AND NOT EXISTS (SELECT 1 FROM public.read_receipts rr WHERE rr.message_id = m.id AND rr.user_id = p_user_id AND rr.read_at IS NOT NULL)
    ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW(), updated_at = NOW()
    WHERE read_receipts.read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE public.refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    family_id       UUID NOT NULL DEFAULT uuid_generate_v4(),
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    user_agent      TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash)
);

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS INTEGER AS $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM public.refresh_tokens WHERE (expires_at < NOW()) OR (is_revoked = TRUE AND revoked_at < NOW() - INTERVAL '30 days');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rotate_refresh_token(
    p_old_hash TEXT, p_new_hash TEXT, p_expires_at TIMESTAMPTZ,
    p_user_agent TEXT DEFAULT NULL, p_ip_address INET DEFAULT NULL
) RETURNS TABLE(user_id UUID, family_id UUID, success BOOLEAN, error_reason TEXT) AS $$
DECLARE old_token public.refresh_tokens%ROWTYPE;
BEGIN
    SELECT * INTO old_token FROM public.refresh_tokens WHERE token_hash = p_old_hash;
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'token_not_found'; RETURN;
    END IF;
    IF old_token.is_revoked THEN
        UPDATE public.refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'security_breach'
        WHERE refresh_tokens.family_id = old_token.family_id AND is_revoked = FALSE;
        RETURN QUERY SELECT old_token.user_id, old_token.family_id, FALSE, 'token_reuse_detected'; RETURN;
    END IF;
    IF old_token.expires_at < NOW() THEN
        UPDATE public.refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'expired' WHERE id = old_token.id;
        RETURN QUERY SELECT old_token.user_id, old_token.family_id, FALSE, 'token_expired'; RETURN;
    END IF;
    UPDATE public.refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'used' WHERE id = old_token.id;
    INSERT INTO public.refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
    VALUES (old_token.user_id, p_new_hash, old_token.family_id, p_expires_at, p_user_agent, p_ip_address);
    RETURN QUERY SELECT old_token.user_id, old_token.family_id, TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_authenticated" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select_participant" ON public.conversations FOR SELECT TO authenticated
    USING (auth.uid() = participant_a OR auth.uid() = participant_b);
CREATE POLICY "conversations_update_participant" ON public.conversations FOR UPDATE TO authenticated
    USING (auth.uid() = participant_a OR auth.uid() = participant_b);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_participant" ON public.messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())));
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())));
CREATE POLICY "messages_update_own_sender" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

ALTER TABLE public.read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipts_select_participant" ON public.read_receipts FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())));
CREATE POLICY "receipts_upsert_own" ON public.read_receipts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "receipts_update_own" ON public.read_receipts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refresh_tokens_no_client_access" ON public.refresh_tokens FOR ALL TO authenticated USING (false);
CREATE POLICY "refresh_tokens_no_anon_access" ON public.refresh_tokens FOR ALL TO anon USING (false);

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
