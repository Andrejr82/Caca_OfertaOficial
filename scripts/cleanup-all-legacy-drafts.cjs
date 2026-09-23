'use strict';

const fs = require('fs');

function loadEnv() {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  });
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function getDraftsCountByChannel() {
  const channels = ['whatsapp', 'telegram', 'instagram', 'facebook'];
  const counts = {};
  for (const ch of channels) {
    const res = await fetch(`${url}/rest/v1/posts?channel=eq.${ch}&status=eq.draft&deleted_at=is.null&select=id`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    });
    const contentRange = res.headers.get('content-range');
    counts[ch] = contentRange ? parseInt(contentRange.split('/')[1] || '0', 10) : 0;
  }
  return counts;
}

async function cleanupDraftsInBatches() {
  console.log('===============================================================');
  console.log('  INICIANDO LIMPEZA SEGURA DE RASCUNHOS EM LOTE (SOFT-DELETE)  ');
  console.log('===============================================================\n');

  const beforeCounts = await getDraftsCountByChannel();
  const totalBefore = Object.values(beforeCounts).reduce((a, b) => a + b, 0);

  console.log('Contagem ANTES da limpeza:');
  console.table(beforeCounts);
  console.log(`Total acumulado a limpar: ${totalBefore} rascunhos\n`);

  if (totalBefore === 0) {
    console.log('Nenhum rascunho pendente encontrado. Painel já está limpo!');
    return;
  }

  const now = new Date().toISOString();
  let remaining = totalBefore;
  let batchIndex = 1;
  const batchSize = 500;

  while (remaining > 0) {
    // 1. Buscar até 500 IDs de posts com status='draft' e deleted_at is null
    const fetchRes = await fetch(`${url}/rest/v1/posts?status=eq.draft&deleted_at=is.null&select=id&limit=${batchSize}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    const items = await fetchRes.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('Nenhum item restante retornado na busca.');
      break;
    }

    const ids = items.map(it => it.id);

    // 2. Atualizar este lote para deleted
    const updateRes = await fetch(`${url}/rest/v1/posts?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        status: 'deleted',
        deleted_at: now
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error(`Erro ao atualizar lote ${batchIndex}:`, errText);
      throw new Error(`Falha no PATCH do lote ${batchIndex}`);
    }

    console.log(`Lote ${batchIndex}: ${ids.length} rascunhos marcados como deletados com sucesso.`);
    batchIndex++;
    
    // Pequeno throttle para não sobrecarregar conexão
    await new Promise(r => setTimeout(r, 100));

    if (items.length < batchSize) {
      break;
    }
  }

  console.log('\n===============================================================');
  console.log('                  VERIFICAÇÃO PÓS-LIMPEZA                      ');
  console.log('===============================================================\n');

  const afterCounts = await getDraftsCountByChannel();
  const totalAfter = Object.values(afterCounts).reduce((a, b) => a + b, 0);

  console.log('Contagem APÓS a limpeza:');
  console.table(afterCounts);

  if (totalAfter === 0) {
    console.log(`\nSUCESSO: Todas as 4 abas sociais estão 100% limpas (0 rascunhos pendentes)!`);
  } else {
    console.warn(`\nAtenção: Ainda restam ${totalAfter} rascunhos.`);
  }
}

cleanupDraftsInBatches().catch(console.error);
