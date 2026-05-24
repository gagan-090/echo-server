-- Indexes (run separately, no transaction)
CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx ON public.users USING GIN (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_last_seen_at_idx ON public.users (last_seen_at DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS conversations_participant_a_idx ON public.conversations (participant_a, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS conversations_participant_b_idx ON public.conversations (participant_b, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON public.conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS messages_conversation_sent_at_idx ON public.messages (conversation_id, sent_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS messages_conversation_all_idx ON public.messages (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages (sender_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS receipts_message_idx ON public.read_receipts (message_id, read_at);
CREATE INDEX IF NOT EXISTS receipts_user_idx ON public.read_receipts (user_id, read_at NULLS FIRST) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON public.refresh_tokens (token_hash) WHERE is_revoked = FALSE;
CREATE INDEX IF NOT EXISTS refresh_tokens_user_active_idx ON public.refresh_tokens (user_id, created_at DESC) WHERE is_revoked = FALSE;
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON public.refresh_tokens (family_id) WHERE is_revoked = FALSE;
CREATE INDEX IF NOT EXISTS users_active_idx ON public.users (id) WHERE is_active = TRUE;
