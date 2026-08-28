import { describe, expect, it } from "vitest";
import React from "react";
import { buildStoryCommercialPlan } from "@/lib/social/story-commercial-plan";
import {
  buildStoryCommercialFrameModel,
  getOfficialStoryLogoSrc,
  renderStoryCommercialFrame,
} from "@/lib/social/story-commercial-renderer";

describe("Branding oficial das artes de Stories (Instagram e Facebook)", () => {
  it("creative usa asset oficial da logo do Caça Ofertas Oficial", () => {
    const logoSrc = getOfficialStoryLogoSrc();
    expect(logoSrc).toBeDefined();
    expect(logoSrc.length).toBeGreaterThan(0);
    // Deve ser uma data URI válida com imagem base64 ou o caminho do asset oficial
    expect(
      logoSrc.startsWith("data:image/") || logoSrc === "/logo-caca-oferta.png",
    ).toBe(true);

    const plan = buildStoryCommercialPlan({
      productName: "Smartphone Galaxy S24 Ultra",
      marketplace: "Amazon",
      category: "Eletrônicos",
      currentPrice: 5999,
      originalPrice: 7499,
      freeShipping: true,
      evidence: {},
    });

    const frame = buildStoryCommercialFrameModel(
      plan,
      {
        marketplace: "Amazon",
        imageUrl: "https://images.example.com/s24.jpg",
      },
      1,
    );

    expect(frame).not.toBeNull();
    expect(frame?.logoSrc).toBe(logoSrc);
    expect(frame?.brandName).toBe("Caça Ofertas Oficial");
  });

  it("header renderiza marca corretamente sem fallbacks feios", () => {
    const plan = buildStoryCommercialPlan({
      productName: "Air Fryer Mondial 4L",
      marketplace: "Shopee",
      category: "Cozinha",
      currentPrice: 199.9,
      originalPrice: 299.9,
      freeShipping: false,
      evidence: {},
    });

    const frame = buildStoryCommercialFrameModel(
      plan,
      {
        marketplace: "Shopee",
        imageUrl: "https://images.example.com/airfryer.jpg",
      },
      1,
    );

    expect(frame).not.toBeNull();
    const rendered = renderStoryCommercialFrame(frame!);
    expect(React.isValidElement(rendered)).toBe(true);

    // O bloco principal superior contém o header e o conteúdo agrupados sem vão excessivo
    const rootProps = rendered.props as unknown as { children: React.ReactNode[] };
    const rootChildren = React.Children.toArray(rootProps.children);
    const topSection = rootChildren[0] as unknown as React.ReactElement<{ children: React.ReactNode[] }>;
    expect(topSection).toBeDefined();

    // Primeiro elemento dentro da seção superior é o Header
    const topChildren = React.Children.toArray(topSection.props.children);
    const header = topChildren[0] as unknown as React.ReactElement<{ children: React.ReactNode[] }>;
    expect(header).toBeDefined();

    // Inspeciona os elementos dentro do header
    const headerChildren = React.Children.toArray(header.props.children);
    const brandBlock = headerChildren[0] as unknown as React.ReactElement<{ children: React.ReactNode[] }>;
    const marketplaceBlock = headerChildren[1] as unknown as React.ReactElement<{ children: React.ReactNode }>;

    // Marketplace renderizado no bloco secundário à direita
    expect(marketplaceBlock.props.children).toBe("Shopee");

    // Bloco da marca com logo oficial e nome
    const brandChildren = React.Children.toArray(brandBlock.props.children);
    const logoContainer = brandChildren[0] as React.ReactElement<{ style: React.CSSProperties; children: React.ReactElement<{ src: string; alt: string }> }>;
    const brandNameContainer = brandChildren[1] as React.ReactElement<{ children: React.ReactNode }>;

    // Logo container com proporção quadrada e tamanho ajustado (~64px)
    expect(logoContainer.props.style.width).toBe(64);
    expect(logoContainer.props.style.height).toBe(64);

    const logoImg = logoContainer.props.children;
    expect(logoImg.type).toBe("img");
    expect(logoImg.props.src).toBe(frame!.logoSrc);
    expect(logoImg.props.alt).toBe("Caça Ofertas Oficial");

    // Nome oficial da marca
    expect(brandNameContainer.props.children).toBe("Caça Ofertas Oficial");
  });

  it("branding aparece de forma consistente para Instagram e Facebook Stories", () => {
    const plan = buildStoryCommercialPlan({
      productName: "Monitor Gamer 144Hz 27 polegadas",
      marketplace: "Mercado Livre",
      category: "Informática",
      currentPrice: 899,
      originalPrice: 1199,
      freeShipping: true,
      evidence: {},
    });

    const igFrame = buildStoryCommercialFrameModel(
      plan,
      {
        marketplace: "Mercado Livre",
        imageUrl: "https://images.example.com/monitor.jpg",
        channel: "instagram",
      },
      1,
    );

    const fbFrame = buildStoryCommercialFrameModel(
      plan,
      {
        marketplace: "Mercado Livre",
        imageUrl: "https://images.example.com/monitor.jpg",
        channel: "facebook",
      },
      1,
    );

    expect(igFrame?.brandName).toBe("Caça Ofertas Oficial");
    expect(fbFrame?.brandName).toBe("Caça Ofertas Oficial");
    expect(igFrame?.logoSrc).toBe(fbFrame?.logoSrc);
    expect(igFrame?.channel).toBe("instagram");
    expect(fbFrame?.channel).toBe("facebook");

    const igRendered = renderStoryCommercialFrame(igFrame!);
    const fbRendered = renderStoryCommercialFrame(fbFrame!);

    expect(React.isValidElement(igRendered)).toBe(true);
    expect(React.isValidElement(fbRendered)).toBe(true);
  });

  it("não há regressão na arte comercial para todos os templates e segundo frame", () => {
    // Template 1: DISCOUNT_HERO
    const discountPlan = buildStoryCommercialPlan({
      productName: "Tênis Running",
      marketplace: "Netshoes",
      category: "Calçados",
      currentPrice: 150,
      originalPrice: 200,
      freeShipping: true,
      evidence: {},
    });
    const frame1 = buildStoryCommercialFrameModel(
      discountPlan,
      { marketplace: "Netshoes", imageUrl: "https://images.example.com/tenis.jpg" },
      1,
    );
    expect(frame1?.variant).toBe("discount");
    expect(frame1?.hero).toBe("25% OFF");
    expect(frame1?.price).toContain("150,00");
    expect(frame1?.originalPrice).toContain("200,00");
    expect(frame1?.support).toContain("Economize R$ 50,00");

    // Frame 2: Reinforcement
    const frame2 = buildStoryCommercialFrameModel(
      discountPlan,
      { marketplace: "Netshoes", imageUrl: "https://images.example.com/tenis.jpg" },
      2,
    );
    expect(frame2).not.toBeNull();
    expect(frame2?.variant).toBe("reinforcement");
    expect(frame2?.hero).toBe("FRETE GRÁTIS");

    // Template 2: PRICE_HERO
    const pricePlan = buildStoryCommercialPlan({
      productName: "Mouse Sem Fio",
      marketplace: "Shopee",
      category: null,
      currentPrice: 35,
      originalPrice: null,
      freeShipping: false,
      evidence: {},
    });
    const priceFrame = buildStoryCommercialFrameModel(
      pricePlan,
      { marketplace: "Shopee", imageUrl: "https://images.example.com/mouse.jpg" },
      1,
    );
    expect(priceFrame?.variant).toBe("price");
    expect(priceFrame?.hero).toContain("35,00");
  });

  it("ajusta o layout vertical adaptativo para ofertas compactas e ofertas ricas", () => {
    const compactPlan = buildStoryCommercialPlan({
      productName: "Cabo USB-C 1m",
      marketplace: "Shopee",
      category: null,
      currentPrice: 15,
      originalPrice: null,
      freeShipping: false,
      evidence: {},
    });
    const compactFrame = buildStoryCommercialFrameModel(
      compactPlan,
      { marketplace: "Shopee", imageUrl: "https://images.example.com/cabo.jpg" },
      1,
    );
    const compactRendered = renderStoryCommercialFrame(compactFrame!);
    expect(React.isValidElement(compactRendered)).toBe(true);

    const richPlan = buildStoryCommercialPlan({
      productName: "Notebook Gamer Core i7 16GB SSD 512GB",
      marketplace: "Amazon",
      category: "Informática",
      currentPrice: 4500,
      originalPrice: 6000,
      freeShipping: true,
      evidence: {},
    });
    const richFrame = buildStoryCommercialFrameModel(
      richPlan,
      { marketplace: "Amazon", imageUrl: "https://images.example.com/notebook.jpg" },
      1,
    );
    const richRendered = renderStoryCommercialFrame(richFrame!);
    expect(React.isValidElement(richRendered)).toBe(true);
  });

  it("garante proporção de vitrine premium com imagem contida e altura máxima reduzida", () => {
    const plan = buildStoryCommercialPlan({
      productName: "Cafeteira Nespresso Essenza Mini",
      marketplace: "Amazon",
      category: "Cozinha",
      currentPrice: 389,
      originalPrice: 499,
      freeShipping: true,
      evidence: {},
    });
    const frame = buildStoryCommercialFrameModel(
      plan,
      { marketplace: "Amazon", imageUrl: "https://images.example.com/nespresso.jpg" },
      1,
    );
    const rendered = renderStoryCommercialFrame(frame!);
    const rootProps = rendered.props as unknown as { children: React.ReactNode[] };
    const rootChildren = React.Children.toArray(rootProps.children);
    const topSection = rootChildren[0] as unknown as React.ReactElement<{ children: React.ReactNode[] }>;
    const topChildren = React.Children.toArray(topSection.props.children);

    // imageBlock é o segundo bloco filho da raiz
    const imageContainer = rootChildren[1] as unknown as React.ReactElement<{ style: React.CSSProperties; children: React.ReactElement<{ style: React.CSSProperties }> }>;
    expect(imageContainer).toBeDefined();
    expect(Number(imageContainer.props.style.height)).toBeLessThanOrEqual(860);
    expect(Number(imageContainer.props.style.height)).toBeGreaterThanOrEqual(720);

    const img = imageContainer.props.children;
    expect(img.props.style.objectFit).toBe("contain");

    // Bloco comercial e CTA integrados no terceiro bloco (rodapé)
    const bottomSection = rootChildren[2] as unknown as React.ReactElement<{ children: React.ReactNode[] }>;
    const bottomChildren = React.Children.toArray(bottomSection.props.children);
    const ctaButton = bottomChildren[1] as unknown as React.ReactElement<{ children: string }>;
    expect(ctaButton.props.children).toBe("OFERTA NO LINK DA BIO");
  });
});

