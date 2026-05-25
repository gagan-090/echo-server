import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function run() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  
  const client = new Client({
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.lvrzcrvjqrlzdlspuqvn',
    password: password,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected to DB pooler');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;');
    console.log('Successfully added fcm_token column!');
    return;
  } catch (e) {
    console.error('Pooler connection failed:', e.message);
  } finally {
    await client.end();
  }
}

run();
