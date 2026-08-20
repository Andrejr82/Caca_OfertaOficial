import React from "react";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INSTAGRAM_STORIES_V4_HANDOFF_MARKER } from "@/lib/social/meta-publication-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function parseFrame(content: string, frame: number) {
  if (!content.trimStart().startsWith(INSTAGRAM_STORIES_V4_HANDOFF_MARKER)) return null;
  const match = content.match(new RegExp(`TELA ${frame}\\/3\\n([\\s\\S]*?)(?=\\n\\nTELA [123]\\/3|$)`, "u"));
  return match?.[1]?.trim() || null;
}

function frameEyebrow(frame: number) {
  if (frame === 1) return "ACHADO DO DIA";
  if (frame === 2) return "POR QUE VALE OLHAR";
  return "PREÇO ATUAL";
}

function frameFooter(frame: number) {
  return frame === 3 ? "Adicione o sticker Link antes de publicar" : "Caça Ofertas Oficial";
}

function storyImage(productName: string, marketplace: string, frame: number, text: string) {
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "120px 88px 100px",
        background: frame === 2 ? "#18181b" : frame === 3 ? "#09090b" : "#111827",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "28px" } },
      React.createElement(
        "div",
        { style: { fontSize: 34, letterSpacing: 5, fontWeight: 800, opacity: 0.72 } },
        frameEyebrow(frame),
      ),
      React.createElement(
        "div",
        { style: { fontSize: 42, lineHeight: 1.15, fontWeight: 700, opacity: 0.78 } },
        productName,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "42px",
          padding: "70px 64px",
          borderRadius: 48,
          background: "rgba(255,255,255,0.08)",
          border: "2px solid rgba(255,255,255,0.14)",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            whiteSpace: "pre-wrap",
            fontSize: frame === 3 ? 76 : 64,
            lineHeight: 1.12,
            fontWeight: 900,
            letterSpacing: -1.5,
          },
        },
        text,
      ),
      frame === 3
        ? React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "30px 42px",
                borderRadius: 999,
                background: "#ffffff",
                color: "#09090b",
                fontSize: 36,
                fontWeight: 900,
              },
            },
            "VER PREÇO ATUAL",
          )
        : null,
    ),
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "30px" } },
      React.createElement(
        "div",
        { style: { fontSize: 30, fontWeight: 800, opacity: 0.8, maxWidth: "72%" } },
        frameFooter(frame),
      ),
      React.createElement(
        "div",
        { style: { fontSize: 28, fontWeight: 700, opacity: 0.55, textAlign: "right" } },
        `${marketplace} · ${frame}/3`,
      ),
    ),
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId")?.trim();
  const frame = Number(searchParams.get("frame"));

  if (!postId || !Number.isInteger(frame) || frame < 1 || frame > 3) {
    return NextResponse.json({ ok: false, message: "postId e frame=1|2|3 são obrigatórios." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: post, error } = await supabase
    .from("posts")
    .select("id,channel,status,content,offers(product_name,platform)")
    .eq("id", postId)
    .eq("channel", "instagram")
    .eq("status", "draft")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ ok: false, message: "Draft de Story não encontrado." }, { status: 404 });

  const text = parseFrame(post.content, frame);
  if (!text) return NextResponse.json({ ok: false, message: "Draft não contém o frame solicitado." }, { status: 422 });

  const related = Array.isArray(post.offers) ? post.offers[0] : post.offers;
  const productName = related?.product_name || "Oferta selecionada";
  const marketplace = related?.platform || "Marketplace";

  return new ImageResponse(storyImage(productName, marketplace, frame, text), {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename=story-${postId}-${frame}.png`,
    },
  });
}
