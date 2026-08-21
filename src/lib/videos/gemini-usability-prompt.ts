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
  if (/(organizador|limpeza|percarbonato|tira manchas|esponja|escova de limpeza|mop|aspirador|lavadora)/i.test(text)) return "organizacao_limpeza";
  if (/(console|game|gamer|controle|smartphone|celular|fone|headset|caixa de som|eletr[oô]nico|notebook|tablet|tv|televisor|power bank|carregador)/i.test(text)) return "eletronicos";
  if (/(gato|cachorro|pet|cama pet|brinquedo.*gato|coleira|comedouro)/i.test(text)) return "pet";
  if (/(academia|fitness|yoga|el[aá]stic|halter|treino|esporte|ciclismo|corrida)/i.test(text)) return "fitness";
  if (/(beb[eê]|infantil|crian[cç]a|mamadeira|carrinho de beb[eê]|brinquedo infantil)/i.test(text)) return "bebe_crianca";
  if (/(bolsa|colar|pulseira|anel|brinco|rel[oó]gio|carteira|[oó]culos|acess[oó]rio)/i.test(text)) return "acessorios";
  if (/(ferramenta|parafusadeira|furadeira|trip[eé]|lanterna|costura|m[aá]quina de costura|utilidade)/i.test(text)) return "utilidades";
  return "geral";
}

