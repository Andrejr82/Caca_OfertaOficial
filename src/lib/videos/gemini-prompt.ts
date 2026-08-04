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

// 1. GERAÇÃO DINÂMICA DO MICRO-CENÁRIO
function scenarioGuidance(offer: GeminiPromptOffer) {
  const searchable = `${offer.product_name} ${offer.category ?? ""}`.toLowerCase();
  
  let thematicBackground = "Crie um fundo temático elegante e neutro ao redor do produto (ex: uma base de exibição limpa com iluminação suave), transmitindo a ideia de qualidade e destaque.";
  
  if (/(roteador|celular|smartphone|notebook|pc|gamer|wi-fi|tecnologia|eletrônico)/i.test(searchable)) {
    thematicBackground = "Crie um fundo temático tecnológico ao redor do produto (ex: uma mesa gamer moderna e escura, com leves feixes de luz neon azul ou ondas digitais sutis flutuando ao fundo, transmitindo a ideia de velocidade e conexão).";
  } else if (/(batedor|batedeira|cafeteira|liquidificador|air\s*fryer|cozinha)/i.test(searchable)) {
    thematicBackground = "Crie um fundo temático de cozinha moderna ao redor do produto (ex: uma bancada de granito ou mármore limpa, com luzes quentes e acolhedoras, transmitindo a ideia de praticidade no lar).";
  } else if (/(shampoo|máscara|kit|beleza|maquiagem|cabelo|pele)/i.test(searchable)) {
    thematicBackground = "Crie um fundo temático de beleza e spa ao redor do produto (ex: uma base de mármore claro com pétalas de rosa suaves ou reflexos de água, transmitindo a ideia de autocuidado e luxo).";
  } else if (/(tênis|roupa|moda|vestuário|calçado)/i.test(searchable)) {
    thematicBackground = "Crie um fundo temático fashion ao redor do produto (ex: um expositor minimalista de vitrine de grife com iluminação direcionada, transmitindo a ideia de estilo e exclusividade).";
  }

  return `  - [Variável Atual - ${offer.product_name}]: ${thematicBackground}`;
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

// 3. MONTAGEM DO PROMPT MESTRE
export function buildGeminiVideoPrompt(offer: GeminiPromptOffer) {
  return `# PAPEL E MODO
Você é um Diretor de Fotografia premiado. Ative o modo Image-to-Video de altíssima fidelidade.

==================================================
TRAVA DE AVATAR E ESTÚDIO (PRIORIDADE MÁXIMA)
==================================================
• Quadro Inicial: Utilize a imagem anexada da apresentadora como o QUADRO INICIAL ABSOLUTO.
• Fundo Principal: Mantenha o estúdio azul, as luzes e os ícones de neon originais ao redor da apresentadora.
• Identidade: Preserve 100% do rosto da Avatar_Silvia, seu cabelo e a nitidez do logotipo "Caça Oferta" na camisa.
• Movimento Restrito: A modelo deve apenas piscar, respirar e fazer sincronia labial.
• Pose: Ela já está apontando para a direita. Mantenha essa pose estática. É estritamente PROIBIDO mexer os braços dela.

==================================================
CENÁRIO E CONTEXTUALIZAÇÃO DO PRODUTO
==================================================
• Posição: Na área à direita (para onde a Avatar está apontando), crie um micro-cenário dinâmico e contextualizado que sirva de fundo exclusivo para o produto (${offer.product_name}).
• Adaptação Temática: O cenário dessa área deve se adaptar perfeitamente ao produto. 
${scenarioGuidance(offer)}
• Integração: A iluminação deste micro-cenário deve interagir volumetricamente com a luz azul do estúdio principal, garantindo uma fusão visual realista e sem cortes abruptos.

==================================================
PROMPT NEGATIVO
==================================================
É estritamente proibido:
  • Modificar a Avatar_Silvia.
  • Modificar, recriar, estilizar ou substituir o produto.
  • Cortar a Avatar_Silvia ou o produto do quadro.
  • Gerar outra apresentadora ou trocar as roupas.
  • Alterar características faciais.
  • Adicionar objetos ou artefatos aleatórios.
  • Adicionar textos, letras, números, preços, legendas automáticas ou marcas d'água.
  • Criar logotipos extras.
  • Criar transições de câmera.
  • Exagerar nos gestos, gerar movimentos irreais ou expressões artificiais.

==================================================
TEXTOS E ELEMENTOS (PROIBIÇÃO ABSOLUTA)
==================================================
• NENHUM TEXTO. 
• O vídeo deve ser 100% limpo. Não gere qualquer caractere escrito na tela.

==================================================
VOZ E ROTEIRO (LIPSYNC)
==================================================
• Sincronização labial realista. 
• Voz: Feminina adulta, natural e amigável (Português do Brasil).
• Roteiro exato: 
  ${speechScript(offer)}
`;
}
