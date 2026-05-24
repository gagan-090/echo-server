import { supabase } from './src/config/supabase.js';

async function test() {
  const { data: msgs, error: msgsError } = await supabase.from('messages').select('*, read_receipts(*)').limit(5);
  console.log('Messages with receipts:', JSON.stringify(msgs, null, 2));
}

test();
