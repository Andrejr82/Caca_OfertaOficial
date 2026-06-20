import dotenv from "dotenv";
import path from "path";

// Carrega as variáveis do arquivo .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const clientId = process.env.ADMITAD_CLIENT_ID;
const clientSecret = process.env.ADMITAD_CLIENT_SECRET;
const websiteId = process.env.ADMITAD_WEBSITE_ID;

console.log("=== TESTE DE CONEXÃO E DEEPLINK ADMITAD ===");
console.log(`Client ID: ${clientId}`);
console.log(`Client Secret: ${clientSecret ? "***" + clientSecret.slice(-4) : "Vazio"}`);
console.log(`Website ID (Ad Space): ${websiteId || "Não configurado no .env.local"}`);
console.log("-------------------------------------------");

if (!clientId || !clientSecret) {
  console.error("❌ Erro: ADMITAD_CLIENT_ID ou ADMITAD_CLIENT_SECRET ausentes no arquivo .env.local.");
  process.exit(1);
}

async function testAdmitad() {
  try {
    // 1. Obter Token de Acesso via OAuth Client Credentials
    console.log("\n[1/2] Solicitando token de acesso à Admitad...");
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    
    // Solicitamos com o escopo padrão para deeplinks
    const tokenRes = await fetch("https://api.admitad.com/token/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "deeplink_generator"
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("❌ Falha ao obter token da Admitad:", tokenData);
      return;
    }

    console.log("✅ Token de Acesso obtido com sucesso!");
    console.log(`   Token: ${tokenData.access_token.slice(0, 12)}...`);
    console.log(`   Escopos autorizados: ${tokenData.scope}`);
    console.log(`   Expira em: ${tokenData.expires_in} segundos`);

    if (!websiteId) {
      console.log("\n⚠️ Teste encerrado: Para testar a geração de link de afiliado da Shein, você precisa preencher a variável ADMITAD_WEBSITE_ID no arquivo .env.local com o ID do seu canal.");
      return;
    }

    // 2. Tentar gerar um Deeplink de teste para a Shein
    const sheinTestUrl = "https://br.shein.com/Floral-Print-Flounce-Sleeve-Dress-p-12345.html";
    console.log(`\n[2/2] Testando geração de link de afiliado para Shein...`);
    console.log(`   URL Alvo: ${sheinTestUrl}`);

    // A API do Admitad aceita GET no endpoint /deeplink/{website_id}/new/ com parâmetros na query
    const urlWithParams = `https://api.admitad.com/deeplink/${websiteId}/new/?ulp=${encodeURIComponent(sheinTestUrl)}&subid=teste_caca_oferta`;
    
    const deeplinkRes = await fetch(urlWithParams, {
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`,
        "Accept": "application/json"
      }
    });

    const deeplinkData = await deeplinkRes.json();
    
    if (!deeplinkRes.ok) {
      console.error("❌ Falha ao gerar deeplink de afiliado:", deeplinkData);
      console.error("   Dica: Certifique-se de que a sua conta Admitad já foi aprovada no programa da Shein e vinculada ao seu Ad Space.");
      return;
    }

    if (Array.isArray(deeplinkData) && deeplinkData.length > 0) {
      console.log("🎉 SUCESSO! Link de afiliado gerado com sucesso:");
      console.log(`   Link de Afiliado: ${deeplinkData[0]}`);
    } else {
      console.log("❌ Resposta inesperada da API do Admitad:", deeplinkData);
    }

  } catch (error) {
    console.error("❌ Erro fatal durante o teste com a Admitad:", error);
  }
}

testAdmitad();
