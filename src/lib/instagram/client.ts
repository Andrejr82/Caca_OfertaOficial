const FACEBOOK_GRAPH_API_VERSION = "v19.0";
const BASE_GRAPH_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`;

export interface InstagramTestResult {
  ok: boolean;
  message: string;
  businessAccountId?: string;
  pageName?: string;
}

/**
 * Verifica se o token de acesso do Instagram está configurado
 */
export function isInstagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN);
}

/**
 * Descobre o ID da conta comercial do Instagram vinculada à conta do usuário
 */
export async function discoverInstagramBusinessId(): Promise<string> {
  // Se já houver um ID salvo estaticamente no .env.local, retorna direto
  if (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN não está configurado.");
  }

  // 1. Busca as Páginas do Facebook administradas por este Token
  const accountsUrl = `${BASE_GRAPH_URL}/me/accounts?access_token=${token}`;
  const accountsRes = await fetch(accountsUrl);
  if (!accountsRes.ok) {
    const errorDetails = await accountsRes.text();
    throw new Error(`Erro ao buscar páginas do Facebook: ${accountsRes.status}. Detalhes: ${errorDetails}`);
  }

  const accountsData = await accountsRes.json();
  const pages = accountsData.data || [];

  if (pages.length === 0) {
    throw new Error("Nenhuma Página do Facebook encontrada vinculada a este Token.");
  }

  // 2. Para a primeira página encontrada, busca a conta comercial do Instagram vinculada
  for (const page of pages) {
    const pageId = page.id;
    const instagramUrl = `${BASE_GRAPH_URL}/${pageId}?fields=instagram_business_account&access_token=${token}`;
    const instagramRes = await fetch(instagramUrl);
    
    if (instagramRes.ok) {
      const instagramData = await instagramRes.json();
      if (instagramData.instagram_business_account && instagramData.instagram_business_account.id) {
        return instagramData.instagram_business_account.id;
      }
    }
  }

  throw new Error("Não foi possível encontrar uma conta do Instagram Business vinculada a nenhuma das suas Páginas do Facebook.");
}

/**
 * Testa a conexão com a API do Instagram e retorna os detalhes da conta
 */
export async function testInstagramConnection(): Promise<InstagramTestResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, message: "INSTAGRAM_ACCESS_TOKEN não está configurado." };
  }

  try {
    const businessAccountId = await discoverInstagramBusinessId();
    
    // Busca informações básicas da conta comercial do Instagram para checar a validade
    const infoUrl = `${BASE_GRAPH_URL}/${businessAccountId}?fields=username,name&access_token=${token}`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) {
      const errorJson = await infoRes.json().catch(() => ({}));
      const errorMsg = errorJson.error?.message || `Status: ${infoRes.status}`;
      throw new Error(`Erro da API do Instagram na conta ${businessAccountId}: ${errorMsg}`);
    }

    const infoData = await infoRes.json();
    return {
      ok: true,
      message: `Conexão bem-sucedida! Conta: @${infoData.username} (${infoData.name})`,
      businessAccountId
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao testar conexão.";
    return {
      ok: false,
      message: errorMessage
    };
  }
}

/**
 * Publica uma imagem com legenda na conta comercial do Instagram.
 * A Meta Graph API exige duas etapas para publicar posts de feed:
 * 1. Criar um container de mídia passando a URL da imagem pública e a legenda.
 * 2. Aguardar o container estar pronto (status FINISHED).
 * 3. Publicar o container usando o ID de criação gerado na etapa 1.
 */
export async function publishToInstagram(imageUrl: string, caption: string): Promise<string> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN não configurado. Vá em Configurações e adicione o token.");
  }

  let businessAccountId: string;
  try {
    businessAccountId = await discoverInstagramBusinessId();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    throw new Error(`Não foi possível descobrir sua conta do Instagram Business: ${msg}`);
  }

  // ─── Etapa 1: Criar o Container de Mídia ───
  console.log("[Instagram] Etapa 1: Criando container de mídia...");
  
  // O Instagram rejeita imagens muito altas (fora da proporção 4:5 a 1.91:1).
  // Para contornar, usamos nossa própria API (Next.js na Vercel) com a biblioteca Sharp,
  // que converte qualquer imagem num quadrado perfeito (1080x1080) com fundo branco.
  // Usamos o domínio de produção absoluto para garantir que a Meta consiga enxergar a imagem
  // mesmo quando estamos testando e clicando em "Publicar" rodando em Localhost.
  const appDomain = process.env.NEXT_PUBLIC_APP_URL || "https://caca-oferta-oficial.vercel.app";
  const safeImageUrl = `${appDomain}/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;

  console.log("[Instagram] Image URL original:", imageUrl.slice(0, 120));
  console.log("[Instagram] Image URL processada (1:1):", safeImageUrl);

  const mediaUrl = `${BASE_GRAPH_URL}/${businessAccountId}/media`;
  let mediaRes: Response;
  try {
    mediaRes = await fetch(mediaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: safeImageUrl,
        caption: caption,
        access_token: token,
      }),
    });
  } catch (fetchError) {
    throw new Error(`Erro de rede ao criar container do Instagram: ${fetchError instanceof Error ? fetchError.message : "timeout"}`);
  }

  const mediaRaw = await mediaRes.text();
  let mediaData: Record<string, unknown>;
  try {
    mediaData = JSON.parse(mediaRaw);
  } catch {
    throw new Error(`Instagram retornou resposta inválida (não JSON) na Etapa 1: ${mediaRaw.slice(0, 200)}`);
  }

  if (!mediaRes.ok || (mediaData as { error?: { message?: string } }).error) {
    const errMsg = (mediaData as { error?: { message?: string } }).error?.message || mediaRaw.slice(0, 300);
    throw new Error(`Falha ao criar container de mídia (Etapa 1): ${errMsg}`);
  }

  const creationId = mediaData.id as string | undefined;
  if (!creationId) {
    throw new Error(`Nenhum creationId retornado. Resposta: ${JSON.stringify(mediaData).slice(0, 300)}`);
  }

  console.log("[Instagram] Container criado:", creationId);

  // ─── Etapa 2: Polling do status do container ───
  // A Meta recomenda aguardar até o container ter status FINISHED antes de publicar.
  console.log("[Instagram] Etapa 2: Aguardando container ficar pronto...");

  const maxAttempts = 10;
  const pollIntervalMs = 3000; // 3 segundos entre checks

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const statusUrl = `${BASE_GRAPH_URL}/${creationId}?fields=status_code,status&access_token=${token}`;
    const statusRes = await fetch(statusUrl);
    const statusRaw = await statusRes.text();

    let statusData: Record<string, unknown>;
    try {
      statusData = JSON.parse(statusRaw);
    } catch {
      console.warn(`[Instagram] Polling ${attempt}: resposta não-JSON:`, statusRaw.slice(0, 100));
      continue;
    }

    const statusCode = statusData.status_code as string | undefined;
    console.log(`[Instagram] Polling ${attempt}/${maxAttempts}: status = ${statusCode}`);

    if (statusCode === "FINISHED") {
      break;
    }

    if (statusCode === "ERROR") {
      const statusMsg = statusData.status as string || "Erro desconhecido no processamento da imagem.";
      throw new Error(`Instagram rejeitou a imagem: ${statusMsg}. Verifique se a URL da imagem é pública e acessível.`);
    }

    if (attempt === maxAttempts) {
      throw new Error(`Timeout: o container do Instagram não ficou pronto após ${maxAttempts * pollIntervalMs / 1000}s. Status: ${statusCode || "desconhecido"}`);
    }
  }

  // ─── Etapa 3: Publicar o Container de Mídia ───
  console.log("[Instagram] Etapa 3: Publicando...");

  const publishUrl = `${BASE_GRAPH_URL}/${businessAccountId}/media_publish`;
  let publishRes: Response;
  try {
    publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: token,
      }),
    });
  } catch (fetchError) {
    throw new Error(`Erro de rede ao publicar no Instagram: ${fetchError instanceof Error ? fetchError.message : "timeout"}`);
  }

  const publishRaw = await publishRes.text();
  let publishData: Record<string, unknown>;
  try {
    publishData = JSON.parse(publishRaw);
  } catch {
    throw new Error(`Instagram retornou resposta inválida (não JSON) na Etapa 3: ${publishRaw.slice(0, 200)}`);
  }

  if (!publishRes.ok || (publishData as { error?: { message?: string } }).error) {
    const errMsg = (publishData as { error?: { message?: string } }).error?.message || publishRaw.slice(0, 300);
    throw new Error(`Falha ao publicar no Instagram (Etapa 3): ${errMsg}`);
  }

  const postId = publishData.id as string;
  console.log("[Instagram] Publicado com sucesso! Post ID:", postId);
  return postId;
}

