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

function imageBlock(model: StoryCommercialFrameModel, height: number = 760) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        width: "100%",
        height,
        borderRadius: 48,
        overflow: "hidden",
        background: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        border: "2px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
        position: "relative",
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
    ? "#ff4726"
    : model.variant === "proof"
      ? "#2563eb"
      : "#0f172a";

  const hasExtraDetails = Boolean(model.originalPrice || model.support || model.variant === "discount");
  const imageHeight = hasExtraDetails ? 760 : 820;
  const rootPadding = "64px 48px 72px";

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
        background: "linear-gradient(180deg, #fffcf5 0%, #ffffff 35%, #f8fafc 100%)",
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 16, width: "100%" } },
      React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 16 } },
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                width: 64,
                height: 64,
                borderRadius: 18,
                overflow: "hidden",
                background: "#0f172a",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 16px rgba(15, 23, 42, 0.12)",
                flexShrink: 0,
              },
            },
            React.createElement("img", {
              src: model.logoSrc,
              alt: model.brandName,
              style: { width: "100%", height: "100%", objectFit: "cover" },
            }),
          ),
          React.createElement(
            "div",
            { style: { display: "flex", fontSize: 28, fontWeight: 900, color: "#0f172a", letterSpacing: -0.5 } },
            model.brandName,
          ),
        ),
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              padding: "10px 24px",
              background: "rgba(15, 23, 42, 0.05)",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 800,
              color: "#475569",
              border: "1.5px solid rgba(15, 23, 42, 0.08)",
            },
          },
          model.marketplace,
        ),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignSelf: "flex-start",
            borderRadius: 999,
            padding: "12px 26px",
            background: accent,
            color: "#ffffff",
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: 1.2,
            ...(model.variant === "discount" ? { boxShadow: "0 8px 22px rgba(255, 71, 38, 0.32)" } : {}),
          },
        },
        model.eyebrow,
      ),
    ),
    imageBlock(model, imageHeight),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 18, width: "100%" } },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: "#ffffff",
            borderRadius: 40,
            padding: "32px 36px",
            border: "2px solid rgba(226, 232, 240, 0.95)",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)",
          },
        },
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              fontSize: 38,
              lineHeight: 1.18,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: -0.9,
            },
          },
          model.title,
        ),
        React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 10 } },
          model.variant === "discount"
            ? React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 16 } },
              React.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 20px",
                    background: accent,
                    color: "#ffffff",
                    borderRadius: 16,
                    fontSize: 34,
                    fontWeight: 950,
                    letterSpacing: -0.5,
                  },
                },
                model.hero,
              ),
              model.originalPrice
                ? React.createElement(
                  "div",
                  { style: { display: "flex", fontSize: 30, color: "#94a3b8", textDecoration: "line-through", fontWeight: 700 } },
                  `De ${model.originalPrice}`,
                )
                : null,
            )
            : model.variant === "proof" || model.variant === "reinforcement"
              ? React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: 14 } },
                React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 18px",
                      background: accent,
                      color: "#ffffff",
                      borderRadius: 14,
                      fontSize: 28,
                      fontWeight: 950,
                    },
                  },
                  model.hero,
                ),
              )
              : null,
          model.variant !== "price"
            ? React.createElement(
              "div",
              { style: { display: "flex", fontSize: 68, fontWeight: 1000, color: "#0f172a", letterSpacing: -2.4 } },
              `Por ${model.price}`,
            )
            : React.createElement(
              "div",
              { style: { display: "flex", fontSize: 78, fontWeight: 1000, color: accent, letterSpacing: -3.0 } },
              model.hero,
            ),
          model.support
            ? React.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignSelf: "flex-start",
                  alignItems: "center",
                  padding: "8px 18px",
                  background: "#ecfdf5",
                  color: "#059669",
                  border: "1.5px solid #a7f3d0",
                  borderRadius: 14,
                  fontSize: 26,
                  fontWeight: 800,
                },
              },
              model.support,
            )
            : null,
        ),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            padding: "28px 36px",
            background: "#0f172a",
            color: "#ffffff",
            fontSize: 34,
            fontWeight: 950,
            letterSpacing: 1.0,
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.25)",
          },
        },
        model.cta,
      ),
    ),
  );
}
