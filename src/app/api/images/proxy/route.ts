import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 60; // Limite padrão da Vercel Hobby

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return new NextResponse("Missing 'url' parameter", { status: 400 });
    }

    // 1. Baixa a imagem original (da Amazon, Shopee, etc.)
    const imageRes = await fetch(imageUrl, {
      // Ignora cache para garantir imagem sempre fresca
      cache: "no-store",
      headers: {
        // Simula um navegador básico para evitar bloqueios simples
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!imageRes.ok) {
      return new NextResponse(`Failed to fetch original image: ${imageRes.status}`, { status: 502 });
    }

    const imageBuffer = await imageRes.arrayBuffer();

    // 2. Processa a imagem usando o sharp
    // Redimensiona para um quadrado perfeito de 1080x1080 (Padrão Feed Instagram)
    // Se a imagem for fina ou larga, o `fit: 'contain'` preenche o restante com o `background` (branco)
    const processedImage = await sharp(Buffer.from(imageBuffer))
      .resize({
        width: 1080,
        height: 1080,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 } // Fundo Branco
      })
      .jpeg({ quality: 90 }) // Garante que a saída seja sempre um JPEG leve
      .toBuffer();

    // 3. Retorna a imagem formatada com os headers corretos para enganar os robôs do Facebook
    return new NextResponse(processedImage, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        // É importante NÃO enviar headers que indiquem bloqueio
      }
    });

  } catch (error) {
    console.error("[IMAGE PROXY] Erro ao processar imagem:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
