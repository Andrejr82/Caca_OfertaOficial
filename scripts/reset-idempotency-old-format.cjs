'use strict';
// Script: limpa todos os registros de idempotência no formato OLD (com actor+origin no fingerprint)
// para ofertas que estão em pending_manual_review e NÃO têm drafts gerados.
// Isso permite que o Oracle Worker (próximo ciclo) ou o botão manual gere os drafts corretamente.
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const TENANT = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';

  // 1. Buscar todos os registros de idempotência formato OLD
  const { data: allIdemp, error: idempError } = await supabase
    .from('app_settings')
    .select('key, value')
    .like('key', 'pmav5.ai.idempotency.ai:draft:%')
    .eq('user_id', TENANT)
    .limit(2000);
  if (idempError) throw new Error('Erro ao ler idempotency: ' + idempError.message);

  // Apenas os no formato OLD (fingerprint contém "actor")
  const oldRecords = (allIdemp || []).filter(r =>
    r.value && r.value.fingerprint && r.value.fingerprint.indexOf('"actor"') >= 0
  );
  console.log('Registros OLD encontrados:', oldRecords.length);

  // 2. Extrair offer IDs dessas chaves (formato: pmav5.ai.idempotency.ai:draft:{offerId}:v2)
  const offerIdsFromIdemp = oldRecords.map(r => {
    const match = r.key.match(/ai:draft:([a-f0-9-]+):v2$/);
    return match ? match[1] : null;
  }).filter(Boolean);

  // 3. Verificar quais dessas ofertas NÃO têm draft (são as que precisam ser resetadas)
  const withDraftsSet = new Set();
  for (let i = 0; i < offerIdsFromIdemp.length; i += 200) {
    const chunk = offerIdsFromIdemp.slice(i, i + 200);
    const { data } = await supabase.from('posts').select('offer_id').in('offer_id', chunk).eq('status', 'draft');
    if (data) data.forEach(d => withDraftsSet.add(d.offer_id));
  }

  const toDelete = oldRecords.filter(r => {
    const match = r.key.match(/ai:draft:([a-f0-9-]+):v2$/);
    const offerId = match ? match[1] : null;
    // Deleta se NÃO tem draft (oferta ainda pendente sem conteúdo)
    return offerId && !withDraftsSet.has(offerId);
  });

  console.log('Com drafts (manter):', withDraftsSet.size);
  console.log('Sem drafts - para deletar:', toDelete.length);

  if (toDelete.length === 0) {
    console.log('Nada a deletar. Estado já está correto.');
    return;
  }

  // 4. Deletar em chunks
  const keysToDelete = toDelete.map(r => r.key);
  let deleted = 0;
  const CHUNK = 100;
  for (let i = 0; i < keysToDelete.length; i += CHUNK) {
    const chunk = keysToDelete.slice(i, i + CHUNK);
    const { error } = await supabase.from('app_settings')
      .delete()
      .eq('user_id', TENANT)
      .in('key', chunk);
    if (error) { console.error('Erro ao deletar chunk:', error.message); break; }
    deleted += chunk.length;
    process.stdout.write('.');
  }
  console.log('\nDeletados:', deleted, 'registros de idempotência obsoletos');
  console.log('Pronto! As', deleted, 'ofertas podem agora ter drafts gerados pelo Oracle Worker ou pelo botão manual.');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