/**
 * Publica um vídeo (Reels) na conta comercial do Instagram.
 */
export async function publishVideoToInstagram(videoUrl: string, caption: string): Promise<string> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN não configurado.");
  }

  let businessAccountId: string;
  try {
    businessAccountId = await discoverInstagramBusinessId();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    throw new Error(`Não foi possível descobrir sua conta do Instagram Business: ${msg}`);
  }

  console.log("[Instagram] Etapa 1: Criando container de vídeo (Reels)...");
  console.log("[Instagram] Video URL:", videoUrl);

  const mediaUrl = `${BASE_GRAPH_URL}/${businessAccountId}/media`;
  let mediaRes: Response;
  try {
    mediaRes = await fetch(mediaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: caption,
        access_token: token,
      }),
    });
  } catch (fetchError) {
    throw new Error(`Erro de rede ao criar container de vídeo: ${fetchError instanceof Error ? fetchError.message : "timeout"}`);
  }

  const mediaRaw = await mediaRes.text();
  let mediaData: Record<string, unknown>;
  try {
    mediaData = JSON.parse(mediaRaw);
  } catch {
    throw new Error(`Instagram retornou resposta inválida na Etapa 1 do Vídeo: ${mediaRaw.slice(0, 200)}`);
  }

  if (!mediaRes.ok || (mediaData as { error?: { message?: string } }).error) {
    const errMsg = (mediaData as { error?: { message?: string } }).error?.message || mediaRaw.slice(0, 300);
    throw new Error(`Falha ao criar container de vídeo (Etapa 1): ${errMsg}`);
  }

  const creationId = mediaData.id as string | undefined;
  if (!creationId) {
    throw new Error(`Nenhum creationId retornado. Resposta: ${JSON.stringify(mediaData).slice(0, 300)}`);
  }

  console.log("[Instagram] Container de Vídeo criado:", creationId);

  console.log("[Instagram] Etapa 2: Aguardando processamento do vídeo no Instagram...");
  
  // Vídeos demoram mais para processar que imagens, aumentamos o timeout
  const maxAttempts = 20;
  const pollIntervalMs = 5000; // 5 segundos entre checks

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const statusUrl = `${BASE_GRAPH_URL}/${creationId}?fields=status_code,status&access_token=${token}`;
    const statusRes = await fetch(statusUrl);
    const statusRaw = await statusRes.text();

    let statusData: Record<string, unknown>;
    try {
      statusData = JSON.parse(statusRaw);
    } catch {
      continue;
    }

    const statusCode = statusData.status_code as string | undefined;
    console.log(`[Instagram] Polling de Vídeo ${attempt}/${maxAttempts}: status = ${statusCode}`);

    if (statusCode === "FINISHED") {
      break;
    }

    if (statusCode === "ERROR") {
      const statusMsg = statusData.status as string || "Erro desconhecido no processamento do vídeo.";
      throw new Error(`Instagram rejeitou o vídeo: ${statusMsg}. Verifique a URL do vídeo.`);
    }

    if (attempt === maxAttempts) {
      throw new Error(`Timeout: o vídeo não ficou pronto após ${maxAttempts * pollIntervalMs / 1000}s. Status: ${statusCode || "desconhecido"}`);
    }
  }

  console.log("[Instagram] Etapa 3: Publicando o Vídeo (Reels)...");
  const publishUrl = `${BASE_GRAPH_URL}/${businessAccountId}/media_publish`;
  let publishRes: Response;
  try {
    publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: token,
      }),
    });
  } catch (fetchError) {
    throw new Error(`Erro de rede ao publicar Reels: ${fetchError instanceof Error ? fetchError.message : "timeout"}`);
  }

  const publishRaw = await publishRes.text();
  let publishData: Record<string, unknown>;
  try {
    publishData = JSON.parse(publishRaw);
  } catch {
    throw new Error(`Instagram retornou resposta inválida na Etapa 3 do Vídeo: ${publishRaw.slice(0, 200)}`);
  }

  if (!publishRes.ok || (publishData as { error?: { message?: string } }).error) {
    const errMsg = (publishData as { error?: { message?: string } }).error?.message || publishRaw.slice(0, 300);
    throw new Error(`Falha ao publicar Reels (Etapa 3): ${errMsg}`);
  }

  const postId = publishData.id as string;
  console.log("[Instagram] Reels publicado com sucesso! Post ID:", postId);
  return postId;
}

