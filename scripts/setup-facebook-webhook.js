/**
 * Script para inscrever o App nos Webhooks de Feed do Facebook (Páginas)
 * 
 * REQUER: META_APP_SECRET no .env.local
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
  const appSecret = env['META_APP_SECRET'];
  const verifyToken = env['META_WEBHOOK_VERIFY_TOKEN'];
  const appUrl = env['NEXT_PUBLIC_APP_URL'];
  const callbackUrl = `${appUrl}/api/webhooks/facebook`;
  const APP_ID = '1458377592978045'; // O App ID da sua conta
  const pageId = env['FACEBOOK_PAGE_ID'];
  const pageToken = env['FACEBOOK_ACCESS_TOKEN'];

  console.log('\n======================================================');
  console.log(' CONFIGURAR WEBHOOK SUBSCRIPTION (FACEBOOK PAGE FEED)');
  console.log('======================================================\n');

  if (!appSecret) {
    console.log('❌ META_APP_SECRET não encontrado no .env.local!');
    return;
  }

  const appAccessToken = `${APP_ID}|${appSecret}`;

  // 1. Criar/atualizar subscription no nível do Aplicativo
  console.log('--- 1. CRIANDO SUBSCRIPTION PARA PAGE FEED ---');
  console.log(`  Callback URL: ${callbackUrl}`);
  console.log(`  Verify Token: ${verifyToken}`);

  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        object: 'page',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: 'feed',
        access_token: appAccessToken,
        include_values: 'true'
      })
    }
  );

  const createData = await createRes.json();
  if (createData.success) {
    console.log('\n  ✅ SUCESSO! Webhook subscription criada para page/feed!');
  } else {
    console.log('\n  ❌ Falha ao criar subscription no App:', createData.error?.message || 'Desconhecido');
    return;
  }

  // 2. Inscrever a Página no Aplicativo (subscribed_apps)
  console.log('\n--- 2. INSCREVENDO A PÁGINA ESPECÍFICA NO APP ---');
  if (!pageId || !pageToken) {
    console.log('  ❌ FACEBOOK_PAGE_ID ou FACEBOOK_ACCESS_TOKEN ausentes. Não foi possível inscrever a página.');
    return;
  }

  const pageSubRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: 'feed',
        access_token: pageToken
      })
    }
  );

  const pageSubData = await pageSubRes.json();
  if (pageSubData.success) {
    console.log(`  ✅ SUCESSO! A Página ${pageId} agora está inscrita para enviar eventos "feed" ao seu App!`);
  } else {
    console.log(`  ❌ Falha ao inscrever a Página:`, pageSubData.error?.message || 'Desconhecido');
  }

  console.log('\n======================================================');
  console.log(' CONFIGURAÇÃO CONCLUÍDA!');
  console.log('======================================================\n');
}

main().catch(e => console.error('Erro fatal:', e));
