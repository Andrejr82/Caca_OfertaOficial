const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const reportPath = path.join(root, "reports", "mercadolivre-official-api-test.json");
const siteId = process.env.ML_SITE_ID || process.env.MERCADO_LIVRE_SITE_ID || "MLB";
const query = "smartphone";
const limit = 5;
const apiBase = "https://api.mercadolibre.com";
let report = null;
let wroteReport = false;

function mask(value) {
  if (!value) return "vazio";
  const text = String(value);
  if (text.length <= 8) return `${text.slice(0, 2)}...${text.slice(-2)}`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function loadEnv() {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

function envStatus(key) {
  const value = process.env[key];
  if (value == null) return "ausente";
  if (String(value).trim() === "") return "vazia";
  return "presente";
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function calcDiscount(price, originalPrice) {
  if (typeof price !== "number" || typeof originalPrice !== "number") return null;
  if (!Number.isFinite(price) || !Number.isFinite(originalPrice)) return null;
  if (originalPrice <= 0 || price <= 0 || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
}

function pickImage(item) {
  if (typeof item.thumbnail === "string" && item.thumbnail) return item.thumbnail;
  if (Array.isArray(item.pictures) && item.pictures.length > 0) {
    const first = item.pictures[0] || {};
    return first.secure_url || first.url || null;
  }
  return null;
}

function pickOfficialStoreId(item) {
  if (item.official_store_id != null) return item.official_store_id;
  if (item.seller && item.seller.official_store_id != null) return item.seller.official_store_id;
  return null;
}

function normalizeItem(item) {
  const price = normalizeNumber(item.price);
  const oldPrice = normalizeNumber(item.original_price);
  const imageUrl = pickImage(item);
  return {
    marketplace: "Mercado Livre",
    productId: item.id ?? null,
    title: item.title ?? null,
    price,
    oldPrice,
    discount: calcDiscount(price, oldPrice),
    imageUrl,
    url: item.permalink ?? null,
    sellerId: item.seller?.id ?? null,
    officialStoreId: pickOfficialStoreId(item),
    condition: item.condition ?? null,
    catalogProductId: item.catalog_product_id ?? null,
    source: "mercadolivre_api",
    tokenOptimized: true,
  };
}

async function apiJson(url, token, extraHeaders = {}) {
  const headers = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
  const res = await fetch(url, { headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const url = `${apiBase}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  loadEnv();

  const auditedKeys = [
    "ML_CLIENT_ID",
    "ML_CLIENT_SECRET",
    "ML_ACCESS_TOKEN",
    "ML_REFRESH_TOKEN",
    "ML_USER_ID",
    "ML_REDIRECT_URI",
    "ML_SITE_ID",
    "MERCADO_LIVRE_APP_ID",
    "MERCADO_LIVRE_CLIENT_ID",
    "MERCADO_LIVRE_CLIENT_SECRET",
    "MERCADO_LIVRE_ACCESS_TOKEN",
    "MERCADO_LIVRE_REFRESH_TOKEN",
    "MERCADO_LIVRE_USER_ID",
    "MERCADO_LIVRE_REDIRECT_URI",
    "MERCADO_LIVRE_SITE_ID",
  ];
  const envAudit = Object.fromEntries(auditedKeys.map((key) => [key, envStatus(key)]));

  const appId = firstEnv("ML_CLIENT_ID", "MERCADO_LIVRE_APP_ID", "MERCADO_LIVRE_CLIENT_ID");
  const clientSecret = firstEnv("ML_CLIENT_SECRET", "MERCADO_LIVRE_CLIENT_SECRET");
  let accessToken = firstEnv("ML_ACCESS_TOKEN", "MERCADO_LIVRE_ACCESS_TOKEN");
  const refreshToken = firstEnv("ML_REFRESH_TOKEN", "MERCADO_LIVRE_REFRESH_TOKEN");
  const userId = firstEnv("ML_USER_ID", "MERCADO_LIVRE_USER_ID");
  const redirectUri = firstEnv("ML_REDIRECT_URI", "MERCADO_LIVRE_REDIRECT_URI");
  let refreshUsed = false;

  const authContext = {
    appId: envStatus("MERCADO_LIVRE_APP_ID"),
    clientId: envStatus("MERCADO_LIVRE_CLIENT_ID"),
    clientSecret: envStatus("MERCADO_LIVRE_CLIENT_SECRET"),
    accessToken: envStatus("MERCADO_LIVRE_ACCESS_TOKEN"),
    refreshToken: envStatus("MERCADO_LIVRE_REFRESH_TOKEN"),
    userId: envStatus("MERCADO_LIVRE_USER_ID"),
    redirectUri: redirectUri ? "presente" : "ausente",
    siteId,
  };

  if (!appId || !clientSecret || !accessToken) {
    throw new Error("Credenciais insuficientes para validar Mercado Livre.");
  }

  report = {
    timestamp: new Date().toISOString(),
    envAudit,
    authContext,
    docs: {
      portal: "https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br/",
      users: "https://developers.mercadolivre.com.br/pt_br/usuarios-e-aplicativos",
      products: "https://developers.mercadolivre.com.br/pt_br/guia-para-produtos",
    },
    auth: null,
    search: null,
    normalizedProducts: [],
    coverage: null,
  };
  const writeReport = () => {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    wroteReport = true;
  };

  const usersMeUrl = `${apiBase}/users/me`;
  let usersMe = await apiJson(usersMeUrl, accessToken);
  let refreshNeeded = usersMe.res.status === 401;

  if (refreshNeeded) {
    if (!refreshToken || !appId || !clientSecret) {
      throw new Error("Token expirado e refresh indisponível.");
    }
    const refresh = await refreshAccessToken(refreshToken, appId, clientSecret);
    if (!refresh.res.ok || !refresh.data.access_token) {
      throw new Error(`Refresh falhou: HTTP ${refresh.res.status}`);
    }
    accessToken = refresh.data.access_token;
    refreshUsed = true;
    usersMe = await apiJson(usersMeUrl, accessToken);
  }

  if (!usersMe.res.ok) {
    throw new Error(`/users/me falhou: HTTP ${usersMe.res.status}`);
  }

  report.auth = {
    endpoint: "/users/me",
    status: usersMe.res.status,
    refreshUsed,
    userId: usersMe.data?.id ?? null,
    login: usersMe.data?.nickname ?? usersMe.data?.email ?? null,
  };

  const searchUrl = `${apiBase}/sites/${siteId}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  let search = await apiJson(searchUrl, accessToken);

  if (search.res.status === 401) {
    if (!refreshToken || !appId || !clientSecret) {
      throw new Error("Busca autorizada falhou e refresh indisponível.");
    }
    const refresh = await refreshAccessToken(refreshToken, appId, clientSecret);
    if (!refresh.res.ok || !refresh.data.access_token) {
      throw new Error(`Refresh falhou na busca: HTTP ${refresh.res.status}`);
    }
    accessToken = refresh.data.access_token;
    refreshUsed = true;
    search = await apiJson(searchUrl, accessToken);
  }

  if (!search.res.ok) {
    report.search = {
      endpoint: `/sites/${siteId}/search`,
      status: search.res.status,
      query,
      limit,
      errorMessage: search.data?.message ?? search.data?.error ?? "erro desconhecido",
    };
    writeReport();
    throw new Error(`Busca oficial falhou: HTTP ${search.res.status}`);
  }

  const items = Array.isArray(search.data?.results) ? search.data.results : [];
  const normalizedProducts = items.map(normalizeItem).slice(0, limit);

  const coverage = {
    quantityReturned: items.length,
    titlePresent: items.filter((item) => Boolean(item?.title)).length,
    pricePresent: items.filter((item) => typeof item?.price === "number").length,
    imagePresent: items.filter((item) => Boolean(pickImage(item))).length,
    urlPresent: items.filter((item) => Boolean(item?.permalink)).length,
    officialStoreProven: items.filter((item) => pickOfficialStoreId(item) != null).length,
    oldPriceAvailable: items.filter((item) => typeof item?.original_price === "number").length,
    discountAvailable: items.filter((item) => calcDiscount(normalizeNumber(item?.price), normalizeNumber(item?.original_price)) != null).length,
  };

  report.search = {
    endpoint: `/sites/${siteId}/search`,
    status: search.res.status,
    query,
    limit,
    paging: search.data?.paging ?? null,
    firstProductIds: items.slice(0, limit).map((item) => item?.id ?? null),
  };
  report.normalizedProducts = normalizedProducts;
  report.coverage = coverage;

  writeReport();

  console.log(`env: ${Object.entries(envAudit).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`auth: HTTP ${report.auth.status}, refresh=${report.auth.refreshUsed ? "sim" : "não"}, user=${mask(report.auth.userId)}`);
  console.log(`search: HTTP ${report.search.status}, itens=${coverage.quantityReturned}, relatório=${reportPath}`);
  console.log(JSON.stringify(normalizedProducts, null, 2));
}

main().catch((error) => {
  try {
    if (report && !wroteReport) {
      report.error = {
        message: error.message || String(error),
      };
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
  } catch {}
  console.error(error.message || String(error));
  process.exitCode = 1;
});
