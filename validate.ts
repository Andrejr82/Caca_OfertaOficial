import { calculateBrandScore, isProductViralEligible, MINIMUM_DISCOUNT_BY_CATEGORY } from "./src/lib/offers/viral-intelligence";

const tests = [
  { name: "Intelbras TIP200 (Telefone Fixo)", product: "Telefone Sem Fio Intelbras TIP200 Vermelho", cat: "Telefonia", price: 79.90, old: 99.90 },
  { name: "iPhone 15 128GB",                  product: "Apple iPhone 15 128GB Preto",              cat: "Telefonia", price: 3799, old: 4599 },
  { name: "Samsung Galaxy A55",               product: "Samsung Galaxy A55 5G 128GB Azul",         cat: "Telefonia", price: 1299, old: 1799 },
  { name: "Air Fryer Philips Walita",         product: "Air Fryer Philips Walita RI9252/90 4.1L",  cat: "Eletroportáteis", price: 399, old: 549 },
];

for (const t of tests) {
  const brand = calculateBrandScore(t.product);
  const viral = isProductViralEligible(t.product, t.cat);
  const cat = t.cat.toLowerCase();
  const minD = MINIMUM_DISCOUNT_BY_CATEGORY[cat] ?? MINIMUM_DISCOUNT_BY_CATEGORY["default"];
  const realD = t.old ? (t.old - t.price) / t.old : null;
  console.log("─".repeat(60));
  console.log(`PRODUTO: ${t.name}`);
  console.log(`  brand_score:    ${brand}`);
  console.log(`  viral_penalty:  ${viral.penalty.toFixed(3)} | eligible: ${viral.eligible}`);
  if (viral.reasons.length) console.log(`  penalidades:    ${viral.reasons.join("; ")}`);
  if (realD !== null) {
    const dPct = (realD * 100).toFixed(1);
    const minPct = (minD * 100).toFixed(0);
    console.log(`  desconto:       ${dPct}% real vs ${minPct}% mínimo → ${realD >= minD ? "PASSA" : "REJEITA"}`);
  }
}
console.log("─".repeat(60));
console.log("VALIDAÇÃO CONCLUÍDA");
