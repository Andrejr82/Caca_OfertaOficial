import { createSupabaseAdminClient } from '@/lib/supabase/admin';

async function run() {
  const db = createSupabaseAdminClient();
  if (!db) {
      console.log('No DB client');
      return;
  }
  const { data, error } = await db.from('posts').select('id, content, offers(id, platform)').eq('status', 'draft').limit(10);
  console.log(JSON.stringify(data, null, 2));
}
run();
