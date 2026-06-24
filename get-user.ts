import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const WebSocket = require('ws');
(global as any).WebSocket = WebSocket;

async function run() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data, error } = await s.from('users').select('id').limit(1);
  if (error) {
    console.error('Error users table:', error);
    const { data: d2, error: e2 } = await s.auth.admin.listUsers();
    console.log('Auth Users:', d2?.users.map(u => u.id));
  } else {
    console.log('Valid User ID:', data);
  }
}
run();
