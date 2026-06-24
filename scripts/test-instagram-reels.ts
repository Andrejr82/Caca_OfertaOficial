import { publishVideoToInstagram } from '../src/lib/instagram/client';
import { config } from 'dotenv';
import { resolve } from 'path';

// Carrega as variáveis de ambiente PRIMEIRO
config({ path: resolve(process.cwd(), '.env.local') });

async function runInstagramTest() {
  console.log("=== INICIANDO TESTE REAL DE PUBLICAÇÃO DE REELS NO INSTAGRAM ===");
  
  // Usaremos o último vídeo gerado pelo Cloudinary com duração estática de 5s
  const videoUrl = "https://res.cloudinary.com/dr8uatjpf/image/upload/c_fill,g_center,h_1280,w_720/du_5/v1782264317/lzp9jzw8mprt8tzqwk33.mp4";
  const caption = "🎥 TESTE DE INTEGRAÇÃO (REELS)\n\nEste é um teste técnico automatizado de publicação de vídeo direto do sistema Caça Oferta.\n\nPreço: R$ 899\nDesconto: 40%\n\n#teste #dev";

  console.log("🎬 Enviando vídeo para o Instagram:");
  console.log("URL:", videoUrl);

  try {
    const postId = await publishVideoToInstagram(videoUrl, caption);
    console.log("\n✅ SUCESSO ABSOLUTO! O Reels foi postado.");
    console.log(`Abra o seu aplicativo do Instagram para conferir a postagem! ID: ${postId}`);
  } catch (error) {
    console.error("\n❌ FALHA AO PUBLICAR NO INSTAGRAM:");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
  }
}

runInstagramTest();
