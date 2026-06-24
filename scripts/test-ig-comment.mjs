import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const GRAPH_API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const token = process.env.INSTAGRAM_ACCESS_TOKEN;

if (!token) {
  console.error("ERRO: INSTAGRAM_ACCESS_TOKEN não encontrado no .env.local");
  process.exit(1);
}

async function run() {
  try {
    console.log("1. Buscando Páginas do Facebook...");
    const accountsRes = await fetch(`${BASE_URL}/me/accounts?access_token=${token}`);
    const accountsData = await accountsRes.json();
    const page = accountsData.data?.[0];
    const pageToken = page?.access_token;
    
    if (!page || !pageToken) {
      console.error("ERRO: Nenhuma página encontrada associada a este token.");
      return;
    }

    console.log(`2. Buscando IG Business Account para a página ${page.name}...`);
    const igRes = await fetch(`${BASE_URL}/${page.id}?fields=instagram_business_account&access_token=${token}`);
    const igData = await igRes.json();
    const igId = igData.instagram_business_account?.id;

    if (!igId) {
      console.error("ERRO: Instagram Business Account não vinculado à página.");
      return;
    }

    console.log(`✅ Instagram Business Account Encontrado: ${igId}`);

    console.log("3. Buscando últimos posts...");
    const mediaRes = await fetch(`${BASE_URL}/${igId}/media?fields=id,caption&limit=5&access_token=${token}`);
    const mediaData = await mediaRes.json();
    const posts = mediaData.data || [];

    if (posts.length === 0) {
      console.error("Nenhum post encontrado no perfil.");
      return;
    }

    let foundComment = null;

    console.log("4. Varrendo comentários nos últimos 5 posts...");
    for (const post of posts) {
      const commentsRes = await fetch(`${BASE_URL}/${post.id}/comments?fields=id,text,from{id,username},timestamp&access_token=${token}`);
      const commentsData = await commentsRes.json();
      const comments = commentsData.data || [];

      for (const c of comments) {
        if (c.text.toLowerCase().includes("quero") && c.from?.id !== igId) {
          foundComment = c;
          console.log(`✅ Comentário encontrado! "${c.text}" feito por @${c.from?.username || "unknown"}`);
          break;
        }
      }
      if (foundComment) break;
    }

    if (!foundComment) {
      console.error("❌ Nenhum comentário contendo 'quero' de outra pessoa foi encontrado.");
      return;
    }

    console.log(`5. Enviando Resposta Pública no Comentário de @${foundComment.from?.username}...`);
    const replyRes = await fetch(`${BASE_URL}/${foundComment.id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pageToken}` },
      body: JSON.stringify({
        message: `🎉 Olá @${foundComment.from?.username}! O nosso sistema detectou o seu comentário. Como o app está em modo de desenvolvimento, a Meta só nos deixará mandar DM automática após a aprovação (App Review). Mas o teste público funcionou perfeitamente!`
      })
    });

    const replyData = await replyRes.json();
    if (!replyRes.ok) {
      console.error("❌ Falha ao enviar DM:", replyData);
    } else {
      console.log("✅✅✅ DM ENVIADA COM SUCESSO! ✅✅✅");
      console.log("Verifique o direct no seu Instagram.");
    }

  } catch (err) {
    console.error("Erro fatal:", err);
  }
}

run();
