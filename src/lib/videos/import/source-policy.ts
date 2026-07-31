const BASE_ALLOWED_HOSTS = new Set([
  "br.shp.ee",
  "s.shopee.com.br",
  "shopee.com.br",
  "sv.shopee.com.br"
]);

const SAFE_MEDIA_TYPES = new Set(["video/mp4", "video/quicktime", "application/octet-stream"]);

export type SourcePolicyErrorCode =
  | "INVALID_URL"
  | "HTTPS_REQUIRED"
  | "EMBEDDED_CREDENTIALS"
  | "SOURCE_HOST_NOT_ALLOWED"
  | "MIME_NOT_ALLOWED"
  | "MEDIA_SIGNATURE_INVALID";

export type PolicyResult = { ok: true } | { ok: false; code: SourcePolicyErrorCode };

function hostnameOf(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function validateSourceUrl(value: string): PolicyResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }

  if (url.protocol !== "https:") return { ok: false, code: "HTTPS_REQUIRED" };
  if (url.username || url.password) return { ok: false, code: "EMBEDDED_CREDENTIALS" };
  if (!BASE_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, code: "SOURCE_HOST_NOT_ALLOWED" };
  if (url.port && url.port !== "443") return { ok: false, code: "SOURCE_HOST_NOT_ALLOWED" };
  return { ok: true };
}

export function isAllowedRedirectHost(host: string, allowedHosts: string[] = [...BASE_ALLOWED_HOSTS]) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((allowed) => normalized === allowed.toLowerCase().replace(/\.$/, ""));
}

export function assertSafeContentType(contentType: string | null | undefined): PolicyResult {
  const normalized = (contentType ?? "").split(";", 1)[0].trim().toLowerCase();
  return SAFE_MEDIA_TYPES.has(normalized) ? { ok: true } : { ok: false, code: "MIME_NOT_ALLOWED" };
}

export function validateMediaSignature(bytes: Uint8Array): PolicyResult {
  const hasFtyp = bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  return hasFtyp ? { ok: true } : { ok: false, code: "MEDIA_SIGNATURE_INVALID" };
}

export function isPrivateIpAddress(hostOrIp: string) {
  const host = hostnameOf(hostOrIp) ?? hostOrIp.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
