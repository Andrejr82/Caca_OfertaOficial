// Estrutura de logs padronizada para telemetria

export function logScraperMetrics(
  moduleName: "SCRAPER" | "HTML_VALIDATOR" | "PRODUCT_VALIDATOR" | "PROMPT" | "BLACKLIST" | "REJECT" | "SUCCESS" | "TELEMETRY",
  data: Record<string, any>
) {
  // Ignora se estiver num ambiente silencioso de teste, mas por enquanto sempre loga.
  const timestamp = new Date().toISOString();
  
  let logString = `[${moduleName}] [${timestamp}]`;
  
  if (data.source) logString += ` Marketplace: ${data.source} |`;
  if (data.product) logString += ` Produto: ${String(data.product).substring(0, 50)} |`;
  if (data.confidence !== undefined) logString += ` Confidence: ${data.confidence}% |`;
  if (data.status) logString += ` Status: ${data.status} |`;
  if (data.reason) logString += ` RejectReason: ${data.reason}`;
  
  // Limpa o trailing pipe
  if (logString.endsWith(" |")) {
    logString = logString.slice(0, -2);
  }

  // Define a cor baseada no módulo/status
  if (data.status === "REJECT" || data.status === "ERROR") {
    console.warn(logString);
  } else {
    console.log(logString);
  }
}
