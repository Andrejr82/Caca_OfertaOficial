require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function calculateScoreV1(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    if (price >= 1500 && pct >= 0.10) discountScore = 10;
    else if (pct >= 0.05 && pct <= 0.80) discountScore = Math.min((pct / 0.5) * 10, 10);
    else if (pct > 0.80) discountScore = 2;
  }

  let priceScore = price <= 90 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
  let impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;

  return Number(((discountScore * 0.35) + (priceScore * 0.30) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

function calculateScoreV2(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountPct = 0;
  let absoluteSavings = 0;

  if (oldPrice > price) {
    discountPct = (oldPrice - price) / oldPrice;
    absoluteSavings = oldPrice - price;
  }
  
  let discountScore = 0;
  if (discountPct > 0) {
    if (discountPct > 0.8) discountScore = 2; // Black Fraude
    else discountScore = Math.min((discountPct / 0.5) * 10, 10);
  }
  
  // Economia Absoluta
  let savingsScore = absoluteSavings >= 1000 ? 10 : (absoluteSavings >= 500 ? 8 : (absoluteSavings >= 100 ? 5 : 0));
  
  // Compra por Impulso
  let impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 0));
  
  // Premium Score (compensa a falta de impulseScore para produtos caros)
  let premiumScore = price >= 1500 ? 8 : (price >= 700 ? 5 : 0);
  
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;
  
  // A V2 pega o maior multiplicador comercial secundário
  const bestCommercialScore = Math.max(savingsScore, impulseScore, premiumScore);

  return Number(((discountScore * 0.40) + (bestCommercialScore * 0.45) + (ratingScore * 0.15)).toFixed(2));
}

async function runValidation() {
  console.log("🔍 Extraindo 500 ofertas do Supabase...");
  const { data: offers, error } = await supabase
    .from('offers')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error("Erro ao buscar ofertas:", error);
    process.exit(1);
  }

  console.log(`✅ ${offers.length} ofertas obtidas. Calculando scores...`);

  const results = offers.map(offer => {
    const v1 = calculateScoreV1(offer);
    const v2 = calculateScoreV2(offer);
    return {
      id: offer.id,
      name: offer.product_name.substring(0, 40).padEnd(40),
      price: offer.current_price,
      oldPrice: offer.old_price,
      v1_score: v1,
      v2_score: v2,
      diff: (v2 - v1).toFixed(2),
      isPremium: offer.current_price >= 1500
    };
  });

  // Sort by V1
  const rankedV1 = [...results].sort((a, b) => b.v1_score - a.v1_score);
  // Sort by V2
  const rankedV2 = [...results].sort((a, b) => b.v2_score - a.v2_score);

  const report = {
    total_ofertas_processadas: offers.length,
    premium_promovidos: 0,
    premium_rebaixados: 0,
    baratos_promovidos: 0,
    baratos_rebaixados: 0,
    top20_v1: rankedV1.slice(0, 20),
    top20_v2: rankedV2.slice(0, 20)
  };

  results.forEach(r => {
    const diff = parseFloat(r.diff);
    if (r.isPremium) {
      if (diff > 0) report.premium_promovidos++;
      if (diff < 0) report.premium_rebaixados++;
    } else if (r.price <= 300) {
      if (diff > 0) report.baratos_promovidos++;
      if (diff < 0) report.baratos_rebaixados++;
    }
  });

  fs.writeFileSync('shadow_validation_report.json', JSON.stringify(report, null, 2));
  console.log("📊 Relatório gerado em shadow_validation_report.json");
}

runValidation();