function categoryDirection(category: GeminiUsabilityCategory) {
  switch (category) {
    case "moda":
      return {
        environment: "ambiente elegante e coerente com o uso da peça, com luz natural suave e estética editorial premium",
        use: "mostrar uma pessoa adulta usando exatamente a mesma peça, primeiro de frente, depois caminhando suavemente para revelar caimento e movimento natural",
        focus: "caimento, proporções, comprimento, detalhes visíveis, movimento do tecido e aparência durante o uso",
        restrictions: "não inventar parte traseira complexa, tecido, composição, transparência, tamanho, bolsos, botões, estampas ou detalhes não visíveis na referência",
      };
    case "beleza":
      return {
        environment: "beauty studio clean e premium, com iluminação suave, bancada discreta e aparência profissional",
        use: "mostrar mãos adultas segurando e aplicando o produto apenas quando a forma de uso for evidente pela própria referência; caso contrário, demonstrar embalagem, abertura e manuseio seguro",
        focus: "forma de uso observável, textura/aplicação somente quando visível, ergonomia e apresentação real do produto",
        restrictions: "não inventar resultados clínicos, antes/depois, cobertura, hidratação, duração, efeito terapêutico ou qualquer benefício não verificável",
      };
    case "casa_cozinha":
      return {
        environment: "cozinha residencial contemporânea, limpa e funcional, com bancada neutra e iluminação quente",
        use: "mostrar o produto sendo posicionado e utilizado em sua função principal somente com elementos necessários e coerentes com a referência",
        focus: "sequência prática de preparação, uso e resultado funcional visível",
        restrictions: "não inventar alimentos, acessórios, potência, capacidade, modos, peças extras ou funcionalidades não observadas",
      };
    case "organizacao_limpeza":
      return {
        environment: "área doméstica clara, limpa e realista, com enquadramento de demonstração",
        use: "mostrar o produto sendo aplicado ou utilizado em uma tarefa doméstica simples e visualmente segura, sem prometer desempenho além do que pode ser visto",
        focus: "problema visual simples, aplicação correta e resultado visual moderado e plausível",
        restrictions: "não inventar desinfecção, remoção total, ação química, segurança para superfícies, composição ou eficácia não verificável",
      };
    case "eletronicos":
      return {
        environment: "mesa ou setup contemporâneo premium, organizado, com iluminação controlada e foco no dispositivo",
        use: "mostrar mãos adultas ligando, segurando ou usando o produto de forma coerente, sem alterar tela, portas, botões ou acessórios da referência",
        focus: "ergonomia, operação visível, tela quando houver, controles físicos e situação real de uso",
        restrictions: "não inventar interface, jogos, aplicativos, autonomia, desempenho, memória, conectividade ou acessórios não visíveis",
      };
    case "pet":
      return {
        environment: "ambiente doméstico confortável e seguro para animais, iluminado naturalmente",
        use: "mostrar um animal doméstico interagindo naturalmente com o produto, sem forçar comportamento e mantendo o item plenamente reconhecível",
        focus: "interação, escala real, forma de uso e resposta natural do animal",
        restrictions: "não inventar benefícios veterinários, redução de ansiedade, segurança garantida, resistência ou comportamento específico",
      };
    case "fitness":
      return {
        environment: "ambiente de treino clean e profissional, sem excesso de equipamentos",
        use: "mostrar uma pessoa adulta utilizando o produto em movimento controlado, com técnica simples e segura",
        focus: "uso, amplitude de movimento, ergonomia e proporção real",
        restrictions: "não inventar carga, resistência, ganho muscular, emagrecimento, desempenho ou benefício médico",
      };
    case "bebe_crianca":
      return {
        environment: "ambiente familiar claro e seguro, com estética neutra e cuidadosa",
        use: "priorizar demonstração por mãos adultas; evitar colocar criança em situação de risco ou inferir uso não evidente",
        focus: "forma, montagem simples quando visível, escala e manuseio",
        restrictions: "não inventar idade recomendada, certificação, segurança, desenvolvimento cognitivo ou propriedades não verificáveis",
      };
    case "acessorios":
      return {
        environment: "estúdio editorial clean com luz suave e fundo discreto",
        use: "mostrar uma pessoa adulta usando ou segurando o acessório em ângulos próximos aos visíveis na referência",
        focus: "escala, acabamento visual, caimento/posição e aparência no uso",
        restrictions: "não inventar material, banho, resistência, medidas, autenticidade de pedras ou propriedades não observadas",
      };
    case "utilidades":
      return {
        environment: "ambiente funcional coerente com o uso do produto, limpo e profissional",
        use: "mostrar mãos adultas realizando a função principal de maneira simples, controlada e segura",
        focus: "problema prático, gesto de uso e resultado funcional diretamente observável",
        restrictions: "não inventar potência, capacidade, durabilidade, compatibilidade, materiais ou acessórios não visíveis",
      };
    default:
      return {
        environment: "ambiente realista e coerente com a categoria do produto, limpo, premium e sem poluição visual",
        use: "mostrar uma pessoa adulta ou mãos adultas interagindo com o produto apenas de maneira compatível com o que a imagem permite concluir",
        focus: "forma, escala, manuseio, situação de uso e resultado visual direto",
        restrictions: "não inventar características técnicas, benefícios, acessórios, materiais, textos, marcas ou funções não verificáveis",
      };
  }
}

const FIXED_IDENTITY_RULES = `REGRA CRÍTICA — IDENTIDADE E FIDELIDADE DO PRODUTO

Use a imagem anexada como REFERÊNCIA VISUAL PRINCIPAL, ABSOLUTA E OBRIGATÓRIA.
O produto do primeiro ao último frame deve parecer o MESMO OBJETO FÍSICO da imagem original.

Preservar exatamente, quando visíveis:
- formato e proporções;
- cor e acabamento;
- peças e componentes;
- textos, logotipos, números, etiquetas e símbolos;
- quantidade de itens;
- detalhes de construção.

NÃO redesenhar, substituir, estilizar ou "melhorar" o produto.
NÃO inventar acessórios, peças, embalagens, marcas, textos, recursos ou componentes ausentes.
NÃO criar ângulos extremos que obriguem a IA a inventar lados não mostrados.
Se houver conflito entre estética cinematográfica e fidelidade, preservar o produto.`;

