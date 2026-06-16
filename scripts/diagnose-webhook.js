/**
 * Diagnóstico Completo do Webhook Instagram
 * 
 * Verifica:
 * 1. Posts no Supabase com external_id preenchido
 * 2. Affiliate links vinculados
 * 3. Token do Instagram válido + Business Account ID
 * 4. Subscribed Apps (se o app está inscrito para webhooks)
 * 5. Webhook verification endpoint (GET) na Vercel
 */

const fs = require('fs');

// --- Carrega .env.local ---
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
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  const igToken = env['INSTAGRAM_ACCESS_TOKEN'];
  const verifyToken = env['META_WEBHOOK_VERIFY_TOKEN'];
  const appUrl = env['NEXT_PUBLIC_APP_URL'];

  console.log('\n==========================================');
  console.log(' DIAGNÓSTICO WEBHOOK INSTAGRAM');
  console.log('==========================================\n');

  // ---- 1. Verificar Token do Instagram ----
  console.log('--- 1. VERIFICANDO TOKEN DO INSTAGRAM ---');
  if (!igToken) {
    console.log('❌ INSTAGRAM_ACCESS_TOKEN está vazio!');
    return;
  }
  console.log(`Token: ${igToken.slice(0, 20)}...${igToken.slice(-10)}`);

  // Testar token com /me
  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${igToken}`);
    const meData = await meRes.json();
    if (meData.error) {
      console.log('❌ Token INVÁLIDO:', meData.error.message);
      console.log('   Tipo do erro:', meData.error.type, '| Código:', meData.error.code);
      if (meData.error.code === 190) {
        console.log('   ⚠️  O token EXPIROU. Você precisa gerar um novo no Meta Developer Dashboard.');
      }
      return;
    }
    console.log('✅ Token válido! Usuário:', meData.name, '| ID:', meData.id);
  } catch (e) {
    console.log('❌ Erro de rede ao testar token:', e.message);
    return;
  }

  // ---- 2. Descobrir Instagram Business Account ID ----
  console.log('\n--- 2. DESCOBRINDO INSTAGRAM BUSINESS ACCOUNT ---');
  let igBusinessId = env['INSTAGRAM_BUSINESS_ACCOUNT_ID'];
  
  try {
    const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${igToken}`);
    const accountsData = await accountsRes.json();
    
    if (accountsData.error) {
      console.log('❌ Erro ao buscar páginas:', accountsData.error.message);
    } else {
      const pages = accountsData.data || [];
      console.log(`Páginas encontradas: ${pages.length}`);
      
      for (const page of pages) {
        console.log(`  📄 Página: "${page.name}" (ID: ${page.id})`);
        
        // Busca IG Business Account vinculada
        const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${igToken}`);
        const igData = await igRes.json();
        
        if (igData.instagram_business_account) {
          igBusinessId = igData.instagram_business_account.id;
          console.log(`  ✅ Instagram Business Account: ${igBusinessId}`);
          
          // Busca username
          const usernameRes = await fetch(`https://graph.facebook.com/v21.0/${igBusinessId}?fields=username,name&access_token=${igToken}`);
          const usernameData = await usernameRes.json();
          if (usernameData.username) {
            console.log(`  ✅ Username: @${usernameData.username}`);
          }
        } else {
          console.log(`  ⚠️  Sem Instagram Business vinculado`);
        }

        // ---- 3. Verificar subscribed_apps (Webhook Subscriptions) ----
        console.log('\n--- 3. VERIFICANDO WEBHOOK SUBSCRIPTIONS ---');
        const subRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?access_token=${page.access_token || igToken}`);
        const subData = await subRes.json();
        
        if (subData.error) {
          console.log('❌ Erro ao verificar subscriptions:', subData.error.message);
        } else {
          const subs = subData.data || [];
          if (subs.length === 0) {
            console.log('❌ NENHUM APP INSCRITO PARA WEBHOOKS NESTA PÁGINA!');
            console.log('   ⚠️  ESTA É PROVAVELMENTE A CAUSA RAIZ DO PROBLEMA!');
            console.log('   O Meta não vai enviar nenhum evento webhook porque o app não está inscrito.');
          } else {
            for (const sub of subs) {
              console.log(`  App: ${sub.name || sub.id}`);
              console.log(`  Campos inscritos: ${(sub.subscribed_fields || []).join(', ')}`);
              
              const hasComments = (sub.subscribed_fields || []).includes('feed');
              if (!hasComments) {
                console.log('  ⚠️  Campo "feed" NÃO está inscrito (necessário para comentários via Facebook Login)');
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('❌ Erro de rede:', e.message);
  }

  // ---- 4. Verificar Webhook Verification Endpoint ----
  console.log('\n--- 4. TESTANDO WEBHOOK VERIFICATION (GET) ---');
  const webhookUrl = `${appUrl}/api/webhooks/instagram`;
  const testChallenge = 'test_challenge_12345';
  const verifyUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${testChallenge}`;
  
  console.log(`URL: ${webhookUrl}`);
  try {
    const verifyRes = await fetch(verifyUrl);
    const verifyText = await verifyRes.text();
    
    if (verifyRes.status === 200 && verifyText === testChallenge) {
      console.log('✅ Webhook verification OK! Endpoint responde corretamente.');
    } else {
      console.log(`❌ Webhook verification FALHOU! Status: ${verifyRes.status}, Body: ${verifyText.slice(0, 200)}`);
    }
  } catch (e) {
    console.log('❌ Erro de rede ao testar endpoint:', e.message);
  }

  // ---- 5. Testar Webhook POST (simular evento) ----
  console.log('\n--- 5. TESTANDO WEBHOOK POST (SIMULAÇÃO) ---');
  const testPayload = {
    object: "instagram",
    entry: [{
      id: igBusinessId || "unknown",
      time: Date.now(),
      changes: [{
        field: "comments",
        value: {
          comment_id: "test_comment_diag_001",
          id: "test_comment_diag_001",
          text: "quero",
          from: { id: "test_user_diag_001", username: "diagnostico_test" },
          media: { id: "test_media_diag_001" }
        }
      }]
    }]
  };

  try {
    const postRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload)
    });
    const postText = await postRes.text();
    console.log(`Status: ${postRes.status} | Body: ${postText}`);
    
    if (postRes.status === 200) {
      console.log('✅ Webhook POST processado. Verifique o Telegram para a mensagem de debug.');
    } else {
      console.log('❌ Webhook POST falhou!');
    }
  } catch (e) {
    console.log('❌ Erro de rede:', e.message);
  }

  // ---- 6. Verificar Posts no Supabase ----
  console.log('\n--- 6. VERIFICANDO POSTS NO SUPABASE ---');
  try {
    const postsRes = await fetch(
      `${supabaseUrl}/rest/v1/posts?channel=eq.instagram&order=created_at.desc&limit=10&select=id,channel,status,external_id,posted_at,offer_id`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const posts = await postsRes.json();
    
    if (!Array.isArray(posts) || posts.length === 0) {
      console.log('⚠️  Nenhum post do Instagram encontrado no banco.');
    } else {
      console.log(`Posts encontrados: ${posts.length}`);
      for (const p of posts) {
        const hasExtId = p.external_id ? '✅' : '❌';
        console.log(`  ${hasExtId} Post ${p.id.slice(0,8)}... | external_id: ${p.external_id || 'VAZIO'} | status: ${p.status} | posted_at: ${p.posted_at || 'null'}`);
      }
      
      // Verificar affiliate_links para o primeiro post com external_id
      const postWithExtId = posts.find(p => p.external_id);
      if (postWithExtId) {
        console.log(`\n  Verificando affiliate_link para offer_id: ${postWithExtId.offer_id}...`);
        const linkRes = await fetch(
          `${supabaseUrl}/rest/v1/affiliate_links?offer_id=eq.${postWithExtId.offer_id}&channel=eq.instagram&select=id,sub_id,original_url,tracked_url`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const links = await linkRes.json();
        if (Array.isArray(links) && links.length > 0) {
          console.log(`  ✅ Affiliate link encontrado: ${links[0].tracked_url}`);
        } else {
          console.log('  ❌ Nenhum affiliate_link encontrado para este post!');
        }
      }
    }
  } catch (e) {
    console.log('❌ Erro ao consultar Supabase:', e.message);
  }

  // ---- 7. Verificar se IG Business Account tem webhook subscription via Instagram API ----
  if (igBusinessId) {
    console.log('\n--- 7. VERIFICANDO SUBSCRIPTION VIA INSTAGRAM GRAPH API ---');
    try {
      // Tentar inscrever o app para receber webhooks de comments
      // GET /<ig-user-id>/subscribed_apps não existe para IG, apenas para Pages
      // Vamos verificar as permissões do token
      const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${igToken}`);
      const debugData = await debugRes.json();
      
      if (debugData.data) {
        const tokenData = debugData.data;
        console.log(`  App ID: ${tokenData.app_id}`);
        console.log(`  Tipo: ${tokenData.type}`);
        console.log(`  Válido: ${tokenData.is_valid ? '✅' : '❌'}`);
        
        if (tokenData.expires_at) {
          const expiresDate = new Date(tokenData.expires_at * 1000);
          const now = new Date();
          if (expiresDate < now) {
            console.log(`  ❌ Token EXPIRADO em: ${expiresDate.toISOString()}`);
          } else {
            console.log(`  ✅ Expira em: ${expiresDate.toISOString()}`);
          }
        } else {
          console.log('  ℹ️  Token sem expiração definida (possivelmente never-expire)');
        }

        const scopes = tokenData.scopes || [];
        console.log(`  Permissões: ${scopes.join(', ')}`);
        
        // Verificar permissões críticas
        const criticalPerms = ['instagram_manage_comments', 'instagram_manage_messages', 'instagram_basic', 'pages_manage_metadata'];
        for (const perm of criticalPerms) {
          const has = scopes.includes(perm);
          console.log(`    ${has ? '✅' : '❌'} ${perm}`);
        }

        if (!scopes.includes('pages_manage_metadata')) {
          console.log('\n  ⚠️  ATENÇÃO: A permissão "pages_manage_metadata" é necessária para');
          console.log('     inscrever o app nos webhooks da página (subscribed_apps).');
        }
        if (!scopes.includes('instagram_manage_comments')) {
          console.log('\n  ⚠️  ATENÇÃO: A permissão "instagram_manage_comments" é necessária');
          console.log('     para receber webhooks de comentários do Instagram.');
        }
        if (!scopes.includes('instagram_manage_messages')) {
          console.log('\n  ⚠️  ATENÇÃO: A permissão "instagram_manage_messages" é necessária');
          console.log('     para enviar Private Replies (DMs) no Instagram.');
        }
      }
    } catch (e) {
      console.log('❌ Erro ao verificar token:', e.message);
    }
  }

  console.log('\n==========================================');
  console.log(' FIM DO DIAGNÓSTICO');
  console.log('==========================================\n');
}

main().catch(e => console.error('Erro fatal:', e));
