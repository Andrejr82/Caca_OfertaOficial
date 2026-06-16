/**
 * Diagnóstico Final: Por que os webhooks não chegam?
 * 
 * Descobertas anteriores:
 * - Token VÁLIDO ✅
 * - Permissões OK ✅ 
 * - Page subscribed_apps: "messages, feed" ✅
 * - Webhook GET verification: OK ✅
 * - Webhook POST manual: funciona ✅
 * - IG subscribed_apps: NÃO EXISTE para Facebook Login ✅ (esperado)
 * 
 * A questão é: A configuração no App Dashboard está correta?
 * Para Facebook Login, webhooks de Instagram comments vêm do objeto "instagram"
 * com o campo "comments" configurado no App > Webhooks no Meta Developer Dashboard.
 * 
 * Este script verifica:
 * 1. Se o app tem webhook subscriptions no nível do APP (não da página)
 * 2. Se o app está em modo "Live" (não development)
 * 3. Se comentários recentes existem nos posts publicados
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
  console.log(' DIAGNÓSTICO FINAL: WEBHOOK NÃO CHEGA');
  console.log('==========================================\n');

  // 1. Verificar modo do App (Live vs Development)
  console.log('--- 1. INFORMAÇÕES DO APP ---');
  const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${igToken}`);
  const debugData = await debugRes.json();
  
  if (debugData.data) {
    const d = debugData.data;
    console.log(`  App ID: ${d.app_id}`);
    console.log(`  Tipo do token: ${d.type}`);
    console.log(`  User ID: ${d.user_id}`);
    console.log(`  Válido: ${d.is_valid}`);
    console.log(`  Permissões: ${(d.scopes || []).join(', ')}`);
    
    // Verificar informações do app
    const appRes = await fetch(`https://graph.facebook.com/v21.0/${d.app_id}?fields=name,category,link&access_token=${igToken}`);
    const appData = await appRes.json();
    console.log(`  App Name: ${appData.name || 'N/A'}`);
    console.log(`  App Link: ${appData.link || 'N/A'}`);
  }

  // 2. Buscar IG Business Account e verificar posts recentes
  console.log('\n--- 2. VERIFICANDO POSTS RECENTES NO INSTAGRAM ---');
  const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${igToken}`);
  const accountsData = await accountsRes.json();
  const page = accountsData.data?.[0];
  
  if (!page) {
    console.log('❌ Nenhuma página encontrada.');
    return;
  }

  const pageToken = page.access_token;
  const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${pageToken}`);
  const igData = await igRes.json();
  const igBusinessId = igData.instagram_business_account?.id;
  
  console.log(`IG Business ID: ${igBusinessId}`);

  // Buscar posts recentes do Instagram
  const mediaRes = await fetch(
    `https://graph.facebook.com/v21.0/${igBusinessId}/media?fields=id,caption,timestamp,comments_count,media_type&limit=5&access_token=${igToken}`
  );
  const mediaData = await mediaRes.json();
  
  if (mediaData.data) {
    console.log(`\nPosts recentes no Instagram:`);
    for (const media of mediaData.data) {
      console.log(`  📸 ID: ${media.id} | Tipo: ${media.media_type} | Comentários: ${media.comments_count || 0} | Data: ${media.timestamp}`);
      console.log(`     Caption: ${(media.caption || '').slice(0, 80)}...`);
      
      // Se tem comentários, listar os últimos
      if (media.comments_count && media.comments_count > 0) {
        const commRes = await fetch(
          `https://graph.facebook.com/v21.0/${media.id}/comments?fields=id,text,from,timestamp&limit=3&access_token=${igToken}`
        );
        const commData = await commRes.json();
        
        if (commData.data && commData.data.length > 0) {
          for (const comment of commData.data) {
            const username = comment.from?.username || comment.from?.id || 'unknown';
            console.log(`     💬 "${comment.text}" — @${username} (ID: ${comment.id})`);
          }
        }
      }
    }
  } else {
    console.log('❌ Erro ao buscar posts:', JSON.stringify(mediaData));
  }

  // 3. Verificar App Webhook Subscriptions (nível do App)
  console.log('\n--- 3. VERIFICANDO APP WEBHOOK SUBSCRIPTIONS ---');
  console.log('ℹ️  As subscriptions a nível de App só podem ser verificadas no Meta App Dashboard.');
  console.log('   URL: https://developers.facebook.com/apps/' + (debugData.data?.app_id || 'SEU_APP_ID') + '/webhooks/');
  console.log('');
  console.log('   Verificações necessárias no Dashboard:');
  console.log('   1. O webhook URL está configurado como: https://caca-oferta-oficial.vercel.app/api/webhooks/instagram');
  console.log('   2. O Verify Token é: ' + env['META_WEBHOOK_VERIFY_TOKEN']);
  console.log('   3. No produto "Instagram" > Webhooks:');
  console.log('      - O campo "comments" deve estar marcado (subscribed)');
  console.log('   4. O App deve estar em modo "Live" (não Development)');
  console.log('      - Em modo Development, webhooks SÓ são enviados para admins/desenvolvedores do app');

  // 4. Verificar se o IG User está inscrito como test user do app
  console.log('\n--- 4. VERIFICANDO WEBHOOK TESTE COM PÁGINA ---');
  
  // Tentar subscrever com campos Instagram-específicos
  console.log('  Tentando POST subscribed_apps com feed na Página...');
  const pageSubRes = await fetch(
    `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=feed&access_token=${pageToken}`,
    { method: 'POST' }
  );
  const pageSubData = await pageSubRes.json();
  console.log(`  Resultado: ${JSON.stringify(pageSubData)}`);

  // 5. Verificar a lista de webhooks subscriptions do app via App token
  console.log('\n--- 5. TENTANDO CONSULTAR APP SUBSCRIPTIONS ---');
  // Isso requer App Access Token (app_id|app_secret), que não temos no .env.local
  // Mas podemos tentar o endpoint
  const appId = debugData.data?.app_id;
  if (appId) {
    const appSubRes = await fetch(
      `https://graph.facebook.com/v21.0/${appId}/subscriptions?access_token=${igToken}`
    );
    const appSubData = await appSubRes.json();
    console.log(`  Status: ${appSubRes.status}`);
    console.log(`  Resposta: ${JSON.stringify(appSubData, null, 2).slice(0, 1000)}`);
    
    if (appSubData.data) {
      for (const sub of appSubData.data) {
        console.log(`\n  Objeto: ${sub.object}`);
        console.log(`  Callback URL: ${sub.callback_url}`);
        console.log(`  Campos ativos: ${sub.active ? '✅' : '❌'}`);
        if (sub.fields) {
          for (const field of sub.fields) {
            console.log(`    - ${field.name}: versão ${field.version}`);
          }
        }
      }
    }
  }

  console.log('\n==========================================');
  console.log(' FIM DO DIAGNÓSTICO FINAL');
  console.log('==========================================\n');
}

main().catch(e => console.error('Erro fatal:', e));
