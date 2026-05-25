import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log('Running QR Sessions migration...');
    const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations/004_qr_sessions.sql'), 'utf-8');
    await client.query(sql);
    console.log('Successfully created qr_sessions table');
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
