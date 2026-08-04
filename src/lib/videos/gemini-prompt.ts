export type GeminiPromptOffer = {
  product_name: string;
  current_price: number | string;
  old_price?: number | string | null;
  platform?: string | null;
  category?: string | null;
  shipping_free?: boolean | null;
  coupon?: string | null;
  original_url?: string | null;
  short_name?: string | null;
};

// --- FUNÇÕES DE PREÇO POR EXTENSO ---
function numeroPorExtenso(num: number): string {
  if (num === 0) return 'zero';
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (num < 20) return unidades[num];
  if (num < 100) return dezenas[Math.floor(num / 10)] + (num % 10 !== 0 ? ' e ' + unidades[num % 10] : '');
  if (num === 100) return 'cem';
  if (num < 1000) return centenas[Math.floor(num / 100)] + (num % 100 !== 0 ? ' e ' + numeroPorExtenso(num % 100) : '');
  if (num < 1000000) return (num >= 1000 && num < 2000 ? 'mil' : numeroPorExtenso(Math.floor(num / 1000)) + ' mil') + (num % 1000 !== 0 ? (num % 1000 < 100 || (num % 1000) % 100 === 0 ? ' e ' : ' ') + numeroPorExtenso(num % 1000) : '');
  return num.toString();
}

function precoPorExtenso(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "preço não informado";
  const num = Number(valor);
  if (!Number.isFinite(num)) return String(valor);

  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);
  
  let extenso = '';
  if (reais > 0) extenso += numeroPorExtenso(reais) + (reais === 1 ? ' real' : ' reais');
  if (centavos > 0) extenso += (reais > 0 ? ' e ' : '') + numeroPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  
  return extenso || 'zero reais';
}
// ------------------------------------

// 1. GERAÇÃO DINÂMICA DO MICRO-CENÁRIO (formato fluido, validado no Google Flow)
function scenarioGuidance(offer: GeminiPromptOffer): string {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();

  if (/(roteador|celular|smartphone|notebook|pc|gamer|wi-fi|tecnologia|eletrônico)/i.test(searchable)) {
    return `À direita dela, exiba exatamente um único exemplar do produto da imagem de referência sobre um expositor tecnológico com superfície preta refletiva e leves feixes de luz neon azul. O estúdio ao fundo tem uma estética gamer premium: ambiente escuro com ondas digitais sutis e iluminação RGB, transmitindo velocidade e conectividade.`;
  }
  if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|cozinha)/i.test(searchable)) {
    return `À direita dela, exiba exatamente um único exemplar do produto da imagem de referência sobre uma bancada de granito iluminada com luz quente e aconchegante. O estúdio ao fundo tem uma estética de cozinha moderna premium: tons quentes com madeira e metal escovado, transmitindo praticidade e sofisticação.`;
  }
  if (/(shampoo|máscara|kit|beleza|maquiagem|cabelo|pele)/i.test(searchable)) {
    return `À direita dela, exiba exatamente um único exemplar do produto da imagem de referência sobre uma base de mármore claro com iluminação difusa e suave. O estúdio ao fundo tem uma estética de spa e beleza premium: tons rosados e dourados suaves, transmitindo autocuidado e luxo.`;
  }
  if (/(tênis|tenis|roupa|moda|vestuário|calcado|calçado|sapato|sandalia|bota)/i.test(searchable)) {
    return `À direita dela, exiba exatamente um único exemplar do produto da imagem de referência sobre um expositor minimalista estilo vitrine esportiva, com piso refletivo escuro e iluminação direcional que destaca as cores do calçado. O estúdio ao fundo tem uma estética esportiva premium: paredes escuras com detalhes de luz neon laranja e cinza suaves, transmitindo a energia de uma loja de artigos esportivos de alto padrão.`;
  }
  return `À direita dela, exiba exatamente um único exemplar do produto da imagem de referência sobre uma base de exibição elegante com iluminação suave e direcional. O estúdio ao fundo tem uma estética publicitária premium: fundo escuro neutro com iluminação volumétrica suave, transmitindo qualidade e exclusividade.`;
}

// 2. GERAÇÃO DINÂMICA DA FALA
function speechScript(offer: GeminiPromptOffer) {
  const marketplace = offer.platform ? ` na ${offer.platform}` : "";
  const extenso = precoPorExtenso(offer.current_price);
  
  const prefix = `"Olha este achado${marketplace}! Este é o `;
  const suffix = `. Só ${extenso}. Os detalhes estão na publicação!"`;
  
  let shortName = offer.short_name ? offer.short_name.trim() : offer.product_name;
  
  return `${prefix}${shortName}${suffix}`;
}

// 3. MONTAGEM DO PROMPT MESTRE (formato fluido validado no Google Flow)
export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  return `Avatar_Silvia fala diretamente para a câmera com expressão entusiasmada e natural, com leves acenos de cabeça, piscadas e gestos suaves com as mãos. ${scenarioGuidance(offer)} A câmera mantém plano médio fixo sem cortes, sem zoom. Iluminação cinematográfica focada no produto interagindo volumetricamente com o ambiente ao fundo. Imagem fotorrealista em 4K, estética publicitária premium, vídeo completamente limpo sem nenhum texto, número, legenda ou marca d'água na tela. Lipsync: ${speechScript(offer)}`;
}

