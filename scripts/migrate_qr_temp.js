import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.SUPABASE_URL 
  ? process.env.SUPABASE_URL.replace('https://', 'postgres://postgres.vIjsq89rrLTeBAo7qdY12zPiUzepzEBGKjGgc3ecFgk:your-password@') 
  : process.env.DATABASE_URL;

// using direct connection pooler string if available from previous steps. 
// Actually, earlier I noticed there was a script `migrate_replies.js`. I can check its connection string.
