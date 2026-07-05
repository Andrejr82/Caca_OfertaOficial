const fs = require('fs');
const path = require('path');

const REPORT_FILE = path.join(__dirname, '..', 'discovery_intelligence_report.md');
const HISTORY_FILE = path.join(__dirname, '..', 'discovery_history.json');

function calculateScore(metrics) {
  const aprovados = metrics.produtos_aprovados || 0;
  const encontrados = metrics.produtos_encontrados || 1;
  const taxaAprovacao = aprovados / encontrados;
  
  const premium = metrics.produtosPremium || 0;
  const taxaPremium = aprovados > 0 ? premium / aprovados : 0;
  
  const score = (taxaAprovacao * 60) + (taxaPremium * 40);
  return Math.min(100, Math.round(score));
}

function getMarketplaceHealth(metrics, marketplace) {
  const total = (metrics.por_marketplace && metrics.por_marketplace[marketplace]) || 0;
  if (total === 0) return 0;
  const taxaErro = metrics.erros / (total + metrics.erros) || 0;
  return Math.max(0, 100 - Math.round(taxaErro * 100));
}

function getTop(arr, limit) {
  return arr.slice(0, limit);
}

function groupByCount(arr, key) {
  const counts = {};
  for (const item of arr) {
    const val = item[key] || 'Desconhecido';
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function formatProduct(p, idx) {
  return `${idx + 1}. **${p.name}** | ${p.store} | ${p.brand || 'Genérica'} | ${p.category || 'Geral'} | R$ ${p.price} | Score: ${p.score || 'N/A'} | Quality: ${p.quality || 'N/A'} | Decision: ${p.decision || 'N/A'}`;
}

function formatDiscarded(p, idx) {
  return `${idx + 1}. **${p.name}** | ${p.store} | ${p.brand || 'Genérica'} | ${p.category || 'Geral'} | Regra: ${p.rule || 'Outro'} | Motivo: ${p.reason || 'N/A'}`;
}

function generateReport(metrics) {
  const previousHistory = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) : [];
  const lastMetrics = previousHistory.length > 0 ? previousHistory[previousHistory.length - 1] : null;

  const currentQualityScore = calculateScore(metrics);
  const prevQualityScore = lastMetrics ? lastMetrics.qualityScore : null;
  const qualityScoreDiff = prevQualityScore ? currentQualityScore - prevQualityScore : 0;

  metrics.qualityScore = currentQualityScore;

  const alerts = [];
  if (lastMetrics) {
    if (metrics.produtos_aprovados < lastMetrics.produtos_aprovados * 0.8) {
       alerts.push('🔴 [ALERTA] Redução superior a 20% na aprovação geral de produtos.');
    }
    if (metrics.produtosPremium < lastMetrics.produtosPremium * 0.8) {
       alerts.push('🔴 [ALERTA] Redução superior a 20% em produtos Premium.');
    }
    if (metrics.rejeicoes.antiLixo > lastMetrics.rejeicoes.antiLixo * 1.2) {
       alerts.push('🟡 [AVISO] Aumento superior a 20% de produtos descartados como lixo.');
    }
  }

  const amzHealth = getMarketplaceHealth(metrics, 'Amazon');
  const mlHealth = getMarketplaceHealth(metrics, 'Mercado Livre');
  const shopeeHealth = getMarketplaceHealth(metrics, 'Shopee');

  let status = 'VERDE';
  if (alerts.length > 0) status = 'AMARELO';
  if (alerts.some(a => a.includes('🔴'))) status = 'VERMELHO';

  const dateStr = new Date(metrics.startTime).toLocaleString('pt-BR');
  const totalTimeSecs = ((Date.now() - metrics.startTime) / 1000).toFixed(1);

  const aprovados = metrics.produtosAprovadosLista || [];
  aprovados.sort((a, b) => (b.score || 0) - (a.score || 0));

  const descartados = metrics.produtosDescartadosLista || [];

  const top100 = getTop(aprovados, 100);
  const top50Pub = getTop(aprovados.filter(p => p.decision === 'APPROVED'), 50);
  const top30Premium = getTop(aprovados.filter(p => p.quality === 'PREMIUM'), 30);
  const top20Descartados = getTop(descartados, 20);

  const catCounts = groupByCount(aprovados, 'category');
  const brandCounts = groupByCount(aprovados, 'brand');
  const storeCounts = groupByCount(aprovados, 'store');
  const ruleCounts = groupByCount(descartados, 'rule');

  let md = `# CAÇA OFERTAS OFICIAL\n# DISCOVERY INTELLIGENCE REPORT\nGerado em: ${dateStr}\n\n`;
  md += `## 1. RESUMO EXECUTIVO (STATUS: ${status === 'VERMELHO' ? '🔴' : status === 'AMARELO' ? '🟡' : '🟢'} ${status})\n\n`;
  md += `- **Discovery Version:** Signals V1\n`;
  md += `- **Oracle Version:** V3\n`;
  md += `- **Policy Version:** Official Policy\n`;
  md += `- **Release:** 3.0\n`;
  md += `- **Tempo Total:** ${totalTimeSecs}s\n\n`;

  md += `**Alertas de Regressão:**\n`;
  md += `${alerts.length > 0 ? alerts.map(a => '- ' + a).join('\\n') : '- Nenhum alerta crítico detectado. Sistema operando nominalmente.'}\n\n`;

  const diffStr = lastMetrics ? '(' + (qualityScoreDiff > 0 ? '+' : '') + qualityScoreDiff + ')' : '';
  md += `**Discovery Quality Score:** ${currentQualityScore}/100 ${diffStr}\n\n`;

  md += `**Marketplace Health Score:**\n`;
  md += `- Amazon: ${amzHealth}/100\n`;
  md += `- Mercado Livre: ${mlHealth}/100\n`;
  md += `- Shopee: ${shopeeHealth}/100\n\n`;
  md += `---\n\n`;

  md += `## 2. ESTATÍSTICAS E MÉTRICAS\n`;
  md += `- Produtos Encontrados: ${metrics.produtos_encontrados}\n`;
  md += `- Produtos Retornados p/ Validação: ${metrics.produtos_retornados}\n`;
  md += `- Produtos Enviados para IA: ${metrics.produtos_enviados_llm}\n`;
  md += `- Produtos Aprovados: ${metrics.produtos_aprovados}\n`;
  md += `- Produtos Descartados: ${metrics.produtos_rejeitados}\n`;
  md += `- Erros / Retries: ${metrics.erros} / ${metrics.retries}\n\n`;
  md += `---\n\n`;

  md += `## 3. DISTRIBUIÇÃO\n`;
  md += `### Por Marketplace\n`;
  md += `${Object.entries(metrics.por_marketplace || {}).map(([m, c]) => '- ' + m + ': ' + c).join('\n') || '- N/A'}\n\n`;
  md += `**Top 5 Categorias (Marketplace):**\n`;
  md += `${Object.entries(metrics.por_categoria || {}).slice(0, 5).map(([c, count]) => '- ' + c + ': ' + count).join('\n') || '- N/A'}\n\n`;
  md += `**Top 5 Marcas (Marketplace):**\n`;
  md += `${Object.entries(metrics.por_marca || {}).slice(0, 5).map(([m, count]) => '- ' + m + ': ' + count).join('\n') || '- N/A'}\n\n`;
  md += `**Top 5 Lojas (Marketplace):**\n`;
  md += `${Object.entries(metrics.por_loja || {}).slice(0, 5).map(([l, count]) => '- ' + l + ': ' + count).join('\n') || '- N/A'}\n\n`;
  md += `---\n\n`;

  md += `## 4. DISCOVERY QUALITY (Rejeições Gerais)\n`;
  md += `- Anti-Lixo: ${metrics.rejeicoes.antiLixo || 0}\n`;
  md += `- Price Floor: ${metrics.rejeicoes.priceFloor || 0}\n`;
  md += `- Loja Suspeita / Internacional: ${metrics.rejeicoes.loja || 0}\n`;
  md += `- Baixa Qualidade (IA): ${metrics.rejeicoes.qualidade || 0}\n\n`;

  md += `### Principais Regras Responsáveis (Amostra Descartados)\n`;
  md += `${ruleCounts.map(([r, n]) => '- ' + r + ': ' + n).join('\\n') || '- N/A'}\n\n`;
  md += `---\n\n`;

  md += `## 5. TOP 100 PRODUTOS APROVADOS\n`;
  md += `${top100.map(formatProduct).join('\\n') || 'Nenhum produto aprovado registrado.'}\n\n`;
  md += `---\n\n`;

  md += `## 6. TOP 50 PUBLICÁVEIS\n`;
  md += `${top50Pub.map(formatProduct).join('\\n') || 'Nenhum produto publicável.'}\n\n`;
  md += `---\n\n`;

  md += `## 7. TOP 30 PREMIUM\n`;
  md += `${top30Premium.map(formatProduct).join('\\n') || 'Nenhum produto premium.'}\n\n`;
  md += `---\n\n`;

  md += `## 8. TOP 20 DESCARTADOS (Amostra Operacional)\n`;
  md += `${top20Descartados.map(formatDiscarded).join('\\n') || 'Nenhum produto descartado registrado.'}\n\n`;
  md += `---\n`;

  fs.writeFileSync(REPORT_FILE, md, 'utf-8');
  console.log(`\n📄 Discovery Intelligence Report gerado com sucesso em: ${REPORT_FILE}`);

  previousHistory.push(metrics);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(previousHistory, null, 2), 'utf-8');
  console.log(`💾 Histórico atualizado (${previousHistory.length} execuções registradas).`);
}

module.exports = { generateReport };
