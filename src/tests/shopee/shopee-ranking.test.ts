import { normalizePrice, normalizePercent, normalizeText, isValidHttpsUrl } from '../../lib/shopee/ranking/normalization';
import { evaluateSemanticConfidence } from '../../lib/shopee/ranking/semantic-validator';
import { getPolicyForCategory } from '../../lib/shopee/ranking/category-policies';
import { calculateScore, sortCandidatesDeterministic } from '../../lib/shopee/ranking/score';
import { ShopeeRankedCandidate } from '../../lib/shopee/ranking/types';

describe('Shopee Ranking V1 - Core Tests', () => {

  describe('1. Normalization (T11)', () => {
    it('normalizes prices correctly', () => {
      expect(normalizePrice('15.5')).toBe(15.5);
      expect(normalizePrice(20)).toBe(20);
      expect(normalizePrice(null)).toBe(0);
      expect(normalizePrice(undefined)).toBe(0);
    });

    it('normalizes percentages correctly (handles fractions)', () => {
      expect(normalizePercent('0.15')).toBe(15);
      expect(normalizePercent(0.12)).toBe(12);
      expect(normalizePercent(15)).toBe(15);
      expect(normalizePercent('10')).toBe(10);
      expect(normalizePercent(null)).toBe(0);
    });

    it('normalizes text (accents, lowercase, spaces)', () => {
      expect(normalizeText('  SmartPhone  Gáláxy   S23 ')).toBe('smartphone galaxy s23');
      expect(normalizeText(null)).toBe('');
    });

    it('validates HTTPS urls', () => {
      expect(isValidHttpsUrl('https://shopee.com.br')).toBe(true);
      expect(isValidHttpsUrl('http://shopee.com.br')).toBe(false);
      expect(isValidHttpsUrl('invalid-url')).toBe(false);
    });
  });

  describe('2. Semantic Validator (T13) & 10 Casos Obrigatórios', () => {
    
    // Casos do plano de regressão (14.2)
    const celularesPolicy = getPolicyForCategory('celulares')!;
    const eletroPolicy = getPolicyForCategory('eletrodomesticos')!;
    const moveisPolicy = getPolicyForCategory('moveis')!;
    const tvPolicy = getPolicyForCategory('tv-audio')!;

    it('Caso 1: smartphone - capa para smartphone -> Rejeitar', () => {
      const res = evaluateSemanticConfidence('Capa Para Smartphone Galaxy', 'smartphone', celularesPolicy);
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('accessory_mismatch');
    });

    it('Caso 2: smartphone - kit para troca de tela -> Rejeitar', () => {
      const res = evaluateSemanticConfidence('Kit para troca de tela celular', 'smartphone', celularesPolicy);
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('accessory_mismatch');
    });

    it('Caso 3: smartphone - aparelho Galaxy -> Aceitar', () => {
      const res = evaluateSemanticConfidence('Aparelho Smartphone Galaxy S23', 'smartphone', celularesPolicy);
      expect(res.isValid).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('Caso 4: liquidificador - escova para liquidificador -> Rejeitar', () => {
      const res = evaluateSemanticConfidence('Escova para limpeza de garrafa/liquidificador', 'liquidificador', eletroPolicy);
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('accessory_mismatch');
    });

    it('Caso 5: liquidificador - liquidificador Mondial -> Aceitar', () => {
      const res = evaluateSemanticConfidence('Liquidificador Mondial Turbo', 'liquidificador', eletroPolicy);
      expect(res.isValid).toBe(true);
      expect(res.confidence).toBe(1.0);
    });

    it('Caso 6: cadeira de escritório - capa de cadeira -> Rejeitar', () => {
      const res = evaluateSemanticConfidence('Capa de cadeira escritório', 'cadeira de escritorio', moveisPolicy);
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('accessory_mismatch');
    });

    it('Caso 7: cadeira de escritório - cadeira ergonômica -> Aceitar', () => {
      const res = evaluateSemanticConfidence('Cadeira ergonômica presidente', 'cadeira de escritorio', moveisPolicy);
      expect(res.isValid).toBe(true);
    });

    it('Caso 8: Smart TV - controle remoto -> Rejeitar', () => {
      const res = evaluateSemanticConfidence('Controle remoto Smart TV LG', 'smart tv', tvPolicy);
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('accessory_mismatch');
    });

    it('Caso 9: Smart TV - televisão 4K -> Aceitar', () => {
      const res = evaluateSemanticConfidence('Televisão 4K Samsung', 'smart tv', tvPolicy);
      expect(res.isValid).toBe(true);
    });

    it('Caso 10: controle remoto - controle remoto compatível -> Aceitar', () => {
      // Se a intenção explícita for 'controle remoto', não é bloqueado
      // Para simular, criar política customizada ou usar fallback
      const customPolicy = {
        categoryKey: 'acessorios-tv',
        primaryClasses: ['controle', 'remoto'],
        acceptedAliases: [],
        blockedTerms: ['capa'],
        nativeCategoryIds: []
      };
      const res = evaluateSemanticConfidence('Controle remoto universal', 'controle remoto', customPolicy);
      expect(res.isValid).toBe(true);
      expect(res.confidence).toBe(1.0);
    });
  });

  describe('3. Score and Deterministic Sort (T15)', () => {
    it('calculates score correctly and avoids floating point issues', () => {
      const candidate: Partial<ShopeeRankedCandidate> = {
        semanticConfidence: 1.0,
        sales: 1000,
        discountPercent: 50,
        rating: 5,
        shopTypes: [1],
        commissionPercent: 15,
        currentPrice: 100
      };
      
      const res = calculateScore(candidate, 100, true);
      // breakdown max values: 25(semantic) + 20(sales:log10(1001)/4=0.75*20=15) + 15(discount:1) + 10(rating:1) + 10(shop:1) + 10(commission:1) + 5(price:1) + 5(fresh:1)
      // Sales Norm: min(1, Math.log10(1001)/4) = log10(1001)=3.00043 / 4 = 0.75010
      // 25 + (20 * 0.7501) + 15 + 10 + 10 + 10 + 5 + 5 = 95
      expect(res.score).toBeGreaterThan(90);
      expect(res.breakdown.semantic_relevance).toBe(25);
      expect(res.breakdown.rating).toBe(10);
    });

    it('breaks ties deterministically', () => {
      const base: ShopeeRankedCandidate = {
        marketplace: 'Shopee', strategyVersion: 'shopee-ranking-v1',
        itemId: '1', shopId: '1', productName: 'A', categoryKey: 'test', queryTerm: 'test',
        affiliateUrl: 'https', currentPrice: 100, rating: 5, sales: 100, discountPercent: 10,
        commissionPercent: 5, shopTypes: [1], semanticConfidence: 1, score: 50,
        categoryId: null, productUrl: null, imageUrl: null, maximumPrice: null,
        shopeeCommissionPercent: null, sellerCommissionPercent: null, scoreBreakdown: {}, determiningReasons: [], capturedAt: ''
      };

      const c1 = { ...base, itemId: '10', score: 50, currentPrice: 100 };
      const c2 = { ...base, itemId: '20', score: 50, currentPrice: 100 };
      const c3 = { ...base, itemId: '30', score: 50, currentPrice: 90 }; // menor preço ganha!
      const c4 = { ...base, itemId: '40', score: 51, currentPrice: 100 }; // maior score ganha de todos

      const arr = [c2, c1, c4, c3];
      arr.sort(sortCandidatesDeterministic);

      expect(arr[0].itemId).toBe('40'); // score 51
      expect(arr[1].itemId).toBe('30'); // score 50, preço 90
      expect(arr[2].itemId).toBe('10'); // score 50, preço 100, tie breaker id (10 < 20)
      expect(arr[3].itemId).toBe('20');
    });
  });
});
