'use strict';
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  for (const ch of ['telegram','instagram','whatsapp']) {
    const { count } = await supabase.from('posts').select('id', {count:'exact',head:true}).eq('channel', ch).eq('status','draft');
    console.log(ch + ' drafts prontos para aprovacao:', count);
  }

  const { data: pending } = await supabase.from('offers').select('id').eq('status','pending_manual_review').eq('user_id','7a9ca7b7-f464-46e0-a9de-9b322c73628a');
  const pendingIds = (pending||[]).map(o => o.id);

  // Buscar em chunks
  let allWithDraftPosts = [];
  for (let i = 0; i < pendingIds.length; i += 200) {
    const chunk = pendingIds.slice(i, i+200);
    const { data } = await supabase.from('posts').select('offer_id').in('offer_id', chunk).eq('status','draft');
    if (data) allWithDraftPosts.push(...data);
  }
  const withDrafts = new Set(allWithDraftPosts.map(d => d.offer_id));
  console.log('\nTotal pending_manual_review:', pendingIds.length);
  console.log('Com ao menos 1 draft (visíveis nas abas sociais):', withDrafts.size);
  console.log('SEM nenhum draft (invisíveis):', pendingIds.length - withDrafts.size);

  // Idempotency records
  const { data: allIdemp } = await supabase.from('app_settings').select('key, value').like('key','pmav5.ai.idempotency.ai:draft:%').eq('user_id','7a9ca7b7-f464-46e0-a9de-9b322c73628a').limit(2000);
  const hasActor = (allIdemp||[]).filter(r => r.value && r.value.fingerprint && r.value.fingerprint.indexOf('"actor"') >= 0);
  const completed = (allIdemp||[]).filter(r => r.value && r.value.status === 'completed');
  const pendingStuck = (allIdemp||[]).filter(r => r.value && r.value.status === 'pending');
  console.log('\nIdempotency records total:', (allIdemp||[]).length);
  console.log('Formato OLD (com actor no fingerprint):', hasActor.length);
  console.log('Completed com resultado:', completed.filter(r => r.value && r.value.result).length);
  console.log('Pending (travados):', pendingStuck.length);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
