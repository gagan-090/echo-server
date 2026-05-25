import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

async function run() {
  const connectionString = 'postgresql://postgres.lvrzcrvjqrlzdlspuqvn:qwertyuiop%401234567890QWERTYUIOP@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query(`
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email';
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS registration_step TEXT NOT NULL DEFAULT 'complete';
    `);
    console.log('Columns added successfully!');
  } catch (err) {
    console.error('Error adding columns:', err.message);
  } finally {
    await client.end();
  }
}
run();
