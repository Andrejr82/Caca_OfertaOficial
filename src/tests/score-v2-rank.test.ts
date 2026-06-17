import { describe, expect, it } from "vitest";
import { calculateFinalRankScore } from "@/lib/offers/score-v2";

describe("Curadoria V2 - Validação Matemática do Score Final Ponderado", () => {
  it("deve calcular a média ponderada com 70% comercial, 20% conversão e 10% copy", () => {
    // Exemplo: Comercial = 8.0, Conversão = 7.0, Copy = 9.0
    // Cálculo: 0.70 * 8.0 (5.6) + 0.20 * 7.0 (1.4) + 0.10 * 9.0 (0.9) = 7.9
    const score = calculateFinalRankScore(8.0, 7.0, 9.0);
    expect(score).toBe(7.9);
  });

  it("deve respeitar os limites inferiores e superiores (0 a 10)", () => {
    // Caso com valores zerados
    expect(calculateFinalRankScore(0, 0, 0)).toBe(0);

    // Caso com valores máximos
    expect(calculateFinalRankScore(10, 10, 10)).toBe(10);

    // Caso de overflow teórico (embora as entradas devam ser até 10)
    expect(calculateFinalRankScore(12, 12, 12)).toBe(10);

    // Caso de underflow teórico (valores negativos)
    expect(calculateFinalRankScore(-5, -5, -5)).toBe(0);
  });

  it("deve arredondar o resultado para duas casas decimais", () => {
    // Comercial = 8.125, Conversão = 6.45, Copy = 7.89
    // Cálculo: 0.7 * 8.125 (5.6875) + 0.2 * 6.45 (1.29) + 0.1 * 7.89 (0.789) = 7.7665
    // Arredondado para 2 casas decimais deve ser 7.77
    const score = calculateFinalRankScore(8.125, 6.45, 7.89);
    expect(score).toBe(7.77);
  });
});
