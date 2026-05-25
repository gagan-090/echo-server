import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function migrate() {
  const client = new Client({
    connectionString: 'postgresql://postgres:qwertyuiop%401234567890QWERTYUIOP@db.lvrzcrvjqrlzdlspuqvn.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log('Adding reply_to_id to messages table...');
    await client.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
    `);
    console.log('Successfully added reply_to_id');
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
