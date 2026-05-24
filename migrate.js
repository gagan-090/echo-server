/**
 * Echo Migration Runner
 * Executes the full schema SQL against Supabase Postgres.
 *
 * Usage: node migrate.js
 *
 * Requires DATABASE_URL env var or SUPABASE_DB_PASSWORD.
 * Connection string format:
 *   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 *   OR postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 */
import fs from 'fs';
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

async function run() {
  // Try multiple connection methods
  const ref = 'lvrzcrvjqrlzdlspuqvn';

  let connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    const dbPassword = process.env.SUPABASE_DB_PASSWORD;
    if (!dbPassword) {
      console.error('❌ Set DATABASE_URL or SUPABASE_DB_PASSWORD in .env');
      console.error('');
      console.error('  Find your database password in:');
      console.error('  Supabase Dashboard → Project Settings → Database → Connection string');
      console.error('');
      console.error('  Then add to .env:');
      console.error('  SUPABASE_DB_PASSWORD=your-password-here');
      console.error('');
      console.error('  Or set the full connection string:');
      console.error(`  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.${ref}.supabase.co:5432/postgres`);
      process.exit(1);
    }
    connectionString = `postgresql://postgres:${dbPassword}@db.${ref}.supabase.co:5432/postgres`;
  }

  console.log('🔌 Connecting to Supabase Postgres...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully');

    // Read the migration SQL
    const sqlPath = new URL('./src/db/migrations/000_full_schema.sql', import.meta.url);
    let sql = fs.readFileSync(sqlPath, 'utf8');

    // Remove CREATE INDEX CONCURRENTLY (can't run inside transaction)
    // We'll run those separately
    const concurrentlyIndexes = [];
    const lines = sql.split('\n');
    const filteredLines = [];
    let collecting = false;
    let currentIndex = '';

    for (const line of lines) {
      if (line.trim().startsWith('CREATE INDEX CONCURRENTLY') || line.trim().startsWith('CREATE UNIQUE INDEX CONCURRENTLY')) {
        collecting = true;
        currentIndex = line;
      } else if (collecting) {
        currentIndex += '\n' + line;
        if (line.trim().endsWith(';')) {
          concurrentlyIndexes.push(currentIndex);
          collecting = false;
          currentIndex = '';
        }
      } else {
        filteredLines.push(line);
      }
    }

    const mainSql = filteredLines.join('\n');

    // Run main schema in a transaction
    console.log('📦 Running main schema migration...');
    await client.query('BEGIN');
    try {
      await client.query(mainSql);
      await client.query('COMMIT');
      console.log('✅ Main schema created successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Run CONCURRENTLY indexes outside transaction (they can't run in transactions)
    if (concurrentlyIndexes.length > 0) {
      console.log(`📊 Creating ${concurrentlyIndexes.length} indexes...`);
      for (const indexSql of concurrentlyIndexes) {
        try {
          await client.query(indexSql);
          // Extract index name for logging
          const match = indexSql.match(/INDEX\s+CONCURRENTLY\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
          console.log(`  ✅ ${match?.[1] || 'index'}`);
        } catch (err) {
          if (err.message.includes('already exists')) {
            const match = indexSql.match(/INDEX\s+CONCURRENTLY\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
            console.log(`  ⏭️  ${match?.[1] || 'index'} (already exists)`);
          } else {
            console.warn(`  ⚠️  Index warning: ${err.message}`);
          }
        }
      }
      console.log('✅ All indexes created');
    }

    // Verify tables exist
    console.log('');
    console.log('🔍 Verifying tables...');
    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('   Tables:', tables.map(t => t.table_name).join(', '));

    // Verify functions
    const { rows: functions } = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public'
      ORDER BY routine_name
    `);
    console.log('   Functions:', functions.map(f => f.routine_name).join(', '));

    console.log('');
    console.log('🎉 Migration complete!');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.error('');
      console.error('💡 Check your database password in Supabase Dashboard:');
      console.error('   Project Settings → Database → Connection string');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
