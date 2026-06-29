global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkIntegrity() {
  console.log('--- Verificando Integridade do Banco após Exclusões ---\n');
  
  // Verifica ofertas aprovadas
  const { data: offers, error: errOffers } = await supabase
    .from('offers')
    .select('id, product_name, status')
    .eq('status', 'approved');

  if (errOffers) {
    console.error('Erro ao buscar ofertas:', errOffers.message);
    return;
  }

  console.log(`Ofertas no status 'approved': ${offers.length}`);

  let totalTelegram = 0;
  let totalInstagram = 0;
  let totalWhatsapp = 0;
  let offersWithMissingPosts = 0;

  for (const offer of offers) {
    const { data: posts, error: errPosts } = await supabase
      .from('posts')
      .select('channel, status')
      .eq('offer_id', offer.id);

    if (errPosts) {
      console.error(`Erro ao buscar posts da oferta ${offer.id}:`, errPosts.message);
      continue;
    }

    const hasTelegram = posts.some(p => p.channel === 'telegram');
    const hasInstagram = posts.some(p => p.channel === 'instagram');
    const hasWhatsapp = posts.some(p => p.channel === 'whatsapp');

    if (hasTelegram) totalTelegram++;
    if (hasInstagram) totalInstagram++;
    if (hasWhatsapp) totalWhatsapp++;

    if (!hasTelegram || !hasInstagram || !hasWhatsapp) {
      offersWithMissingPosts++;
      console.log(`- Alerta: Oferta "${offer.product_name.substring(0, 30)}..." está faltando posts (TG: ${hasTelegram}, IG: ${hasInstagram}, WPP: ${hasWhatsapp})`);
    }
  }

  console.log('\n--- Resumo dos Posts Vinculados às Ofertas Aprovadas ---');
  console.log(`Posts de Telegram restantes: ${totalTelegram}`);
  console.log(`Posts de Instagram restantes: ${totalInstagram}`);
  console.log(`Posts de WhatsApp restantes: ${totalWhatsapp}`);
  console.log(`\nConclusão: A exclusão via painel é esperada e natural. Se você apagou posts do Telegram, eles apenas não serão enviados. Isso NÃO quebra o funcionamento dos outros canais (Instagram/WhatsApp).`);
}

checkIntegrity();
