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

type StoryOffer = {
  product_name?: string | null;
  platform?: string | null;
  image_url?: string | null;
  current_price?: number | null;
  old_price?: number | null;
};

export type CommercialStoryModel = {
  productName: string;
  marketplace: string;
  imageUrl: string | null;
  currentPrice: number;
  oldPrice: number | null;
  currentPriceLabel: string;
  oldPriceLabel: string | null;
  savingsLabel: string | null;
  discountLabel: string | null;
};

function validHttps(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function compactProductName(value: unknown) {
  const normalized = String(value ?? "Oferta selecionada").replace(/\s+/gu, " ").trim();
  if (normalized.length <= 86) return normalized;
  return `${normalized.slice(0, 83).trimEnd()}…`;
}

export function buildCommercialStoryModel(offer: StoryOffer): CommercialStoryModel {
  const currentPrice = Number(offer.current_price ?? 0);
  const oldCandidate = Number(offer.old_price ?? 0);
  const oldPrice = Number.isFinite(oldCandidate) && oldCandidate > currentPrice && currentPrice > 0
    ? oldCandidate
    : null;
  const savings = oldPrice ? oldPrice - currentPrice : null;
  const discount = oldPrice ? Math.round((savings! / oldPrice) * 100) : null;

  return {
    productName: compactProductName(offer.product_name),
    marketplace: String(offer.platform ?? "Marketplace").trim() || "Marketplace",
    imageUrl: validHttps(offer.image_url),
    currentPrice,
    oldPrice,
    currentPriceLabel: currentPrice > 0 ? money(currentPrice) : "Confira o preço atual",
    oldPriceLabel: oldPrice ? money(oldPrice) : null,
    savingsLabel: savings && savings > 0 ? money(savings) : null,
    discountLabel: discount && discount > 0 ? `${discount}% OFF` : null,
  };
}

function brandHeader(model: CommercialStoryModel, frame: number) {
  return React.createElement(
    "div",
    { style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" } },
    React.createElement(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 16 } },
      React.createElement(
        "div",
        {
          style: {
            width: 58,
            height: 58,
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#facc15",
            color: "#071827",
            fontSize: 26,
            fontWeight: 1000,
          },
        },
        "CAÇA",
      ),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        React.createElement("div", { style: { fontSize: 27, fontWeight: 900 } }, "Caça Oferta Oficial"),
        React.createElement("div", { style: { fontSize: 20, opacity: 0.68 } }, model.marketplace),
      ),
    ),
    React.createElement(
      "div",
      { style: { fontSize: 20, fontWeight: 800, opacity: 0.55 } },
      `${frame}/3`,
    ),
  );
}

function productImage(model: CommercialStoryModel, height: number) {
  if (!model.imageUrl) {
    return React.createElement(
      "div",
      {
        style: {
          width: "100%",
          height,
          borderRadius: 44,
          background: "rgba(255,255,255,0.08)",
          border: "2px solid rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 50,
          fontSize: 36,
          fontWeight: 800,
          textAlign: "center",
          color: "rgba(255,255,255,0.72)",
        },
      },
      "Imagem do produto indisponível",
    );
  }

  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height,
        borderRadius: 44,
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: 34,
        boxShadow: "0 30px 80px rgba(0,0,0,0.34)",
      },
    },
    React.createElement("img", {
      src: model.imageUrl,
      alt: "",
      style: { width: "100%", height: "100%", objectFit: "contain" },
    }),
  );
}

function frameOne(model: CommercialStoryModel) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 } },
      React.createElement(
        "div",
        { style: { fontSize: 32, fontWeight: 900, letterSpacing: 2.4, color: "#fde68a" } },
        "OFERTA QUE CHAMA ATENÇÃO",
      ),
      model.discountLabel
        ? React.createElement(
            "div",
            {
              style: {
                background: "#facc15",
                color: "#071827",
                borderRadius: 999,
                padding: "16px 24px",
                fontSize: 34,
                fontWeight: 1000,
                whiteSpace: "nowrap",
              },
            },
            model.discountLabel,
          )
        : null,
    ),
    productImage(model, 790),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 26 } },
      React.createElement(
        "div",
        { style: { fontSize: 52, lineHeight: 1.04, fontWeight: 950, letterSpacing: -1.6 } },
        model.productName,
      ),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 6 } },
        model.oldPriceLabel
          ? React.createElement(
              "div",
              { style: { fontSize: 30, opacity: 0.62, textDecoration: "line-through" } },
              `De ${model.oldPriceLabel}`,
            )
          : null,
        React.createElement(
          "div",
          { style: { fontSize: 72, fontWeight: 1000, color: "#facc15", letterSpacing: -2 } },
          model.currentPriceLabel,
        ),
      ),
    ),
  );
}

