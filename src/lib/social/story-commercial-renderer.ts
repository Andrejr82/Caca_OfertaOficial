import React from "react";
import fs from "node:fs";
import path from "node:path";
import type { StoryCommercialPlan } from "@/lib/social/story-commercial-plan";

export type StoryCommercialVisualFacts = {
  marketplace: string;
  imageUrl: string;
  channel?: "instagram" | "facebook";
  brandName?: string;
  logoSrc?: string;
};

export type StoryCommercialFrameModel = {
  frame: 1 | 2;
  variant: "discount" | "proof" | "price" | "reinforcement";
  marketplace: string;
  imageUrl: string;
  title: string;
  eyebrow: string;
  hero: string;
  price: string;
  originalPrice: string | null;
  support: string | null;
  cta: string;
  channel?: "instagram" | "facebook";
  brandName: string;
  logoSrc: string;
};

let cachedLogoDataUri: string | null = null;

export function getOfficialStoryLogoSrc(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo-caca-oferta.png");
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      const mime = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/png";
      cachedLogoDataUri = `data:${mime};base64,${buf.toString("base64")}`;
      return cachedLogoDataUri;
    }
  } catch {
    // Fallback if filesystem access is restricted
  }
  return "/logo-caca-oferta.png";
}

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function profileCta(channel: "instagram" | "facebook") {
  return channel === "instagram" ? "OFERTA NO LINK DA BIO" : "OFERTA NO LINK DO PERFIL";
}

export function buildStoryCommercialFrameModel(
  plan: StoryCommercialPlan,
  visual: StoryCommercialVisualFacts,
  frame: 1 | 2,
): StoryCommercialFrameModel | null {
  if (frame > plan.frameCount) return null;
  const price = money(plan.currentPrice);
  const originalPrice = plan.originalPrice ? money(plan.originalPrice) : null;
  const channel = visual.channel ?? "instagram";
  const brandName = visual.brandName ?? "Caça Ofertas Oficial";
  const logoSrc = visual.logoSrc ?? getOfficialStoryLogoSrc();
  const cta = profileCta(channel);

  if (frame === 1) {
    if (plan.template === "DISCOUNT_HERO") {
      return {
        frame,
        variant: "discount",
        marketplace: visual.marketplace,
        imageUrl: visual.imageUrl,
        title: plan.title,
        eyebrow: "ACHADINHO DO DIA",
        hero: `${plan.discountPercent}% OFF`,
        price,
        originalPrice,
        support: plan.savings ? `Economize ${money(plan.savings)}` : null,
        cta,
        channel,
        brandName,
        logoSrc,
      };
    }

    if (plan.template === "PROOF_HERO" && plan.proof) {
      return {
        frame,
        variant: "proof",
        marketplace: visual.marketplace,
        imageUrl: visual.imageUrl,
        title: plan.title,
        eyebrow: "ACHADINHO DO DIA",
        hero: plan.proof,
        price,
        originalPrice: null,
        support: plan.freeShipping ? "FRETE GRÁTIS" : null,
        cta,
        channel,
        brandName,
        logoSrc,
      };
    }

    return {
      frame,
      variant: "price",
      marketplace: visual.marketplace,
      imageUrl: visual.imageUrl,
      title: plan.title,
      eyebrow: "ACHADINHO DO DIA",
      hero: price,
      price,
      originalPrice: null,
      support: null,
      cta,
      channel,
      brandName,
      logoSrc,
    };
  }

  return {
    frame,
    variant: "reinforcement",
    marketplace: visual.marketplace,
    imageUrl: visual.imageUrl,
    title: plan.title,
    eyebrow: "POR QUE VALE O CLIQUE",
    hero: plan.proof ?? (plan.freeShipping ? "FRETE GRÁTIS" : price),
    price,
    originalPrice: null,
    support: plan.template === "DISCOUNT_HERO" && plan.savings ? `Economia de ${money(plan.savings)}` : null,
    cta,
    channel,
    brandName,
    logoSrc,
  };
}

function imageBlock(model: StoryCommercialFrameModel, height: number = 960) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        width: "100%",
        height,
        borderRadius: 54,
        overflow: "hidden",
        background: "#fff",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 30px 80px rgba(20,20,20,0.14)",
      },
    },
    React.createElement("img", {
      src: model.imageUrl,
      alt: "",
      style: { width: "100%", height: "100%", objectFit: "contain" },
    }),
  );
}

export function renderStoryCommercialFrame(model: StoryCommercialFrameModel) {
  const accent = model.variant === "discount"
    ? "#ff5a36"
    : model.variant === "proof"
      ? "#2563eb"
      : "#111827";

  const hasExtraDetails = Boolean(model.originalPrice || model.support || model.variant === "discount");
  const imageHeight = hasExtraDetails ? 940 : 1030;
  const sectionGap = hasExtraDetails ? 18 : 24;
  const infoGap = hasExtraDetails ? 10 : 14;
  const rootPadding = hasExtraDetails ? "58px 56px 62px" : "58px 56px 60px";

  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: rootPadding,
        background: "linear-gradient(180deg,#fffaf0 0%,#fff 55%,#f8fafc 100%)",
        color: "#111827",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: sectionGap, width: "100%" } },
      React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 16 } },
          React.createElement(
            "div",
            { style: { display: "flex", width: 64, height: 64, borderRadius: 16, overflow: "hidden", background: "#0f172a", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.08)", flexShrink: 0 } },
            React.createElement("img", { src: model.logoSrc, alt: model.brandName, style: { width: "100%", height: "100%", objectFit: "cover" } }),
          ),
          React.createElement("div", { style: { display: "flex", fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: -0.4 } }, model.brandName),
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", padding: "8px 20px", background: "rgba(15, 23, 42, 0.05)", borderRadius: 999, fontSize: 20, fontWeight: 700, color: "#64748b" } }, model.marketplace),
      ),
      React.createElement(
        "div",
        { style: { display: "flex", alignSelf: "flex-start", borderRadius: 999, padding: "14px 24px", background: accent, color: "#fff", fontSize: 26, fontWeight: 900, letterSpacing: 1.1 } },
        model.eyebrow,
      ),
      imageBlock(model, imageHeight),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: infoGap } },
        React.createElement("div", { style: { fontSize: 44, lineHeight: 1.04, fontWeight: 900, letterSpacing: -1.3 } }, model.title),
        React.createElement("div", { style: { fontSize: model.variant === "price" ? 76 : 88, fontWeight: 1000, color: accent, letterSpacing: -3 } }, model.hero),
        model.originalPrice
          ? React.createElement("div", { style: { fontSize: 30, opacity: 0.5, textDecoration: "line-through" } }, `De ${model.originalPrice}`)
          : null,
        model.variant !== "price"
          ? React.createElement("div", { style: { fontSize: 58, fontWeight: 1000, letterSpacing: -2.2 } }, `Por ${model.price}`)
          : null,
        model.support
          ? React.createElement("div", { style: { fontSize: 31, fontWeight: 800, color: "#166534" } }, model.support)
          : null,
      ),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: 999, padding: "24px 32px", background: "#111827", color: "#fff", fontSize: 32, fontWeight: 950, letterSpacing: 0.6 } },
      model.cta,
    ),
  );
}
