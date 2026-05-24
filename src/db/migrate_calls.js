import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env') });

const { Client } = pg;

const client = new Client({
  host: 'db.lvrzcrvjqrlzdlspuqvn.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD || 'qwertyuiop@1234567890QWERTYUIOP',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to database.');

  const query = `
    CREATE TABLE IF NOT EXISTS public.calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        caller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
        status TEXT NOT NULL CHECK (status IN ('completed', 'missed', 'rejected', 'no_answer')),
        duration_seconds INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Enable RLS
    ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if any
    DROP POLICY IF EXISTS "calls_select_participant" ON public.calls;
    DROP POLICY IF EXISTS "calls_insert_participant" ON public.calls;
    DROP POLICY IF EXISTS "calls_update_participant" ON public.calls;

    -- Select policy
    CREATE POLICY "calls_select_participant" ON public.calls FOR SELECT TO authenticated
        USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

    -- Insert policy
    CREATE POLICY "calls_insert_participant" ON public.calls FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id);

    -- Update policy
    CREATE POLICY "calls_update_participant" ON public.calls FOR UPDATE TO authenticated
        USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
  `;

  try {
    await client.query(query);
    console.log('Migration completed successfully. Table public.calls created.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

main();
