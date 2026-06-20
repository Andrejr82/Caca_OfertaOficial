import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

export const runtime = "edge"; // Força rodar no Vercel Edge sem precisar de dependências nativas como o Sharp

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return new NextResponse("Missing 'url' parameter", { status: 400 });
    }

    // O Next/OG gera uma imagem 1080x1080 (proporção oficial do Instagram 1:1)
    // O div tem fundo branco e usa flexbox para centralizar a foto perfeitamente
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            background: "white",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            style={{
              objectFit: "contain",
              width: "100%",
              height: "100%",
            }}
            alt="Produto"
          />
        </div>
      ),
      {
        width: 1080,
        height: 1080,
      }
    );
  } catch (error) {
    console.error("[IMAGE PROXY] Erro ao processar imagem via OG:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
