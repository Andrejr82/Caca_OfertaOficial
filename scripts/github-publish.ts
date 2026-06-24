import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';

// Polyfill de WebSocket para o Supabase Client rodar no Node.js
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

// Importa a função de publicação original
import { publishVideoToInstagram } from '../src/lib/instagram/client';

async function main() {
  console.log('🚀 Iniciando GitHub Action: Renderização e Publicação do Reel...');

  // 1. Pegar as variáveis de entrada injetadas pelo Workflow
  const postId = process.env.INPUT_POST_ID!;
  const offerId = process.env.INPUT_OFFER_ID!;
  const productName = process.env.INPUT_PRODUCT_NAME!;
  const originalPrice = process.env.INPUT_ORIGINAL_PRICE || '';
  const currentPrice = process.env.INPUT_CURRENT_PRICE!;
  const imageUrl = process.env.INPUT_IMAGE_URL!;
  const caption = process.env.INPUT_CAPTION!;

  // Validação básica
  if (!postId || !offerId || !productName || !currentPrice || !imageUrl) {
    throw new Error('Variáveis de entrada obrigatórias estão faltando.');
  }

  // 2. Criar arquivo de Props para o Remotion ler
  const props = {
    productName,
    originalPrice,
    currentPrice,
    imageUrl
  };
  const propsPath = path.resolve('props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props));
  console.log('✅ Props preparadas para o Remotion.');

  // 3. Renderizar o Vídeo
  console.log('🎥 Iniciando renderização do vídeo com Remotion...');
  // O Remotion vai criar o arquivo "out.mp4" na raiz do projeto
  execSync(`npx remotion render src/remotion/index.ts InstagramReel out.mp4 --props=${propsPath}`, { stdio: 'inherit' });
  console.log('✅ Vídeo renderizado com sucesso.');

  // 4. Fazer o Upload para o Supabase Storage (para o Instagram conseguir baixar)
  console.log('☁️ Fazendo upload do vídeo para o Supabase Storage...');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Garantir que o bucket "reels" exista e seja público
  await supabase.storage.createBucket('reels', { public: true }).catch(() => {});

  const videoBuffer = fs.readFileSync('out.mp4');
  const fileName = `reel_${Date.now()}_${postId}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from('reels')
    .upload(fileName, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Falha ao fazer upload para o Supabase: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from('reels').getPublicUrl(fileName);
  const videoPublicUrl = publicUrlData.publicUrl;
  console.log(`✅ Vídeo disponível publicamente em: ${videoPublicUrl}`);

  // 5. Publicar no Instagram (usando o mesmo código da Vercel)
  console.log('📱 Enviando comando de publicação para a API do Instagram...');
  let externalId: string;
  try {
    externalId = await publishVideoToInstagram(videoPublicUrl, caption);
    console.log(`✅ Reel publicado com sucesso no Instagram! External ID: ${externalId}`);
  } catch (err: any) {
    throw new Error(`Falha ao publicar no Instagram: ${err.message}`);
  }

  // 6. Atualizar o Banco de Dados (Status: Published)
  console.log('💾 Atualizando status no banco de dados...');
  const now = new Date().toISOString();
  
  await supabase
    .from('posts')
    .update({
      status: 'published',
      external_id: externalId,
      posted_at: now
    })
    .eq('id', postId);

  await supabase
    .from('offers')
    .update({
      status: 'posted',
      updated_at: now
    })
    .eq('id', offerId);

  console.log('🎉 Processo 100% concluído! O vídeo está no ar.');
}

main().catch(error => {
  console.error('❌ ERRO CRÍTICO NO WORKFLOW:', error);
  process.exit(1);
});
