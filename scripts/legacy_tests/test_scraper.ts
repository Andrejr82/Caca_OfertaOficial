import fs from 'fs';

async function testMercadoLivreHTML() {
  const url = "https://www.mercadolivre.com.br/mais-vendidos";
  console.log(`[TESTE] Buscando URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      console.log(`[TESTE] Falha na resposta HTTP: ${response.status}`);
      return;
    }

    const html = await response.text();
    console.log(`[TESTE] HTML recebido: ${html.length} bytes.`);

    // Teste da lógica de falso positivo atual
    const temRobot = html.includes("robot");
    const temCaptcha = html.includes("captcha");
    const temTrafegoSuspeito = html.includes("tráfego suspeito");

    console.log(`[TESTE] A palavra "robot" está no HTML? ${temRobot}`);
    console.log(`[TESTE] A palavra "captcha" está no HTML? ${temCaptcha}`);
    console.log(`[TESTE] A frase "tráfego suspeito" está no HTML? ${temTrafegoSuspeito}`);

    if (temRobot) {
      // Procurando onde está o "robot" no HTML
      const robotIndex = html.indexOf("robot");
      const contexto = html.substring(Math.max(0, robotIndex - 50), Math.min(html.length, robotIndex + 50));
      console.log(`\n[TESTE] Contexto onde a palavra "robot" foi encontrada no HTML original do Mercado Livre:`);
      console.log(`>>> ${contexto} <<<`);
    }

    // Lógica atual que está causando erro
    if (html.length < 5000 || html.includes("captcha") || html.includes("robot") || html.includes("tráfego suspeito")) {
      console.log("\n[TESTE] RESULTADO DA LÓGICA ATUAL: Falhou! Identificou incorretamente como captcha/bloqueio.");
    } else {
      console.log("\n[TESTE] RESULTADO DA LÓGICA ATUAL: Passou!");
    }

    // Nova Lógica Proposta
    if (html.length < 50000 && (html.includes("captcha") || html.includes("tráfego suspeito") || html.includes("verifique que você não é um robô"))) {
      console.log("[TESTE] RESULTADO DA NOVA LÓGICA: Falhou! Identificou como bloqueio.");
    } else {
      console.log("[TESTE] RESULTADO DA NOVA LÓGICA: Passou com Sucesso! HTML válido foi aceito.");
    }

  } catch (error) {
    console.error("Erro durante o teste:", error);
  }
}

testMercadoLivreHTML();
