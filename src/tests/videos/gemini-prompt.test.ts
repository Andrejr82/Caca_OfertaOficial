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

  it("preserva interação e cenário de tecnologia", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Smartphone X Pro 256GB",
      short_name: "Smartphone X Pro",
      current_price: 1999,
      category: "Tecnologia",
    });

    expect(prompt).toContain("segurando o produto da imagem de referência com as mãos");
    expect(prompt).toContain("neon azul e roxo");
    expect(prompt).toContain("mil novecentos e noventa e nove reais");
  });

  it("mantém preço longo disponível para usos futuros", () => {
    expect(formatLongPriceForSpeech(471.8)).toBe("quatrocentos e setenta e um reais e oitenta centavos");
  });
});
