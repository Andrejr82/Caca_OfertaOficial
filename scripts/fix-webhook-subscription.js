/**
 * Diagnóstico de Inscrição de Webhooks — Parte 2
 * 
 * O diagnóstico anterior mostrou que a Página está inscrita para "messages" e "feed",
 * mas NÃO para "comments" diretamente.
 * 
 * Este script:
 * 1. Verifica os campos inscritos na Página do Facebook
 * 2. Verifica se existe inscrição via Instagram Graph API (subscribed_apps no IG User)
 * 3. Tenta inscrever o app para receber comentários
 */

const fs = require('fs');

function loadEnv() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    line = line.replace(/\r$/, '');
    if (line.startsWith('#') || !line.includes('=')) return;
    const eqIndex = line.indexOf('=');
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
    if (key) env[key] = val;
  });
  return env;
}

async function main() {
  const env = loadEnv();
  const igToken = env['INSTAGRAM_ACCESS_TOKEN'];

  console.log('\n==========================================');
  console.log(' DIAGNÓSTICO DE INSCRIÇÃO DE WEBHOOKS');
  console.log('==========================================\n');

  // 1. Buscar Page Access Token e Page ID
  console.log('--- 1. BUSCANDO PÁGINA E PAGE ACCESS TOKEN ---');
  const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${igToken}`);
  const accountsData = await accountsRes.json();
  const page = accountsData.data?.[0];
  
  if (!page) {
    console.log('❌ Nenhuma página encontrada.');
    return;
  }

  const pageId = page.id;
  const pageToken = page.access_token;
  console.log(`Página: ${page.name} (ID: ${pageId})`);
  console.log(`Page Access Token: ${pageToken ? pageToken.slice(0, 30) + '...' : 'VAZIO'}`);

  // 2. Listar subscriptions atuais (campos inscritos)
  console.log('\n--- 2. CAMPOS INSCRITOS ATUALMENTE (Page subscribed_apps) ---');
  const subRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?access_token=${pageToken}`);
  const subData = await subRes.json();
  
  if (subData.data && subData.data.length > 0) {
    for (const sub of subData.data) {
      console.log(`  App: ${sub.name || sub.id}`);
      console.log(`  Campos: ${(sub.subscribed_fields || []).join(', ')}`);
    }
  } else {
    console.log('  Nenhuma inscrição encontrada');
  }

  // 3. Verificar IG User subscribed_apps
  console.log('\n--- 3. VERIFICANDO IG USER subscribed_apps ---');
  const igRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`);
  const igData = await igRes.json();
  const igBusinessId = igData.instagram_business_account?.id;
  
  if (igBusinessId) {
    console.log(`IG Business ID: ${igBusinessId}`);
    
    // Tentar GET subscribed_apps no IG User
    const igSubRes = await fetch(`https://graph.facebook.com/v21.0/${igBusinessId}/subscribed_apps?access_token=${pageToken}`);
    const igSubText = await igSubRes.text();
    console.log(`IG subscribed_apps response (${igSubRes.status}): ${igSubText.slice(0, 500)}`);
  }

  // 4. INSCREVER para "comments" no IG User via graph.instagram.com
  console.log('\n--- 4. INSCREVENDO APP PARA RECEBER COMMENTS (via Instagram API) ---');
  
  // Para Facebook Login, a documentação da Meta indica inscrever via Page subscribed_apps
  // com subscribed_fields=feed (para Facebook page feed events que incluem comentários)
  // MAS para Instagram comments, precisa ser inscrito via o IG User endpoint
  
  // Tentativa 1: Inscrever via IG User (graph.instagram.com)
  console.log('\n  Tentativa 1: POST /<ig_id>/subscribed_apps com comments (graph.instagram.com)');
  const igSubPostRes = await fetch(
    `https://graph.instagram.com/v21.0/${igBusinessId}/subscribed_apps?subscribed_fields=comments,messages&access_token=${pageToken}`,
    { method: 'POST' }
  );
  const igSubPostData = await igSubPostRes.json();
  console.log(`  Status: ${igSubPostRes.status}`);
  console.log(`  Resposta: ${JSON.stringify(igSubPostData)}`);
  
  if (igSubPostData.success) {
    console.log('  ✅ SUCESSO! App inscrito para comments via Instagram API!');
  } else if (igSubPostData.error) {
    console.log(`  ❌ Erro: ${igSubPostData.error.message}`);
    
    // Tentativa 2: Inscrever via IG User (graph.facebook.com)
    console.log('\n  Tentativa 2: POST /<ig_id>/subscribed_apps com comments (graph.facebook.com)');
    const igSubPostRes2 = await fetch(
      `https://graph.facebook.com/v21.0/${igBusinessId}/subscribed_apps?subscribed_fields=comments,messages&access_token=${pageToken}`,
      { method: 'POST' }
    );
    const igSubPostData2 = await igSubPostRes2.json();
    console.log(`  Status: ${igSubPostRes2.status}`);
    console.log(`  Resposta: ${JSON.stringify(igSubPostData2)}`);
    
    if (igSubPostData2.success) {
      console.log('  ✅ SUCESSO! App inscrito para comments via Facebook Graph API!');
    } else {
      // Tentativa 3: Inscrever no Page com feed (que deveria incluir comments do Instagram)
      console.log('\n  Tentativa 3: Atualizar Page subscribed_apps com feed,messages');
      const pageSubRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=feed,messages&access_token=${pageToken}`,
        { method: 'POST' }
      );
      const pageSubData = await pageSubRes.json();
      console.log(`  Status: ${pageSubRes.status}`);
      console.log(`  Resposta: ${JSON.stringify(pageSubData)}`);
    }
  }

  // 5. Verificar resultado final
  console.log('\n--- 5. VERIFICANDO RESULTADO FINAL ---');
  const finalSubRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?access_token=${pageToken}`);
  const finalSubData = await finalSubRes.json();
  
  if (finalSubData.data && finalSubData.data.length > 0) {
    for (const sub of finalSubData.data) {
      console.log(`  App: ${sub.name || sub.id}`);
      console.log(`  Campos: ${(sub.subscribed_fields || []).join(', ')}`);
    }
  }

  // Re-check IG subscribed_apps
  const finalIgSubRes = await fetch(`https://graph.facebook.com/v21.0/${igBusinessId}/subscribed_apps?access_token=${pageToken}`);
  const finalIgSubText = await finalIgSubRes.text();
  console.log(`\n  IG subscribed_apps final: ${finalIgSubText.slice(0, 500)}`);

  console.log('\n==========================================');
  console.log(' FIM');
  console.log('==========================================\n');
}

main().catch(e => console.error('Erro fatal:', e));
