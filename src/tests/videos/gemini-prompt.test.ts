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
  it("gera prompt estruturado, preço monetário completo e avatar oficial para cafeteira", () => {
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
    expect(prompt).toContain("COMPOSIÇÃO DO PRODUTO:");
    expect(prompt).toContain("ÁUDIO E LIPSYNC:");
    expect(prompt).toContain("FALA EXATA:");
    expect(prompt).toContain("RESTRIÇÕES:");
    expect(prompt).toContain("Avatar_Silvia");
    expect(prompt).toContain('texto \"CAÇA OFERTA\"');
    expect(prompt).toContain("cozinha residencial contemporânea premium");
    expect(prompt).toContain("produto sobre a bancada");
    expect(speech).toContain("Cafeteira Três Corações Passione");
    expect(speech).toContain("quatrocentos e setenta e um reais e oitenta centavos");
    expect(speech).not.toContain("127V");
    expect(countWords(speech)).toBeLessThanOrEqual(22);
  });

  it("usa oficina premium e composição anti-alucinação para ferramentas", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Parafusadeira Furadeira be lmpacto 2 Baterias 21V",
      current_price: 123.9,
      category: "Ferramentas",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Parafusadeira e Furadeira de Impacto com duas baterias");
    expect(speech).not.toMatch(/\b2\b/);
    expect(speech).not.toMatch(/be lmpacto/i);
    expect(speech).not.toMatch(/21\s*v/i);
    expect(speech).toContain("cento e vinte e três reais e noventa centavos");
    expect(countWords(speech)).toBeLessThanOrEqual(22);

    expect(prompt).toContain("oficina contemporânea premium");
    expect(prompt).toContain("bancada robusta de madeira escura e metal");
    expect(prompt).toContain("painel de ferramentas");
    expect(prompt).toContain("sem segurar, operar ou acionar a ferramenta");
    expect(prompt).toContain("Não adicionar maleta, brocas, soquetes, carregadores, baterias extras");
    expect(prompt).toContain("A imagem de referência é a autoridade visual");
    expect(prompt).toContain("Não transformar o produto em um kit maior do que a referência visual");
  });

  it("simplifica air fryer, remove especificações e usa cozinha premium", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Fritadeira Air Fryer Britânia BAF95A 9,5L Painel Digital 1800W",
      current_price: 549,
      category: "Cozinha",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Air Fryer Britânia");
    expect(speech).not.toMatch(/fritadeira air fryer/i);
    expect(speech).not.toMatch(/BAF95A/i);
    expect(speech).not.toMatch(/9,5\s*l/i);
    expect(speech).not.toMatch(/1800\s*w/i);
    expect(speech).not.toMatch(/painel digital/i);
    expect(speech).toContain("quinhentos e quarenta e nove reais");
    expect(countWords(speech)).toBeLessThanOrEqual(22);
    expect(prompt).toContain("cozinha residencial contemporânea premium");
    expect(prompt).toContain("Não adicionar alimentos, utensílios, cápsulas, copos, bandejas ou acessórios inexistentes");
  });

  it("usa estúdio tech contemporâneo e preserva apenas acessórios da referência", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Smartphone Samsung Galaxy A55 256GB 5G Bluetooth",
      current_price: 1999,
      category: "Tecnologia",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Smartphone Samsung Galaxy A55");
    expect(speech).not.toMatch(/256\s*gb/i);
    expect(speech).not.toMatch(/\b5g\b/i);
    expect(speech).not.toMatch(/bluetooth/i);
    expect(prompt).toContain("estúdio de tecnologia contemporâneo premium");
    expect(prompt).toContain("evitando aparência de cenário gamer genérico");
    expect(prompt).toContain("Não adicionar cabos, carregadores, capas, controles, suportes, periféricos");
  });

  it("pronuncia modelo comercial numérico por extenso", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Apple iPhone 15 128GB 5G",
      current_price: 4299,
      category: "Tecnologia",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Apple iPhone quinze");
    expect(speech).not.toMatch(/\b15\b/);
    expect(speech).not.toMatch(/128\s*gb/i);
    expect(speech).not.toMatch(/\b5g\b/i);
  });

  it("usa sala premium de home theater para TV", () => {
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
    expect(prompt).toContain("sala contemporânea premium com estética de home theater");
    expect(prompt).toContain("Não inventar soundbar, console, controle remoto, rack");
  });

  it("remove memória e pronuncia número do modelo de notebook por extenso", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Notebook Lenovo IdeaPad Slim 3 512GB 16GB Full HD Wi-Fi",
      current_price: 3299.9,
      category: "Tecnologia",
    });

    const speech = extractSpeech(prompt);

    expect(speech).toContain("Notebook Lenovo IdeaPad Slim três");
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

  it("preserva textos e logotipos originais sem permitir texto novo", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Air Fryer Britânia 5L 1500W",
      current_price: 399,
      category: "Cozinha",
    });

    expect(prompt).toContain("Não adicionar texto novo na tela");
    expect(prompt).toContain("devem ser preservados exatamente como aparecem");
    expect(prompt).toContain("Não substituir \"CAÇA OFERTA\" por qualquer outro nome ou marca");
    expect(prompt).not.toContain("Sem texto na tela.");
  });

  it("mantém preço monetário completo como formato oficial da fala", () => {
    expect(formatLongPriceForSpeech(471.8)).toBe("quatrocentos e setenta e um reais e oitenta centavos");
    expect(formatLongPriceForSpeech(123.9)).toBe("cento e vinte e três reais e noventa centavos");
  });

  it("gera fala natural para tênis sem artigo ou abertura fraca", () => {
    const speech = extractSpeech(buildGeminiVideoPrompt({
      product_name: "Tênis Casual Masculino Caminhada",
      current_price: 89.9,
      category: "Moda"
    }));

    expect(speech).toContain("um Tênis Casual Masculino");
    expect(speech).not.toMatch(/olha\s+ess[ae]/iu);
    expect(speech).not.toMatch(/uma\s+Tênis/iu);
    expect(speech).not.toMatch(/confortável|antiderrapante/iu);
    expect(speech).toContain("Acesse a publicação");
    expect(countWords(speech)).toBeLessThanOrEqual(22);
  });
});
