export type InstagramPolicyGuardInput = {
  productName?: string | null;
  category?: string | null;
  notes?: string | null;
  caption?: string | null;
  platform?: string | null;
};

export type InstagramPolicyGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: "INSTAGRAM_POLICY_BLOCKED" | "INSTAGRAM_POLICY_INPUT_INVALID";
      rule: string;
      message: string;
    };

type PolicyRule = {
  id: string;
  label: string;
  patterns: RegExp[];
};

// Guard conservador para conteúdo comercial/afiliado. A Meta pode alterar suas
// políticas; por isso, novas categorias sensíveis devem ser adicionadas aqui
// antes de habilitá-las no canal Instagram.
const BLOCKED_RULES: readonly PolicyRule[] = [
  {
    id: "weapons_explosives",
    label: "armas, munições ou explosivos",
    patterns: [
      /\b(arma(?:s)? de fogo|firearm|pistola|revolver|revólver|rifle|espingarda|muni[cç][aã]o|cartucho(?:s)?|silenciador|explosivo(?:s)?|granada(?:s)?)\b/i
    ]
  },
  {
    id: "drugs_tobacco_nicotine",
    label: "drogas, tabaco, nicotina ou produtos de vape",
    patterns: [
      /\b(cigarro(?:s)?|charuto(?:s)?|tabaco|nicotina|vape|vaping|cigarro eletr[oô]nico|e-?cig(?:arette)?|cannabis|maconha|marijuana|thc|cbd|coca[ií]na|ecstasy|mdma|droga(?:s)? recreativa(?:s)?)\b/i
    ]
  },
  {
    id: "alcohol",
    label: "bebidas alcoólicas",
    patterns: [
      /\b(cerveja(?:s)?|vinho(?:s)?|whisk(?:y|ey)|vodka|gin\b|rum\b|cacha[cç]a|tequila|licor(?:es)?|bebida(?:s)? alco[oó]lica(?:s)?|alcool|álcool)\b/i
    ]
  },
  {
    id: "adult_sexual",
    label: "produtos ou serviços adultos/sexuais",
    patterns: [
      /\b(sex shop|sexshop|vibrador(?:es)?|dildo(?:s)?|masturbador(?:es)?|brinquedo(?:s)? sexual(?:is)?|pornogr[aá]fic|conte[uú]do adulto|servi[cç]o(?:s)? sexual(?:is)?)\b/i
    ]
  },
  {
    id: "gambling",
    label: "apostas, cassino ou jogos valendo dinheiro",
    patterns: [
      /\b(aposta(?:s)? online|casa de aposta(?:s)?|betting|cassino|casino|roleta|slot(?:s)?|loteria(?:s)? online|jogo(?:s)? de azar)\b/i
    ]
  },
  {
    id: "pharma_health_claims",
    label: "medicamentos, fármacos ou alegações sensíveis de saúde/emagrecimento",
    patterns: [
      /\b(medicamento(?:s)?|rem[eé]dio(?:s)?|f[aá]rmaco(?:s)?|prescri[cç][aã]o|antidepressivo(?:s)?|ansiol[ií]tico(?:s)?|anabolizante(?:s)?|esteroide(?:s)?|emagrecedor(?:es)?|perda de peso|perder peso|queima gordura|fat burner|suplemento(?:s)? para emagrecer)\b/i
    ]
  },
  {
    id: "live_animals_wildlife",
    label: "animais vivos ou comércio de vida selvagem",
    patterns: [
      /\b(animal(?:is)? vivo(?:s)?|filhote(?:s)? [àa] venda|esp[eé]cie(?:s)? amea[cç]ada(?:s)?|marfim|ivory|chifre de rinoceronte)\b/i
    ]
  },
  {
    id: "political_government",
    label: "conteúdo político/governamental incompatível com branded content comum",
    patterns: [
      /\b(candidato(?:a)?|campanha eleitoral|partido pol[ií]tico|comit[eê] eleitoral|propaganda eleitoral|governo federal|governo estadual|prefeitura)\b/i
    ]
  },
  {
    id: "counterfeit_piracy",
    label: "mercadoria falsificada, pirataria ou violação explícita de propriedade intelectual",
    patterns: [
      /\b(r[eé]plica 1[: ]?1|produto falsificado|produto fake|pirata|pirateado|desbloqueador ilegal|iptv pirata|jailbroken)\b/i
    ]
  }
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function evaluateInstagramPolicy(input: InstagramPolicyGuardInput): InstagramPolicyGuardResult {
  const fields = [input.productName, input.category, input.notes, input.caption, input.platform]
    .map(normalize)
    .filter(Boolean);

  if (fields.length === 0) {
    return {
      ok: false,
      code: "INSTAGRAM_POLICY_INPUT_INVALID",
      rule: "missing_policy_context",
      message: "Publicação bloqueada: não há contexto suficiente para validar a política do Instagram."
    };
  }

  const haystack = fields.join(" \n ");
  for (const rule of BLOCKED_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return {
        ok: false,
        code: "INSTAGRAM_POLICY_BLOCKED",
        rule: rule.id,
        message: `Publicação bloqueada pela política preventiva do Instagram: ${rule.label}.`
      };
    }
  }

  return { ok: true };
}
