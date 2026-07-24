import { test, expect, describe } from 'vitest';
import { RankingEngine, ScoreInput } from '../../../core/ranking/ranking-engine';

describe('RankingEngine (Sprint 1)', () => {
  test('Produtos com maior valor comercial e economia absoluta devem superar produtos baratos sem vantagem real', () => {
    const produtoBaratoSemVantagem: ScoreInput = {
      product_name: "Cabo USB",
      current_price: 80,
      old_price: 80, // sem desconto
      rating: 4.5
    };

    const produtoPremiumComDesconto: ScoreInput = {
      product_name: "Smart TV",
      current_price: 1500,
      old_price: 2000, // 500 de economia
      rating: 4.5
    };

    const scoreBarato = RankingEngine.calculateCommercialPolicy(produtoBaratoSemVantagem);
    const scorePremium = RankingEngine.calculateCommercialPolicy(produtoPremiumComDesconto);

    // O premium com economia real deve ser melhor que a bugiganga na nova política comercial
    expect(scorePremium).toBeGreaterThan(scoreBarato);
  });

  test('Produto barato com desconto artificial não deve dominar premium com desconto real', () => {
    const produtoBaratoDescontoArtificial: ScoreInput = {
      product_name: "Película",
      current_price: 20,
      old_price: 200, // Desconto de 90% (artificial)
      rating: 4.8
    };

    const produtoPremiumDescontoReal: ScoreInput = {
      product_name: "Notebook",
      current_price: 2500,
      old_price: 3200, // Desconto real de 700
      rating: 4.8
    };

    const scoreBaratoArtificial = RankingEngine.calculateCommercialPolicy(produtoBaratoDescontoArtificial);
    const scorePremiumReal = RankingEngine.calculateCommercialPolicy(produtoPremiumDescontoReal);

    expect(scorePremiumReal).toBeGreaterThan(scoreBaratoArtificial);
  });
});
