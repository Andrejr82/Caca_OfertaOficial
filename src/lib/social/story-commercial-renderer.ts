import React from "react";
import type { StoryCommercialPlan } from "@/lib/social/story-commercial-plan";

export type StoryCommercialVisualFacts = {
  marketplace: string;
  imageUrl: string;
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
};

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildStoryCommercialFrameModel(
  plan: StoryCommercialPlan,
  visual: StoryCommercialVisualFacts,
  frame: 1 | 2,
): StoryCommercialFrameModel | null {
  if (frame > plan.frameCount) return null;
  const price = money(plan.currentPrice);
  const originalPrice = plan.originalPrice ? money(plan.originalPrice) : null;

  if (frame === 1) {
    if (plan.template === "DISCOUNT_HERO") {
      return {
        frame,
        variant: "discount",
        marketplace: visual.marketplace,
        imageUrl: visual.imageUrl,
        title: plan.title,
        eyebrow: "ACHADINHO",
        hero: `${plan.discountPercent}% OFF`,
        price,
        originalPrice,
        support: plan.savings ? `Economize ${money(plan.savings)}` : null,
        cta: "VER OFERTA 👇",
      };
    }

    if (plan.template === "PROOF_HERO" && plan.proof) {
      return {
        frame,
        variant: "proof",
        marketplace: visual.marketplace,
        imageUrl: visual.imageUrl,
        title: plan.title,
        eyebrow: "ACHADINHO",
        hero: plan.proof,
        price,
        originalPrice: null,
        support: plan.freeShipping ? "FRETE GRÁTIS" : null,
        cta: "VER OFERTA 👇",
      };
    }

    return {
      frame,
      variant: "price",
      marketplace: visual.marketplace,
      imageUrl: visual.imageUrl,
      title: plan.title,
      eyebrow: "OLHA ESSE PREÇO 👀",
      hero: price,
      price,
      originalPrice: null,
      support: null,
      cta: "VER OFERTA 👇",
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
    cta: "VER OFERTA 👇",
  };
}

function imageBlock(model: StoryCommercialFrameModel) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        width: "100%",
        height: 1010,
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

  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "58px 58px 72px",
        background: "linear-gradient(180deg,#fffaf0 0%,#fff 55%,#f8fafc 100%)",
        color: "#111827",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 800 } },
        React.createElement(
          "div",
          { style: { display: "flex", width: 44, height: 44, borderRadius: 14, background: "#facc15", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 1000 } },
          "CAÇA",
        ),
        "Caça Ofertas Oficial",
      ),
      React.createElement("div", { style: { fontSize: 22, fontWeight: 700, opacity: 0.58 } }, model.marketplace),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 24 } },
      React.createElement(
        "div",
        { style: { display: "flex", alignSelf: "flex-start", borderRadius: 999, padding: "14px 22px", background: accent, color: "#fff", fontSize: 26, fontWeight: 900, letterSpacing: 1.1 } },
        model.eyebrow,
      ),
      imageBlock(model),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 12 } },
        React.createElement("div", { style: { fontSize: 44, lineHeight: 1.04, fontWeight: 900, letterSpacing: -1.3 } }, model.title),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" } },
          model.originalPrice
            ? React.createElement("div", { style: { fontSize: 30, opacity: 0.48, textDecoration: "line-through" } }, `De ${model.originalPrice}`)
            : null,
          React.createElement("div", { style: { fontSize: model.variant === "price" ? 76 : 96, fontWeight: 1000, color: accent, letterSpacing: -3 } }, model.hero),
        ),
        model.variant !== "price"
          ? React.createElement("div", { style: { fontSize: 62, fontWeight: 1000, letterSpacing: -2.2 } }, model.price)
          : null,
        model.support
          ? React.createElement("div", { style: { fontSize: 31, fontWeight: 800, color: "#166534" } }, model.support)
          : null,
      ),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: 999, padding: "26px 34px", background: "#111827", color: "#fff", fontSize: 34, fontWeight: 950, letterSpacing: 0.6 } },
      model.cta,
    ),
  );
}
