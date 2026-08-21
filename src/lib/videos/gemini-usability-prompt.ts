export type GeminiUsabilityOffer = {
  product_name: string;
  current_price: number | string;
  platform?: string | null;
  category?: string | null;
  short_name?: string | null;
};

export type GeminiUsabilityCategory =
  | "moda"
  | "beleza"
  | "casa_cozinha"
  | "ferramentas"
  | "utilidades"
  | "eletronicos"
  | "pet"
  | "fitness"
  | "bebe_crianca"
  | "acessorios"
  | "organizacao_limpeza"
  | "geral";

const CATEGORY_LABELS: Record<GeminiUsabilityCategory, string> = {
  moda: "Moda e vestuário",
  beleza: "Beleza e autocuidado",
  casa_cozinha: "Casa e cozinha",
  ferramentas: "Ferramentas",
  utilidades: "Utilidades domésticas",
  eletronicos: "Eletrônicos e games",
  pet: "Pet",
  fitness: "Fitness e esporte",
  bebe_crianca: "Bebê e criança",
  acessorios: "Acessórios",
  organizacao_limpeza: "Organização e limpeza",
  geral: "Produto físico",
};

function searchable(offer: GeminiUsabilityOffer) {
  return `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();
}

export function classifyGeminiUsabilityCategory(offer: GeminiUsabilityOffer): GeminiUsabilityCategory {
  const text = searchable(offer);
  if (/(vestido|sa[ií]da de praia|blusa|camisa|camiseta|cal[cç]a|short|saia|suti[aã]|top|roupa|moda|vestu[aá]rio|t[eê]nis|sapato|sand[aá]lia|bota)/i.test(text)) return "moda";
  if (/(maquiagem|corretiv|batom|r[ií]mel|creme|s[eé]rum|perfume|shampoo|cabelo|beleza|barbeador|aparador)/i.test(text)) return "beleza";
  if (/(panela|air\s*fryer|fritadeira|cafeteira|liquidificador|cozinha|forno|micro-ondas|chaleira|cozedor)/i.test(text)) return "casa_cozinha";
  if (/(serra|serra circular|serra tico[- ]?tico|esmerilhadeira|lixadeira|martelete|parafusadeira|furadeira|chave de impacto|ferramenta el[eé]trica|makita|dewalt|bosch)/i.test(text)) return "ferramentas";
  if (/(organizador|limpeza|percarbonato|tira manchas|esponja|escova de limpeza|mop|aspirador|lavadora)/i.test(text)) return "organizacao_limpeza";
  if (/(console|game|gamer|controle|smartphone|celular|fone|headset|caixa de som|eletr[oô]nico|notebook|tablet|tv|televisor|power bank|carregador)/i.test(text)) return "eletronicos";
  if (/(gato|cachorro|pet|cama pet|brinquedo.*gato|coleira|comedouro)/i.test(text)) return "pet";
  if (/(academia|fitness|yoga|el[aá]stic|halter|treino|esporte|ciclismo|corrida)/i.test(text)) return "fitness";
  if (/(beb[eê]|infantil|crian[cç]a|mamadeira|carrinho de beb[eê]|brinquedo infantil)/i.test(text)) return "bebe_crianca";
  if (/(bolsa|colar|pulseira|anel|brinco|rel[oó]gio|carteira|[oó]culos|acess[oó]rio)/i.test(text)) return "acessorios";
  if (/(trip[eé]|lanterna|costura|m[aá]quina de costura|utilidade)/i.test(text)) return "utilidades";
  return "geral";
}

type MotionDirection = {
  scene: string;
  motion: string;
  environment: string;
  restriction: string;
  audio: string;
};

function categoryDirection(category: GeminiUsabilityCategory): MotionDirection {
  switch (category) {
    case "ferramentas":
      return {
        scene: "começar com a ferramenta já em ação ou sendo posicionada para uso, evitando uma abertura longa com o produto parado",
        motion: "mãos adultas seguram e usam a ferramenta de forma controlada; a câmera acompanha o movimento suavemente e termina com o produto claramente visível",
        environment: "bancada ou oficina limpa, realista e sem poluição visual",
        restriction: "não inventar disco, broca, bateria, acessórios, potência, capacidade ou funções que não estejam sustentados pela imagem",
        audio: "som ambiente coerente com o uso da ferramenta; se isso não for apropriado, usar música instrumental discreta",
      };
    case "moda":
      return {
        scene: "começar com a peça já vestida em enquadramento que mostre rapidamente o caimento",
        motion: "a pessoa adulta faz um movimento simples, como caminhar ou girar levemente, sem mudar a peça",
        environment: "ambiente editorial clean com luz natural suave",
        restriction: "não inventar tecido, transparência, bolsos, botões, estampas ou detalhes não visíveis",
        audio: "música instrumental discreta",
      };
    case "beleza":
      return {
        scene: "começar com o produto já sendo segurado ou aberto de forma visualmente clara",
        motion: "mãos adultas demonstram manuseio ou aplicação somente quando o uso for evidente pela própria referência",
        environment: "bancada de beleza limpa e iluminada",
        restriction: "não inventar antes/depois, resultado clínico, hidratação, duração ou benefício não verificável",
        audio: "música instrumental discreta ou som ambiente suave",
      };
    case "casa_cozinha":
      return {
        scene: "começar com o produto já posicionado para sua função principal",
        motion: "mostrar preparação curta, uso simples e resultado visual diretamente observável",
        environment: "cozinha residencial limpa e funcional",
        restriction: "não inventar alimentos, acessórios, potência, capacidade, modos ou peças extras",
        audio: "som ambiente coerente com a utilização ou música instrumental discreta",
      };
    case "organizacao_limpeza":
      return {
        scene: "começar com uma tarefa doméstica simples já em andamento",
        motion: "mostrar aplicação e resultado visual moderado, sem cortes excessivos",
        environment: "área doméstica clara e realista",
        restriction: "não inventar desinfecção, remoção total, ação química ou eficácia não comprovável visualmente",
        audio: "som ambiente leve ou música instrumental discreta",
      };
    case "eletronicos":
      return {
        scene: "começar com o dispositivo já sendo segurado, ligado ou operado",
        motion: "mãos adultas demonstram uma ação simples e visível, mantendo tela, portas, botões e formato consistentes",
        environment: "mesa ou setup clean com foco no dispositivo",
        restriction: "não inventar interface, jogos, aplicativos, autonomia, memória, desempenho ou conectividade",
        audio: "música instrumental discreta ou som ambiente coerente",
      };
    case "pet":
      return {
        scene: "começar com interação natural entre o animal e o produto",
        motion: "o animal interage espontaneamente enquanto o produto permanece reconhecível",
        environment: "ambiente doméstico confortável e seguro",
        restriction: "não inventar benefícios veterinários, redução de ansiedade ou comportamento garantido",
        audio: "som ambiente natural ou música instrumental discreta",
      };
    case "fitness":
      return {
        scene: "começar com o produto já em uso em movimento controlado",
        motion: "uma pessoa adulta executa uma ação simples e segura que mostre claramente a função",
        environment: "ambiente de treino clean e profissional",
        restriction: "não inventar carga, resistência, emagrecimento, ganho muscular ou benefício médico",
        audio: "som ambiente leve ou música instrumental discreta",
      };
    case "bebe_crianca":
      return {
        scene: "começar com o produto sendo demonstrado por mãos adultas",
        motion: "mostrar apenas manuseio simples e seguro, evitando inferir uso que a imagem não sustenta",
        environment: "ambiente familiar claro e neutro",
        restriction: "não inventar idade recomendada, certificação, segurança ou benefício de desenvolvimento",
        audio: "música instrumental discreta",
      };
    case "acessorios":
      return {
        scene: "começar com o acessório já sendo usado ou segurado",
        motion: "movimento curto para mostrar escala, posição e acabamento visível",
        environment: "ambiente editorial clean e discreto",
        restriction: "não inventar material, banho, resistência, medidas ou autenticidade",
        audio: "música instrumental discreta",
      };
    case "utilidades":
      return {
        scene: "começar com o produto já sendo manuseado para sua função principal",
        motion: "mãos adultas demonstram a função com movimento simples e claro",
        environment: "ambiente funcional limpo e coerente com o produto",
        restriction: "não inventar potência, capacidade, durabilidade, compatibilidade ou acessórios",
        audio: "som ambiente coerente ou música instrumental discreta",
      };
    default:
      return {
        scene: "começar com o produto já em interação ou uso, evitando apresentação estática longa",
        motion: "mostrar um único movimento principal, simples e natural, mantendo o produto reconhecível",
        environment: "ambiente realista, limpo e coerente com o tipo de produto",
        restriction: "não inventar características técnicas, benefícios, materiais, acessórios ou funções não verificáveis",
        audio: "som ambiente coerente ou música instrumental discreta",
      };
  }
}

export function buildGeminiUsabilityPrompt(offer: GeminiUsabilityOffer) {
  const category = classifyGeminiUsabilityCategory(offer);
  const direction = categoryDirection(category);
  const product = offer.short_name?.trim() || offer.product_name.trim();

  return `PROMPT PARA GEMINI — REEL DE USABILIDADE

PRODUTO: ${product}
CATEGORIA: ${CATEGORY_LABELS[category]}

Use a imagem anexada como referência visual principal do produto.
Crie um vídeo vertical 9:16 de aproximadamente 8 segundos, com aparência realista e natural para Reels.

AÇÃO PRINCIPAL
${direction.scene}.
${direction.motion}.

AMBIENTE
${direction.environment}.

CÂMERA
Movimento estável e suave. Priorize enquadramentos próximos aos ângulos já visíveis na imagem. Evite 360 graus, zoom agressivo e cortes rápidos.

FIDELIDADE
Mantenha o mesmo produto em todos os frames: formato, cor, proporções, componentes e marca visível.
Não redesenhar nem substituir o produto.
Não inventar acessórios, peças ou textos.
${direction.restriction}.

ÁUDIO
${direction.audio}.
Sem narração. Sem diálogo. Sem voz humana.

SAÍDA
Sem preço, sem legenda promocional e sem CTA dentro do vídeo.
O primeiro segundo deve ter ação visual clara.
O produto deve permanecer reconhecível até o último frame.`;
}
