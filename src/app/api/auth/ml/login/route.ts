import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Gera um code_verifier aleatório (43-128 chars, RFC 7636)
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Gera o code_challenge a partir do code_verifier usando SHA-256 (S256)
 */
function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * GET /api/auth/ml/login
 * Inicia o fluxo OAuth PKCE do Mercado Livre.
 * Gera code_verifier, armazena em cookie, e redireciona para a URL de autorização do ML.
 */
export async function GET(req: NextRequest) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const clientId = process.env.MERCADO_LIVRE_APP_ID ?? "4737683937591844";
  const redirectUri = process.env.MERCADO_LIVRE_REDIRECT_URI ?? "https://caca-oferta-oficial.vercel.app/api/auth/ml/callback";

  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  console.log("[ML OAuth] Iniciando fluxo PKCE...");
  console.log("[ML OAuth] code_verifier (primeiros 10):", codeVerifier.substring(0, 10) + "...");
  console.log("[ML OAuth] code_challenge:", codeChallenge);

  const response = NextResponse.redirect(authUrl.toString());

  // Salva o code_verifier em cookie seguro (HttpOnly) por 10 minutos
  response.cookies.set("ml_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutos
    path: "/"
  });

  response.cookies.set("ml_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });

  return response;
}
