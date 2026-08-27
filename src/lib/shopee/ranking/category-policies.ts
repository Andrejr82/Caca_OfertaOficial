import { CategoryPolicy } from './types';

const BEAUTY_POLICY: CategoryPolicy = {
  categoryKey: 'beleza',
  primaryClasses: [
    'protetor solar', 'hidratante', 'serum', 'skincare', 'mascara', 'mascara capilar', 'tratamento capilar',
    'shampoo', 'condicionador', 'oleo capilar', 'perfume', 'eau de parfum', 'maquiagem', 'base',
    'batom', 'rimel', 'escova secadora', 'secador', 'chapinha', 'modelador de cachos',
    'aparador de pelos', 'maquina de cortar cabelo', 'depilador',
  ],
  acceptedAliases: ['cosmetico', 'cuidado facial', 'cuidado capilar'],
  blockedTerms: [
    'descartavel', 'pincel descartavel', 'aplicador descartavel', 'frasco vazio', 'embalagem vazia',
    'amostra gratis', 'tester', 'lamina avulsa', 'carregador avulso', 'tampa avulsa',
    'suporte de shampoo', 'organizador de maquiagem',
  ],
  nativeCategoryIds: [],
};

export const INITIAL_CATEGORY_POLICIES: Record<string, CategoryPolicy> = {
  celulares: {
    categoryKey: 'celulares',
    primaryClasses: ['smartphone', 'iphone', 'galaxy', 'redmi', 'poco', 'motorola', 'celular'],
    acceptedAliases: [],
    blockedTerms: ['capa', 'pelicula', 'suporte', 'fone', 'kit', 'tela', 'adaptador', 'case', 'carregador'],
    nativeCategoryIds: [],
  },
  eletrodomesticos: {
    categoryKey: 'eletrodomesticos',
    primaryClasses: ['liquidificador', 'cafeteira', 'air fryer', 'batedeira', 'chaleira', 'processador', 'fritadeira', 'micro-ondas'],
    acceptedAliases: [],
    blockedTerms: ['copo', 'lamina', 'escova', 'refil', 'peca', 'tampa', 'motor', 'jarra'],
    nativeCategoryIds: [],
  },
  moveis: {
    categoryKey: 'moveis',
    primaryClasses: ['cadeira', 'sofa', 'mesa', 'armario', 'rack', 'comoda', 'guarda-roupa', 'painel', 'escrivaninha'],
    acceptedAliases: [],
    blockedTerms: ['capa', 'almofada', 'protetor', 'tecido', 'pes', 'espuma', 'rodizio'],
    nativeCategoryIds: [],
  },
  'tv-audio': {
    categoryKey: 'tv-audio',
    primaryClasses: ['smart tv', 'televisao', 'tv', 'soundbar', 'caixa de som', 'home theater'],
    acceptedAliases: [],
    blockedTerms: ['controle', 'remoto', 'suporte', 'cabo', 'monitor', 'capa', 'placa', 'tela', 'pe'],
    nativeCategoryIds: [],
  },
  moda: {
    categoryKey: 'moda',
    primaryClasses: ['camisa', 'blusa', 'tenis', 'calca', 'vestido', 'jaqueta', 'saia', 'short'],
    acceptedAliases: [],
    blockedTerms: ['pet', 'bebe', 'infantil'], // Condicional se fora da intenção (implementado no validador)
    nativeCategoryIds: [],
  },
  'casa-cozinha': {
    categoryKey: 'casa-cozinha',
    primaryClasses: ['cama', 'faqueiro', 'utensilio', 'panela', 'jogo de panelas', 'pote', 'vasilha', 'talheres'],
    acceptedAliases: [],
    blockedTerms: ['reposicao', 'peca', 'tampa avulsa', 'cabo'],
    nativeCategoryIds: [],
  },
  beleza: BEAUTY_POLICY,
};

const BEAUTY_POLICY_ALIASES = new Set([
  'beleza', 'cosmetico', 'mascara', 'cabelo', 'capilar', 'maquiagem', 'perfume', 'shampoo',
  'secador', 'chapinha', 'skincare', 'serum', 'hidratante', 'protetor solar', 'depilador',
  'aparador de pelos', 'maquina de cortar cabelo', 'oleo capilar', 'tratamento capilar',
]);

export function getPolicyForCategory(categoryKey: string): CategoryPolicy | undefined {
  const key = String(categoryKey || '').trim().toLowerCase();
  if (BEAUTY_POLICY_ALIASES.has(key)) return BEAUTY_POLICY;
  return INITIAL_CATEGORY_POLICIES[key];
}
