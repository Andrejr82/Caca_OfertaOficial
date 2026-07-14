const SENSITIVE_KEY = /(^|_)(api_?key|token|secret|password|authorization|cookie|prompt|response|payload)($|_)/i;

export function sanitizeObservabilityValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeObservabilityValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeObservabilityValue(nested, depth + 1)
    ]));
  }
  if (typeof value === "string" && value.length > 2_000) return `${value.slice(0, 2_000)}[TRUNCATED]`;
  return value;
}

