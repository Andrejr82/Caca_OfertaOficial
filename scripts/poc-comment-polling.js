/**
 * Prova de Conceito: Polling de Comentários via Instagram Graph API
 * 
 * Em vez de depender de webhooks (que exigem App Review para modo Live),
 * fazemos polling periódico nos posts publicados para detectar comentários-gatilho.
 * 
 * Funciona em modo Development, sem App Review, sem configuração extra.
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
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  console.log('\n==========================================');
  console.log(' POC: POLLING DE COMENTÁRIOS');
  console.log('==========================================\n');

  // 1. Buscar IG Business Account
  const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${igToken}`);
  const accountsData = await accountsRes.json();
  const page = accountsData.data?.[0];
  if (!page) { console.log('❌ Nenhuma página.'); return; }

  const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${igToken}`);
  const igData = await igRes.json();
  const igBusinessId = igData.instagram_business_account?.id;
  console.log(`IG Business Account: ${igBusinessId}`);

  // 2. Buscar posts publicados no Supabase com external_id
  const postsRes = await fetch(
    `${supabaseUrl}/rest/v1/posts?channel=eq.instagram&status=eq.published&external_id=not.is.null&order=posted_at.desc&limit=10&select=id,external_id,offer_id`,
    { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
  );
  const posts = await postsRes.json();
  console.log(`Posts publicados com external_id: ${posts.length}\n`);

  const triggers = ["quero", "link", "eu quero", "manda", "comprar"];
  let totalNewTriggers = 0;

  for (const post of posts) {
    const mediaId = post.external_id;
    
    // 3. Buscar comentários deste post via Graph API
    const commRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}/comments?fields=id,text,from{id,username},timestamp&limit=50&access_token=${igToken}`
    );
    const commData = await commRes.json();
    
    if (commData.error) {
      console.log(`  ❌ Erro ao buscar comments do media ${mediaId}: ${commData.error.message}`);
      continue;
    }
    
    const comments = commData.data || [];
    if (comments.length === 0) continue;

    console.log(`📸 Media ${mediaId} → ${comments.length} comentários`);
    
    for (const comment of comments) {
      const text = (comment.text || '').toLowerCase();
      const fromId = comment.from?.id;
      const fromUsername = comment.from?.username || 'unknown';
      
      // Ignorar comentários do próprio perfil
      if (fromId === igBusinessId) continue;
      
      // Verificar se é um gatilho
      const isTrigger = triggers.some(t => text.includes(t));
      if (!isTrigger) continue;

      // Verificar se já foi processado (buscar no Supabase integration_logs)
      const logRes = await fetch(
        `${supabaseUrl}/rest/v1/integration_logs?integration=eq.instagram_comment_reply&action=eq.${comment.id}&limit=1`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const logData = await logRes.json();
      
      if (Array.isArray(logData) && logData.length > 0) {
        console.log(`  ⏭️  "${text}" por @${fromUsername} → já processado`);
        continue;
      }

      totalNewTriggers++;
      console.log(`  🆕 GATILHO NOVO! "${text}" por @${fromUsername} | comment_id: ${comment.id}`);
      console.log(`     → Pode enviar Private Reply para este comentário!`);
      
      // 4. Buscar affiliate_link para este post
      const linkRes = await fetch(
        `${supabaseUrl}/rest/v1/affiliate_links?offer_id=eq.${post.offer_id}&channel=eq.instagram&limit=1`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const linkData = await linkRes.json();
      
      if (Array.isArray(linkData) && linkData.length > 0) {
        const link = linkData[0];
        console.log(`     → Link disponível: ${link.tracked_url}`);
        
        // 5. SIMULAR envio de Private Reply (não vamos enviar de verdade nesta POC)
        console.log(`     → Private Reply seria: POST https://graph.facebook.com/v21.0/${igBusinessId}/messages`);
        console.log(`       { recipient: { comment_id: "${comment.id}" }, message: { text: "..." } }`);
      } else {
        console.log(`     ⚠️  Sem affiliate_link para offer_id ${post.offer_id}`);
      }
    }
  }

  console.log(`\n==========================================`);
  console.log(` RESULTADO: ${totalNewTriggers} gatilhos novos encontrados`);
  console.log(`==========================================`);
  console.log(`\nSe ${totalNewTriggers} > 0, a abordagem de POLLING FUNCIONA!`);
  console.log(`Pode ser implementada como Vercel Cron Job rodando a cada 1-2 minutos.`);
}

main().catch(e => console.error('Erro fatal:', e));