export function buildGeminiUsabilityPrompt(offer: GeminiUsabilityOffer) {
  const category = classifyGeminiUsabilityCategory(offer);
  const direction = categoryDirection(category);
  const product = offer.short_name?.trim() || offer.product_name.trim();

  return `PROMPT PARA GEMINI — VÍDEO DE USABILIDADE DO PRODUTO

PRODUTO: ${product}
CATEGORIA DE ROTEIRO: ${CATEGORY_LABELS[category]}
MARKETPLACE: ${offer.platform ?? "não informado"}

OBJETIVO
Crie um vídeo publicitário hiper-realista de aproximadamente 15 segundos demonstrando a USABILIDADE VISUAL do produto da imagem anexada.
O vídeo deve ajudar uma pessoa a entender rapidamente como o produto fica, é manuseado ou funciona em uma situação de uso realista.
Priorize demonstração do produto. NÃO usar avatar apresentando oferta.

${FIXED_IDENTITY_RULES}

1. CONFIGURAÇÃO DO VÍDEO
- duração aproximada: 15 segundos;
- formato vertical 9:16;
- alta resolução;
- aparência de comercial profissional;
- movimentos naturais e câmera estável;
- somente música instrumental de fundo;
- sem narração;
- sem diálogos;
- sem voz humana;
- sem texto promocional na tela;
- sem preço escrito no vídeo.

2. AMBIENTE
${direction.environment}.
O cenário serve apenas para contextualizar a utilização e nunca deve competir com o produto.

3. SEQUÊNCIA OBRIGATÓRIA

CENA 1 — 0–3s — APRESENTAÇÃO
Começar mostrando exatamente o produto da imagem de referência. Enquadramento próximo ao original, com aproximação lenta e controlada. Destacar apenas características realmente visíveis.

CENA 2 — 3–6s — PREPARAÇÃO PARA USO
Mostrar ${direction.use}. Não alterar geometria, cor, quantidade ou componentes do produto.

CENA 3 — 6–9s — USABILIDADE PRINCIPAL
Executar a ação principal de uso de forma natural, lenta e compreensível. O produto deve permanecer totalmente reconhecível. Foco em: ${direction.focus}.

CENA 4 — 9–12s — DETALHE / RESULTADO
Mostrar detalhe funcional ou resultado visual diretamente observável, sem exagero e sem alegações que a imagem não sustente. Preferir ângulo frontal, três-quartos ou lateral suave.

CENA 5 — 12–15s — HERO SHOT FINAL
Finalizar com o produto claramente visível, em situação de uso ou logo após o uso. Fazer aproximação muito suave. Fundo discretamente desfocado. Encerrar com a mesma identidade visual do primeiro frame.

4. CONSISTÊNCIA ENTRE FRAMES
- mesmo produto em todas as cenas;
- mesma cor, forma e proporções;
- mesmos textos/logotipos quando existirem;
- nada aparece ou desaparece sem base na referência;
- não trocar modelo, variante, tamanho aparente ou quantidade;
- não deformar mãos, corpo, produto ou acessórios.

5. MOVIMENTO DE CÂMERA
Utilizar aproximações lentas, acompanhamento suave e ângulos conservadores.
Evitar 360 graus, cortes agressivos, zoom rápido, câmera excessivamente próxima ou ângulos que exijam inventar detalhes.

6. NÃO INVENTAR CARACTERÍSTICAS
${direction.restrictions}.
Demonstrar somente o que é visualmente plausível a partir da imagem e do próprio tipo de produto.

7. PRIORIDADE DA GERAÇÃO
1. fidelidade à imagem original;
2. mesmo produto em todos os frames;
3. usabilidade clara;
4. movimento humano/objeto realista;
5. resultado visual plausível;
6. qualidade cinematográfica.

8. RESULTADO ESPERADO
Vídeo vertical de usabilidade, pronto para Reels, Facebook, Stories e e-commerce, com aparência premium e foco integral no produto.
SEM AVATAR OFERTANDO.
SEM NARRAÇÃO.
SEM DIÁLOGOS.
SEM VOZ HUMANA.
SEM TEXTOS PROMOCIONAIS.
APENAS MÚSICA INSTRUMENTAL DE FUNDO.`;
}