function frameTwo(model: CommercialStoryModel) {
  const hasSavings = Boolean(model.savingsLabel && model.discountLabel);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { style: { fontSize: 31, fontWeight: 900, letterSpacing: 2.2, color: "#bfdbfe" } },
      hasSavings ? "O NÚMERO QUE IMPORTA" : "PREÇO VERIFICADO",
    ),
    productImage(model, 610),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 24,
          padding: "52px 54px",
          borderRadius: 44,
          background: "rgba(255,255,255,0.09)",
          border: "2px solid rgba(255,255,255,0.13)",
        },
      },
      hasSavings
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement("div", { style: { fontSize: 30, fontWeight: 800, opacity: 0.7 } }, "VOCÊ ECONOMIZA"),
            React.createElement("div", { style: { fontSize: 92, fontWeight: 1000, color: "#86efac", letterSpacing: -3 } }, model.savingsLabel),
            React.createElement("div", { style: { fontSize: 48, fontWeight: 950 } }, `${model.discountLabel} sobre o preço anterior`),
          )
        : React.createElement(
            React.Fragment,
            null,
            React.createElement("div", { style: { fontSize: 30, fontWeight: 800, opacity: 0.7 } }, "PREÇO ATUAL INFORMADO"),
            React.createElement("div", { style: { fontSize: 92, fontWeight: 1000, color: "#facc15", letterSpacing: -3 } }, model.currentPriceLabel),
          ),
      React.createElement("div", { style: { fontSize: 31, lineHeight: 1.18, fontWeight: 800, opacity: 0.82 } }, model.productName),
    ),
  );
}

function frameThree(model: CommercialStoryModel) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { style: { fontSize: 31, fontWeight: 900, letterSpacing: 2.2, color: "#fde68a" } },
      "CONFIRA ANTES QUE O PREÇO MUDE",
    ),
    productImage(model, 650),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 22 } },
      React.createElement("div", { style: { fontSize: 29, fontWeight: 800, opacity: 0.68 } }, "PREÇO ATUAL"),
      React.createElement("div", { style: { fontSize: 102, fontWeight: 1000, color: "#facc15", letterSpacing: -4 } }, model.currentPriceLabel),
      model.savingsLabel
        ? React.createElement(
            "div",
            { style: { fontSize: 35, fontWeight: 900, color: "#86efac" } },
            `Economia de ${model.savingsLabel}`,
          )
        : null,
      React.createElement(
        "div",
        { style: { fontSize: 45, lineHeight: 1.08, fontWeight: 950, marginTop: 8 } },
        "Toque no sticker de link para conferir a oferta.",
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          height: 190,
          borderRadius: 40,
          border: "3px dashed rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.5)",
          fontSize: 25,
          fontWeight: 800,
          letterSpacing: 1.2,
        },
      },
      "ÁREA LIVRE PARA O STICKER DE LINK",
    ),
  );
}

function storyImage(model: CommercialStoryModel, frame: number) {
  const content = frame === 1 ? frameOne(model) : frame === 2 ? frameTwo(model) : frameThree(model);
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "72px 72px 64px",
        background: frame === 2
          ? "linear-gradient(165deg, #071827 0%, #111827 56%, #172554 100%)"
          : "linear-gradient(160deg, #061724 0%, #0b2235 54%, #071827 100%)",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        gap: 48,
      },
    },
    brandHeader(model, frame),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", gap: 42 } },
      content,
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
    .select("id,channel,status,content,offers(product_name,platform,image_url,current_price,old_price)")
    .eq("id", postId)
    .eq("channel", "instagram")
    .eq("status", "draft")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ ok: false, message: "Draft de Story não encontrado." }, { status: 404 });
  if (!post.content.trimStart().startsWith(INSTAGRAM_STORIES_V4_HANDOFF_MARKER)) {
    return NextResponse.json({ ok: false, message: "Draft não pertence ao handoff Stories V4." }, { status: 422 });
  }

  const related = (Array.isArray(post.offers) ? post.offers[0] : post.offers) as StoryOffer | null | undefined;
  const model = buildCommercialStoryModel(related ?? {});

  return new ImageResponse(storyImage(model, frame), {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename=story-${postId}-${frame}.png`,
    },
  });
}
