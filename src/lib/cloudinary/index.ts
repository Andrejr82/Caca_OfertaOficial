import { v2 as cloudinary } from 'cloudinary';

// Configura o SDK com as variáveis de ambiente (garante que não falhe se as vars não existirem no lado do cliente)
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Faz o upload de uma imagem externa para o Cloudinary e gera um vídeo
 * aplicando o efeito Ken Burns (Zoom/Pan). Ideal para Reels e Shorts.
 */
export async function uploadImageAndGenerateVideo(
  imageUrl: string,
  folder: string = 'ofertas_videos'
) {
  try {
    // 1. Faz o upload da imagem original e pede para o Cloudinary processar o vídeo na mesma hora (Eager)
    const uploadResult = await cloudinary.uploader.upload(imageUrl, {
      folder,
      resource_type: 'image',
      eager: [
        { 
          format: 'mp4',
          transformation: [
            { width: 1080, height: 1920, crop: 'pad', background: 'blurred:400' }, // 1º Encaixa a imagem inteira com fundo desfocado no formato HD Vertical (Reels)
            { effect: 'zoompan' }, // 2º Aplica animação Ken Burns para criar um vídeo real (Instagram pode rejeitar se for 100% estático)
            { duration: 5 } // 3º Limita o vídeo a exatos 5 segundos
          ]
        }
      ],
      eager_async: false // Espera o vídeo ficar pronto antes de responder
    });

    // 2. Extrai a URL do vídeo que foi gerado na fila de eager
    const videoUrl = uploadResult.eager && uploadResult.eager.length > 0 
      ? uploadResult.eager[0].secure_url 
      : cloudinary.url(uploadResult.public_id, { resource_type: 'image', format: 'mp4', transformation: [{ width: 1080, height: 1920, crop: 'pad', background: 'blurred:400' }, { effect: 'zoompan' }, { duration: 5 }] });

    return {
      success: true,
      publicId: uploadResult.public_id,
      originalImageUrl: uploadResult.secure_url,
      videoUrl: videoUrl, // URL pronta para ser postada no Instagram Reels
    };
  } catch (error: any) {
    console.error('[Cloudinary] Erro na geração do vídeo:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper para construir a URL dinâmica do Vercel OG que criamos no Passo 1.
 * Isso garante que todas as URLs da imagem fiquem centralizadas na mesma lógica.
 */
export function getOgImageUrl(
  title: string,
  price: string,
  oldPrice: string | null,
  imageUrl: string,
  platform: string,
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
) {
  const url = new URL('/api/og', baseUrl);
  url.searchParams.set('title', title);
  url.searchParams.set('price', price);
  if (oldPrice) url.searchParams.set('oldPrice', oldPrice);
  url.searchParams.set('imageUrl', imageUrl);
  url.searchParams.set('platform', platform);
  
  return url.toString();
}

export default cloudinary;
