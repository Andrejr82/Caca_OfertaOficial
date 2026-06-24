import { config } from 'dotenv';
import { resolve } from 'path';

// Carrega as variáveis de ambiente PRIMEIRO, antes de importar qualquer outra coisa
config({ path: resolve(process.cwd(), '.env.local') });

async function runTest() {
  console.log("=== INICIANDO TESTE DO SMART ROUTER (DRY-RUN) ===\n");

  // Imports dinâmicos para evitar hoisting (importação antes do env carregar)
  const { routeOffer } = await import('../src/lib/publish/router');
  const { uploadImageAndGenerateVideo, getOgImageUrl } = await import('../src/lib/cloudinary');
  
  // Simulando uma oferta que a nossa IA raspou da Amazon
  const mockOffer: OfferData = {
    title: 'Monitor Gamer LG UltraGear 24" 144Hz',
    price: 899.00,
    oldPrice: 1499.00,
    discountPercentage: 40,
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', // Imagem de teste
    platform: 'Amazon',
    url: 'https://amazon.com.br/monitor-teste'
  };

  console.log("📦 OFERTA CAPTURADA:");
  console.log(`Produto: ${mockOffer.title}`);
  console.log(`Preço: R$ ${mockOffer.price} (De: R$ ${mockOffer.oldPrice})`);
  console.log(`Desconto: ${mockOffer.discountPercentage}%`);
  console.log(`Plataforma: ${mockOffer.platform}\n`);

  // 1. Passar pelo Roteador
  console.log("🧠 1. ENVIANDO PARA O ROTEADOR INTELIGENTE...");
  const channels = routeOffer(mockOffer);
  console.log(`Canal(is) Decidido(s): [${channels.join(', ')}]\n`);

  // 2. Se for para o Instagram, gerar a arte e o vídeo
  if (channels.includes('INSTAGRAM')) {
    console.log("📸 2. INSTAGRAM DETECTADO: PREPARANDO MÍDIA (CLOUDINARY & VERCEL OG)...");
    
    // a. Gerar URL da Arte Gráfica (Vercel OG)
    const ogImageUrl = getOgImageUrl(
      mockOffer.title,
      `R$ ${mockOffer.price}`,
      `R$ ${mockOffer.oldPrice}`,
      mockOffer.imageUrl,
      mockOffer.platform,
      'http://localhost:3000' // Força usar o seu servidor local ao invés da Vercel
    );
    console.log(`\n✅ ARTE ESTÁTICA PRONTA (Copie e cole no navegador para ver o layout da Amazon):`);
    console.log(ogImageUrl);

    // b. Gerar Vídeo Animado (Cloudinary)
    console.log(`\n🎬 3. GERANDO VÍDEO ANIMADO (REELS) NO CLOUDINARY...`);
    const videoResult = await uploadImageAndGenerateVideo(mockOffer.imageUrl);
    
    if (videoResult.success) {
      console.log(`\n✅ VÍDEO GERADO COM SUCESSO! (Copie e cole no navegador para ver o efeito Ken Burns):`);
      console.log(videoResult.videoUrl);
    } else {
      console.error("❌ ERRO AO GERAR VÍDEO:", videoResult.error);
    }
  }

  // 3. Se for Telegram / WhatsApp
  if (channels.includes('TELEGRAM') || channels.includes('WHATSAPP')) {
    console.log("\n💬 4. CANAIS RÁPIDOS DETECTADOS:");
    console.log(`A IA iria gerar uma copy com gatilhos curtos e disparar via API para o Telegram e WhatsApp com a imagem original.`);
  } else {
     console.log("\n💬 4. CANAIS RÁPIDOS IGNORADOS (Preço acima de R$ 200).");
  }

  console.log("\n=== TESTE FINALIZADO COM SUCESSO ===");
}

runTest();
