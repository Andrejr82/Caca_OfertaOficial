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

  return `"Olha este achado${marketplace}! Este é o ${offer.product_name}, ${priceLine},${category}. Gostou? Veja os detalhes desta oferta na publicação."`;
}

export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  const current = price(offer.current_price) ?? "preço não informado";
  const old = price(offer.old_price);
  const percentage = discount(offer.current_price, offer.old_price);
  const marketplace = offer.platform || "marketplace não informado";
  const category = offer.category || "categoria não informada";

  const hashtags = [
    "#oferta",
    "#achadinhos",
    "#promocao",
    offer.platform ? `#${offer.platform.replace(/\s+/g, '').toLowerCase()}` : null,
    offer.category ? `#${offer.category.replace(/\s+/g, '').toLowerCase()}` : null
  ].filter(Boolean).join(" ");

  const copy = [
    `🚨 OFERTA EM DESTAQUE`,
    `🛍️ ${offer.product_name}`,
    old && percentage ? `💰 De ${old} por ${current} (${percentage}% de desconto)` : `💰 Preço atual: ${current}`,
    offer.shipping_free ? "🚚 Frete grátis" : null,
    offer.coupon ? `🎟️ Cupom: ${offer.coupon}` : null,
    `🏪 Achado no ${marketplace}`,
    ``,
    hashtags
  ].filter(Boolean).join("\n");

  return `Crie um vídeo vertical realista para Reel/Short, usando obrigatoriamente os dois arquivos anexados:

1. Avatar padrão: Avatar_Silvia.png. Preserve exatamente o rosto, identidade, aparência feminina, cabelo, camiseta, logotipo, iluminação, cenário e proporções do avatar.
2. Produto (OBJECT LOCK - OBRIGATÓRIO): A imagem do produto anexada é um ativo bloqueado (locked asset).

Produto: ${offer.product_name}
Categoria: ${offer.category || "Ofertas em Geral"}
Marketplace: ${offer.platform}

DIRETRIZES DE OBJECT LOCK (PROIBIÇÕES ABSOLUTAS):
- É expressamente PROIBIDO redesenhar o produto, alterar formato, recriar embalagem, alterar proporções, cores, textos ou remover/adicionar elementos.
- Zero redesign, zero reinterpretation, zero stylization.
- Pixel-level fidelity whenever possible. O vídeo deve manter identidade visual idêntica à foto anexada.

DIREÇÃO DE CENA E AÇÃO:
- O produto deve aparecer como um gráfico flutuante (picture-in-picture) ou posicionado de forma estática no cenário ao lado do avatar.
- O avatar NÃO DEVE tocar, segurar (empunhar) ou interagir fisicamente com o produto. O avatar deve apenas apontar, gesticular em direção ao produto e sorrir de forma natural.
- Use uma única tomada contínua de 8 a 10 segundos, sem cortes, transições, mudanças de câmera ou salto temporal.
- Preserve rosto, identidade, camiseta, logotipo, iluminação e cenário do avatar original. Não adicione pessoas, objetos extras ou textos flutuantes (exceto o próprio produto).
- Enquadramento vertical 9:16, câmera estável, iluminação de estúdio e movimentos lentos e coordenados.

FALA E SINCRONIZAÇÃO LABIAL:
Inclua a fala em português do Brasil abaixo, com sincronização labial precisa. A voz deve ser feminina adulta, natural, clara e acolhedora. Mantenha a mesma voz durante todo o vídeo, sem alternância de voz masculina. Faça sincronização labial precisa.

Regras da fala e da estratégia de marketing:
- Use a sequência gancho → produto → preço verificado → contexto da categoria → CTA suave.
- Fale de forma natural, clara e curta; não leia emojis, hashtags ou formatação.
- Não diga “confira as condições”, “link divulgado”, “link abaixo”, “acesse o link”, URL, código de rastreio ou qualquer instrução de link.
- Não mencionar preço sujeito a mudança, urgência, escassez, estoque, garantia ou benefício não comprovado.
- Não criar características, resultados, comparações ou promessas ausentes nos dados fornecidos.
- O CTA falado deve ser neutro e funcionar nos dois canais: “Veja os detalhes desta oferta na publicação”, sem referência a link.
- A legenda será adaptada pelo sistema: Instagram direciona para a vitrine da bio; Facebook usa o link clicável da publicação.
- Não exibir preço diferente do informado. Não inserir texto aleatório, marcas d'água ou logotipos adicionais.`;
}
