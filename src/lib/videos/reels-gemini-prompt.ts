export type ReelsGeminiOffer = {
  product_name: string;
  platform?: string | null;
};

type ReelsPromptCategory =
  | "ferramentas"
  | "moda"
  | "beleza"
  | "casa_cozinha"
  | "limpeza"
  | "eletronicos"
  | "pet"
  | "fitness"
  | "geral";

function classify(offer: ReelsGeminiOffer): ReelsPromptCategory {
  const text = offer.product_name.toLowerCase();
  if (/(serra|esmerilhadeira|lixadeira|martelete|parafusadeira|furadeira|chave de impacto|makita|dewalt|bosch|ferramenta)/i.test(text)) return "ferramentas";
  if (/(vestido|blusa|camisa|camiseta|cal[cç]a|short|saia|roupa|t[eê]nis|sapato|sand[aá]lia|bota)/i.test(text)) return "moda";
  if (/(maquiagem|batom|r[ií]mel|creme|s[eé]rum|perfume|shampoo|cabelo|beleza|barbeador|aparador)/i.test(text)) return "beleza";
  if (/(panela|air\s*fryer|fritadeira|cafeteira|liquidificador|cozinha|forno|micro-ondas|chaleira)/i.test(text)) return "casa_cozinha";
  if (/(limpeza|percarbonato|tira manchas|esponja|mop|aspirador|lavadora)/i.test(text)) return "limpeza";
  if (/(console|game|gamer|smartphone|celular|fone|headset|caixa de som|notebook|tablet|tv|power bank|carregador)/i.test(text)) return "eletronicos";
  if (/(gato|cachorro|pet|coleira|comedouro)/i.test(text)) return "pet";
  if (/(academia|fitness|yoga|halter|treino|esporte|ciclismo|corrida)/i.test(text)) return "fitness";
  return "geral";
}

function direction(category: ReelsPromptCategory) {
  switch (category) {
    case "ferramentas":
      return {
        action: "Comece com a ferramenta já sendo posicionada ou usada por mãos adultas. Mostre uma ação principal clara e controlada em bancada ou oficina limpa. Finalize com a ferramenta ainda visível e reconhecível.",
        restriction: "Não invente disco, broca, bateria, acessórios, potência, capacidade ou função que a imagem não sustente.",
        audio: "Use som ambiente coerente com a ferramenta; se isso não for adequado, use música instrumental discreta.",
      };
    case "moda":
      return {
        action: "Comece com a peça já vestida. Mostre um movimento curto e natural, como caminhar ou girar levemente, para revelar o caimento sem mudar o produto.",
        restriction: "Não invente tecido, transparência, bolsos, botões, estampas ou detalhes não visíveis.",
        audio: "Use música instrumental discreta.",
      };
    case "beleza":
      return {
        action: "Comece com o produto já sendo segurado, aberto ou aplicado somente quando a forma de uso for evidente. Mostre uma única demonstração visual simples.",
        restriction: "Não invente antes/depois, resultado clínico, duração, hidratação ou benefício não verificável.",
        audio: "Use música instrumental discreta ou som ambiente suave.",
      };
    case "casa_cozinha":
      return {
        action: "Comece com o produto já preparado para a função principal. Mostre uma sequência curta de uso e um resultado visual diretamente observável.",
        restriction: "Não invente alimentos, acessórios, potência, capacidade, modos ou peças extras.",
        audio: "Use som ambiente coerente com o uso ou música instrumental discreta.",
      };
    case "limpeza":
      return {
        action: "Comece com uma tarefa doméstica simples já em andamento. Mostre aplicação e resultado visual moderado, sem cortes excessivos.",
        restriction: "Não invente desinfecção, remoção total, ação química ou eficácia não comprovável visualmente.",
        audio: "Use som ambiente leve ou música instrumental discreta.",
      };
    case "eletronicos":
      return {
        action: "Comece com o dispositivo já sendo segurado, ligado ou operado. Mostre uma ação simples e visível, mantendo tela, portas, botões e formato consistentes.",
        restriction: "Não invente interface, aplicativos, autonomia, memória, desempenho ou conectividade.",
        audio: "Use música instrumental discreta ou som ambiente coerente.",
      };
    case "pet":
      return {
        action: "Comece com interação natural entre o animal e o produto. Preserve o produto reconhecível durante toda a cena.",
        restriction: "Não invente benefícios veterinários, redução de ansiedade ou comportamento garantido.",
        audio: "Use som ambiente natural ou música instrumental discreta.",
      };
    case "fitness":
      return {
        action: "Comece com o produto já em uso por uma pessoa adulta. Mostre uma ação simples, segura e visualmente clara.",
        restriction: "Não invente carga, resistência, emagrecimento, ganho muscular ou benefício médico.",
        audio: "Use som ambiente leve ou música instrumental discreta.",
      };
    default:
      return {
        action: "Comece com o produto já em interação ou uso. Mostre um único movimento principal, simples e natural, evitando uma apresentação estática longa.",
        restriction: "Não invente características técnicas, benefícios, materiais, acessórios ou funções não verificáveis.",
        audio: "Use som ambiente coerente ou música instrumental discreta.",
      };
  }
}

export function buildReelsGeminiPrompt(offer: ReelsGeminiOffer) {
  const category = classify(offer);
  const rules = direction(category);

  return `Crie um Reel vertical 9:16 de aproximadamente 8 segundos usando a imagem anexada como referência visual principal do produto: ${offer.product_name}.

AÇÃO
${rules.action}

FIDELIDADE
Mantenha exatamente o mesmo produto em todos os frames: formato, cor, proporções, componentes e marca visível.
Não redesenhe, substitua ou estilize o produto.
Não invente acessórios, peças, textos ou logotipos.
${rules.restriction}

CÂMERA
Movimento estável e suave. Priorize ângulos próximos aos já visíveis na imagem. Evite 360 graus, zoom agressivo e cortes rápidos.

ÁUDIO
${rules.audio}
Sem narração, diálogo ou voz humana.

SAÍDA
Sem preço, sem texto promocional e sem CTA dentro do vídeo.
O primeiro segundo deve ter ação visual clara.
O produto deve permanecer reconhecível até o último frame.`;
}
