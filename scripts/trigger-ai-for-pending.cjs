'use strict';
// Script: dispara a Official AI para gerar drafts de TODAS as ofertas pending sem draft
// Usa o endpoint de produção (Vercel) para processar em lotes de 50
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });
const crypto = require('node:crypto');

const TENANT = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function getOffersPendingWithoutDrafts() {
  const { data: pending } = await supabase.from('offers').select('id').eq('status','pending_manual_review').eq('user_id', TENANT);
  const pendingIds = (pending||[]).map(o => o.id);
  let withDraftIds = new Set();
  for (let i = 0; i < pendingIds.length; i += 200) {
    const chunk = pendingIds.slice(i, i+200);
    const { data } = await supabase.from('posts').select('offer_id').in('offer_id', chunk).eq('status','draft');
    if (data) data.forEach(d => withDraftIds.add(d.offer_id));
  }
  return pendingIds.filter(id => !withDraftIds.has(id));
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const appUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || (vercelUrl ? `https://${vercelUrl}` : 'http://127.0.0.1:3000');
  const endpoint = appUrl.replace(/\/+$/, '') + '/api/ai/generate';
  
  console.log('Endpoint:', endpoint);

  const offerIds = await getOffersPendingWithoutDrafts();
  console.log('Ofertas pending sem draft:', offerIds.length);
  if (offerIds.length === 0) { console.log('Nada a processar!'); return; }

  const correlationId = crypto.randomUUID();
  const totalPages = Math.ceil(offerIds.length / 50);
  console.log('Total de páginas a processar:', totalPages, '(lotes de 50)');
  
  let pagesProcessed = 0;
  let draftsTotal = 0;
  const PAGE_DELAY_MS = 3000; // 3s entre páginas para respeitar rate limits
  
  for (let invocation = 0; invocation <= totalPages; invocation++) {
    if (invocation > 0) await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
    try {
      const response = await axios.post(
        endpoint,
        { command: 'PROCESS_OFFERS', offerIds, correlationId, tenantId: TENANT, requestedAt: new Date().toISOString() },
        { headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlationId, Authorization: `Bearer ${serviceKey}` }, timeout: 120000 }
      );
      pagesProcessed++;
      const data = response.data;
      const pageDrafts = data.metrics?.draftedOffers || 0;
      draftsTotal += pageDrafts;
      process.stdout.write(`\rPágina ${data.pageNumber}/${data.totalPages} | Drafts gerados: ${draftsTotal}`);
      
      if (data.batchCompleted === true) {
        console.log('\n\n✅ Ciclo completo!');
        console.log('Páginas processadas:', pagesProcessed);
        console.log('Total de ofertas com drafts gerados:', draftsTotal);
        console.log('Métricas finais:', JSON.stringify(data.metrics, null, 2));
        break;
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error('\nErro na página', invocation, ':', msg);
      // Continua tentando próximas páginas
      if (invocation >= totalPages) throw err;
    }
  }
}

main().catch(e => { console.error('\nFalha:', e.message); process.exitCode = 1; });
