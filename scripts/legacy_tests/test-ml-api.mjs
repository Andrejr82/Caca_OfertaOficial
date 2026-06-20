import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const appId = process.env.MERCADO_LIVRE_APP_ID;
const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET;

console.log(`[TESTE] Usando APP_ID: ${appId}`);
console.log(`[TESTE] Usando CLIENT_SECRET: ${clientSecret ? "***" + clientSecret.slice(-4) : "Vazio"}`);

async function testML() {
  try {
    // 1. Tentar pegar o token
    console.log("\n[1] Solicitando Token OAuth (Client Credentials)...");
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: appId,
        client_secret: clientSecret
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("❌ Falha ao obter token:", tokenData);
      console.error("Isso indica que as credenciais no .env.local são inválidas ou o App não tem permissão client_credentials.");
      return;
    }
    console.log("✅ Token Obtido com Sucesso!");
    
    // 2. Tentar buscar um produto aleatório
    console.log("\n[2] Testando API de Produtos com o token...");
    const searchRes = await fetch("https://api.mercadolibre.com/sites/MLB/search?q=playstation&limit=1", {
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`
      }
    });

    const searchData = await searchRes.json();
    if (!searchRes.ok) {
        console.error("❌ Falha ao buscar produtos:", searchData);
        return;
    }

    if (searchData.results && searchData.results.length > 0) {
        const p = searchData.results[0];
        console.log("✅ API de Produtos Respondeu Oficialmente!");
        console.log("-----------------------------------------");
        console.log(`Produto: ${p.title}`);
        console.log(`Preço Oficial: R$ ${p.price}`);
        console.log(`Link Original: ${p.permalink}`);
        console.log("-----------------------------------------");
        console.log("Conclusão: O servidor de APIs autorizou sua credencial e extraiu dados perfeitamente sem necessidade de scraping HTML!");
    } else {
        console.log("Nenhum produto encontrado na busca.");
    }

  } catch (error) {
    console.error("Erro fatal durante o teste:", error);
  }
}

testML();
