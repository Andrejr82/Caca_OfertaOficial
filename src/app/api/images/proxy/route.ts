import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 60; // Limite padrão da Vercel Hobby

export async function GET(request: Request) {
  let originalBuffer: ArrayBuffer | null = null;
  let originalContentType = "image/webp";

  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return new NextResponse("Missing 'url' parameter", { status: 400 });
    }

    let imageRes: Response | null = null;
    let fetchAttempts = 0;
    while (fetchAttempts < 3) {
      try {
        imageRes = await fetch(imageUrl, {
          cache: "no-store",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
          }
        });
        if (imageRes.ok) break; // Sucesso, sai do loop
      } catch (err) {
        console.warn(`[IMAGE PROXY] Falha de rede na tentativa ${fetchAttempts + 1} para ${imageUrl}`);
      }
      fetchAttempts++;
      await new Promise(r => setTimeout(r, 1500)); // Delay antes de retentar
    }

    if (!imageRes || !imageRes.ok) {
      return new NextResponse(`Failed to fetch original image: ${imageRes?.status || "Network Error"}`, { status: 502 });
    }

    originalBuffer = await imageRes.arrayBuffer();
    originalContentType = imageRes.headers.get("content-type") || "image/webp";

    // Retorna a imagem original repassada (Bypass direto)
    // Isso evita completamente o uso do Sharp na Vercel e o Erro 500
    return new NextResponse(originalBuffer, { 
      status: 200, 
      headers: { 
        "Content-Type": originalContentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });

  } catch (error) {
    console.error("[IMAGE PROXY] Falha crítica de rede ou servidor:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
