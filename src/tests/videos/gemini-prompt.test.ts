import { buildGeminiVideoPrompt, formatLongPriceForSpeech } from "@/lib/videos/gemini-prompt";

function extractSpeech(prompt: string) {
  const match = prompt.match(/FALA EXATA:\n"([\s\S]*?)"\n\nQUALIDADE:/);
  return match?.[1] ?? "";
}

function countWords(text: string) {
  return text
    .replace(/[“”"!,.!?;:]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

describe("Gemini video prompt de 8 segundos", () => {
  it("gera prompt estruturado e locução curta para cafeteira", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "3 Corações TRES Cafeteira Espresso e Multibebida Passione Branca - 127V",
      short_name: "Cafeteira Três Corações Passione",
      current_price: 471.8,
      platform: "Amazon",
      category: "Cafeteiras",
    });

    const speech = extractSpeech(prompt);

    expect(prompt).toContain("exatamente 8 segundos");
    expect(prompt).toContain("PERSONAGEM:");
    expect(prompt).toContain("PRODUTO:");
    expect(prompt).toContain("ÁUDIO E LIPSYNC:");
    expect(prompt).toContain("FALA EXATA:");
    expect(prompt).toContain("RESTRIÇÕES:");
    expect(prompt).toContain("bancada de cozinha moderna");
    expect(prompt).toContain("produto da imagem de referência sobre uma bancada");
    expect(speech).toContain("Cafeteira Três Corações Passione");
    expect(speech).toContain("quatrocentos e setenta e um e oitenta");
    expect(speech).not.toContain("127V");
    expect(countWords(speech)).toBeLessThanOrEqual(22);
  });

  it("remove especificações técnicas de uma air fryer", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Fritadeira Air Fryer Britânia 9,5L Painel Digital 1800W",
      current_price: 549,
      category: "Cozinha",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Fritadeira Air Fryer Britânia");
    expect(speech).not.toMatch(/9,5\s*l/i);
    expect(speech).not.toMatch(/1800\s*w/i);
    expect(speech).not.toMatch(/painel digital/i);
    expect(speech).toContain("quinhentos e quarenta e nove reais");
    expect(countWords(speech)).toBeLessThanOrEqual(22);
    expect(prompt).toContain("bancada de cozinha moderna");
  });

  it("remove armazenamento e conectividade do nome falável de smartphone", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Smartphone Samsung Galaxy A55 256GB 5G Bluetooth",
      current_price: 1999,
      category: "Tecnologia",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Smartphone Samsung Galaxy A55");
    expect(speech).not.toMatch(/256\s*gb/i);
    expect(speech).not.toMatch(/bluetooth/i);
    expect(prompt).toContain("segurando o produto da imagem de referência com as mãos");
    expect(prompt).toContain("neon azul e roxo");
  });

  it("remove polegadas, resolução e painel do nome falável de TV", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Smart TV Samsung 50\" 4K QLED HDR",
      current_price: 2799,
      category: "Eletrônicos",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Smart TV Samsung");
    expect(speech).not.toMatch(/50/);
    expect(speech).not.toMatch(/4k/i);
    expect(speech).not.toMatch(/qled/i);
    expect(speech).not.toMatch(/hdr/i);
    expect(prompt).toContain("neon azul e roxo");
  });

  it("remove memória e especificações técnicas de notebook", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Notebook Lenovo IdeaPad Slim 3 512GB 16GB Full HD Wi-Fi",
      current_price: 3299.9,
      category: "Tecnologia",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Notebook Lenovo IdeaPad Slim 3");
    expect(speech).not.toMatch(/512\s*gb/i);
    expect(speech).not.toMatch(/16\s*gb/i);
    expect(speech).not.toMatch(/full hd/i);
    expect(speech).not.toMatch(/wi-?fi/i);
    expect(countWords(speech)).toBeLessThanOrEqual(22);
  });

  it("remove tensão e compacta título longo quando short_name não existe", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Cafeteira Espresso Automática Premium Multibebidas Passione Branca Compacta Moderna 127V",
      current_price: 899.9,
      category: "Cozinha",
    });

    const speech = extractSpeech(prompt);

    expect(speech).not.toMatch(/127\s*v/i);
    expect(countWords(speech)).toBeLessThanOrEqual(22);
    expect(prompt).toContain("A última palavra deve terminar antes do fim do vídeo");
    expect(prompt).toContain("0,3 segundo");
  });

  it("mantém preço longo disponível para usos futuros", () => {
    expect(formatLongPriceForSpeech(471.8)).toBe("quatrocentos e setenta e um reais e oitenta centavos");
  });
});
