export type GeminiPromptOffer = {
  product_name: string;
  current_price: number | string;
  old_price?: number | string | null;
  platform?: string | null;
  category?: string | null;
  shipping_free?: boolean | null;
  coupon?: string | null;
  original_url?: string | null;
};

function price(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `R$ ${parsed.toFixed(2).replace(".", ",")}` : null;
}

function discount(current: number | string, old: number | string | null | undefined) {
  const currentValue = Number(current);
  const oldValue = Number(old);
  if (!Number.isFinite(currentValue) || !Number.isFinite(oldValue) || oldValue <= currentValue) return null;
  return Math.round(((oldValue - currentValue) / oldValue) * 100);
}

function actionGuidance(offer: GeminiPromptOffer) {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();
  if (/(batedor|batedeira|fu[eê]|fouet|egg\s*beater)/i.test(searchable)) {
    return `
AÇÃO ESPECÍFICA — BATEDOR MANUAL:
- Use uma única tomada contínua, sem cortes ou troca de cenário.
- No primeiro quadro, mostre o avatar segurando o cabo do batedor pela extremidade superior, com a haste apontada para baixo.
- Coloque somente a parte metálica do batedor dentro de uma tigela estável; a outra mão apenas segura a tigela pela borda.
- Faça movimentos curtos e contínuos de rotação do punho, mantendo o batedor sempre dentro da tigela e na mesma orientação vertical.
- O produto não pode virar, alongar, trocar de cor, ganhar motor, fio, botão ou qualquer peça que não apareça na imagem.
- Termine a tomada retirando lentamente o batedor da tigela e apresentando-o na mesma empunhadura inicial. Nunca termine segurando-o por outra parte.`;
  }
  if (/(cafeteira|chaleira|liquidificador|mixer|air\s*fryer|sanduicheira|panela|processador)/i.test(searchable)) {
    return `
AÇÃO ESPECÍFICA — ELETRO/UTENSÍLIO DE COZINHA:
- Use uma única tomada contínua, sem cortes ou troca de cenário.
- O avatar deve apresentar primeiro o produto parado e depois executar apenas uma ação simples compatível com o formato visível.
- Mantenha mãos, tampa, cabo, botões e recipiente exatamente nas mesmas posições relativas durante toda a ação.
- Não ligue o aparelho, não mostre alimento sendo processado e não invente potência, capacidade ou funções não comprovadas pela imagem.`;
  }
  return `
AÇÕES ESPECÍFICAS DO PRODUTO:
- Use uma única tomada contínua, sem cortes, transições ou troca de cenário.
- Baseie a ação exclusivamente no formato e no uso evidente na imagem anexada e no nome do produto.
- Se o uso não puder ser confirmado, apenas apresente o produto em mãos, sem simular uma função.
- Preserve a mesma empunhadura, orientação, escala, cor e contato entre mãos e produto do início ao fim.`;
}

function speechScript(offer: GeminiPromptOffer, current: string, old: string | null, percentage: number | null) {
  const marketplace = offer.platform ? ` no ${offer.platform}` : "";
  const category = offer.category ? ` para quem pesquisa ${offer.category}` : "";
  const priceLine = old && percentage
    ? `de ${old} por ${current}, com ${percentage}% de desconto verificado`
    : `por ${current}`;

  return `"Olha este achado${marketplace}! Este é o ${offer.product_name}, ${priceLine}.${category}. Gostou? Toque na publicação para conhecer."`;
}

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const current = price(offer.current_price) ?? "preço não informado";
  const old = price(offer.old_price);
  const percentage = discount(offer.current_price, offer.old_price);
  const marketplace = offer.platform || "marketplace não informado";
  const category = offer.category || "categoria não informada";
  const copy = [
    `🚨 OFERTA EM DESTAQUE`,
    `🛍️ ${offer.product_name}`,
    old && percentage ? `💰 De ${old} por ${current} (${percentage}% de desconto)` : `💰 Preço atual: ${current}`,
    offer.shipping_free ? "🚚 Frete grátis" : null,
    offer.coupon ? `🎟️ Cupom: ${offer.coupon}` : null,
    `🏪 Achado no ${marketplace}`,
  ].filter(Boolean).join("\n");

  return `Crie um vídeo vertical realista para Reel/Short, usando obrigatoriamente os dois arquivos anexados:

1. Avatar padrão: Avatar_Anuncio.png. Preserve exatamente o rosto, identidade visual, camiseta, logotipo e proporções do avatar.
2. Produto: imagem do produto selecionado. Reproduza fielmente o formato, cor, textura, escala e detalhes visíveis do produto; não invente características.

Produto: ${offer.product_name}
Categoria: ${category}
Marketplace: ${marketplace}

Direção obrigatória do vídeo:
- Trate a imagem do produto como referência visual bloqueada (product lock): não redesenhe, substitua ou combine o produto com outro.
- Use uma única tomada contínua de 8 a 12 segundos, sem cortes, transições, mudanças de câmera ou salto temporal.
- Planeje três momentos na mesma tomada: 0–2s apresentar parado; 2–8s executar a ação; 8–12s retornar à pose inicial e mostrar o produto.
- A pose final deve preservar a mesma mão dominante, empunhadura, orientação e escala do primeiro quadro.
- Mantenha as duas mãos anatomicamente corretas, com cinco dedos, contato físico consistente e oclusão natural; nunca crie mãos extras, dedos deformados, objetos flutuantes ou troca de empunhadura sem animação intermediária.
- Preserve rosto, identidade, camiseta, logotipo, iluminação e cenário do avatar; não adicione pessoas, objetos ou textos na cena.
- Use enquadramento vertical 9:16, câmera estável, iluminação de estúdio e movimentos lentos e coordenados.
${actionGuidance(offer)}
- Inclua a fala em português do Brasil abaixo, com sincronização labial clara. A fala não autoriza inventar características do produto.

Copy/roteiro exato:
${copy}

Fala sugerida:
${speechScript(offer, current, old, percentage)}

Regras da fala e da estratégia de marketing:
- Use a sequência gancho → produto → preço verificado → contexto da categoria → CTA suave.
- Fale de forma natural, clara e curta; não leia emojis, hashtags ou formatação.
- Não diga “confira as condições”, “link divulgado”, “link abaixo”, “acesse o link”, URL, código de rastreio ou qualquer instrução de link.
- Não mencionar preço sujeito a mudança, urgência, escassez, estoque, garantia ou benefício não comprovado.
- Não criar características, resultados, comparações ou promessas ausentes nos dados fornecidos.
- O CTA deve ser apenas “Toque na publicação para conhecer” ou equivalente neutro, sem referência a link.
- Não exibir preço diferente do informado. Não inserir texto aleatório, marcas d'água ou logotipos adicionais.`;
}
