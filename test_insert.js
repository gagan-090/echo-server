import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Testing insert...');
  const { data, error } = await db.from('users').insert({
    email: 'test' + Date.now() + '@example.com',
    password_hash: 'dummy',
    display_name: 'Test User',
    auth_provider: 'email',
    email_verified: false,
    registration_step: 'pending_email_verify',
  }).select().single();

  if (error) {
    console.error('INSERT ERROR:', error);
  } else {
    console.log('INSERT SUCCESS:', data);
  }
}

run();
