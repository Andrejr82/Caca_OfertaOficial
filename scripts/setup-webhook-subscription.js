/**
 * Script para inscrever o App nos Webhooks de Instagram Comments
 * 
 * REQUER: META_APP_SECRET no .env.local
 * 
 * O que este script faz:
 * 1. Gera um App Access Token (app_id|app_secret)
 * 2. Verifica se há webhook subscriptions configuradas
 * 3. Cria/atualiza a subscription para o objeto "instagram" com campo "comments"
 * 4. Verifica o resultado final
 * 
 * ALTERNATIVA (sem script): 
 *   Vá ao Meta Developer Dashboard:
 *   https://developers.facebook.com/apps/1458377592978045/webhooks/
 *   E configure manualmente (instruções no plano de implementação)
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
  const callbackUrl = `${appUrl}/api/webhooks/instagram`;

  console.log('\n==========================================');
  console.log(' CONFIGURAR WEBHOOK SUBSCRIPTION');
  console.log('==========================================\n');

  if (!appSecret) {
    console.log('❌ META_APP_SECRET não encontrado no .env.local!');
    console.log('');
    console.log('Para usar este script, adicione ao .env.local:');
    console.log('  META_APP_SECRET=seu_app_secret_aqui');
    console.log('');
    console.log('Você encontra o App Secret em:');
    console.log('  https://developers.facebook.com/apps/1458377592978045/settings/basic/');
    console.log('  > Campo "Chave Secreta do Aplicativo" (App Secret)');
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' ALTERNATIVA: Configurar manualmente');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('1. Acesse: https://developers.facebook.com/apps/1458377592978045/instagram-api/settings/');
    console.log('');
    console.log('2. Na seção "Webhooks", clique "Configurar" (ou "Edit callback URL")');
    console.log('');
    console.log('3. Configure:');
    console.log(`   Callback URL: ${callbackUrl}`);
    console.log(`   Verify Token: ${verifyToken}`);
    console.log('');
    console.log('4. Clique em "Verificar e Salvar"');
    console.log('');
    console.log('5. Na lista de campos, marque (subscribe) o campo "comments"');
    console.log('   (e "messages" se quiser receber DMs também)');
    console.log('');
    console.log('6. IMPORTANTE: Verifique se o App está em modo "Live"');
    console.log('   (Em modo Development, webhooks só chegam para admins do app)');
    console.log('');
    console.log('7. ALTERNATIVA ao passo 2-4: Pode também ir em');
    console.log('   https://developers.facebook.com/apps/1458377592978045/webhooks/');
    console.log('   e adicionar uma subscription para o objeto "instagram"');
    console.log('   com os mesmos callback URL e verify token.');
    return;
  }

  const APP_ID = '1458377592978045';
  const appAccessToken = `${APP_ID}|${appSecret}`;

  // 1. Verificar subscriptions atuais
  console.log('--- 1. VERIFICANDO SUBSCRIPTIONS ATUAIS ---');
  const subsRes = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions?access_token=${appAccessToken}`
  );
  const subsData = await subsRes.json();

  if (subsData.error) {
    console.log('❌ Erro ao verificar subscriptions:', subsData.error.message);
    if (subsData.error.message.includes('Secret')) {
      console.log('   O App Secret está incorreto. Verifique no Dashboard.');
    }
    return;
  }

  const subs = subsData.data || [];
  console.log(`Subscriptions encontradas: ${subs.length}`);
  for (const sub of subs) {
    console.log(`  Objeto: ${sub.object}`);
    console.log(`  Callback: ${sub.callback_url}`);
    console.log(`  Ativo: ${sub.active}`);
    if (sub.fields) {
      console.log(`  Campos: ${sub.fields.map(f => f.name).join(', ')}`);
    }
  }

  const hasInstagram = subs.some(s => s.object === 'instagram');
  const hasComments = subs.some(s => 
    s.object === 'instagram' && 
    s.fields?.some(f => f.name === 'comments')
  );

  if (hasComments) {
    console.log('\n✅ Já existe subscription para instagram/comments!');
    console.log('   Se mesmo assim não recebe webhooks, verifique:');
    console.log('   - O app está em modo Live?');
    console.log('   - A página está inscrita? (page subscribed_apps)');
    return;
  }

  // 2. Criar/atualizar subscription
  console.log('\n--- 2. CRIANDO SUBSCRIPTION PARA INSTAGRAM COMMENTS ---');
  console.log(`  Callback URL: ${callbackUrl}`);
  console.log(`  Verify Token: ${verifyToken}`);

  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        object: 'instagram',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: 'comments,messages',
        access_token: appAccessToken,
        include_values: 'true'
      })
    }
  );

  const createData = await createRes.json();
  console.log(`  Status: ${createRes.status}`);
  console.log(`  Resposta: ${JSON.stringify(createData)}`);

  if (createData.success) {
    console.log('\n  ✅ SUCESSO! Webhook subscription criada para instagram/comments!');
  } else {
    console.log('\n  ❌ Falha ao criar subscription:', createData.error?.message || 'Desconhecido');
    return;
  }

  // 3. Verificar resultado
  console.log('\n--- 3. VERIFICANDO RESULTADO FINAL ---');
  const finalRes = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions?access_token=${appAccessToken}`
  );
  const finalData = await finalRes.json();
  
  for (const sub of (finalData.data || [])) {
    if (sub.object === 'instagram') {
      console.log(`  ✅ Objeto: ${sub.object}`);
      console.log(`  Callback: ${sub.callback_url}`);
      console.log(`  Campos: ${sub.fields?.map(f => f.name).join(', ')}`);
    }
  }

  console.log('\n==========================================');
  console.log(' PRÓXIMOS PASSOS');
  console.log('==========================================');
  console.log('');
  console.log('1. Se criou a subscription com sucesso, agora precisa garantir');
  console.log('   que a PÁGINA está inscrita (page subscribed_apps).');
  console.log('   Rode: node scripts/diagnose-webhook.js');
  console.log('');
  console.log('2. Teste fazendo um comentário "quero" em qualquer post.');
  console.log('   Verifique o Telegram para logs de debug.');
  console.log('');
}

main().catch(e => console.error('Erro fatal:', e));
