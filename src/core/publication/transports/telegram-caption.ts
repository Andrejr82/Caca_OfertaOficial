const LIMIT = 1024;
const URL_PATTERN = /https?:\/\/\S+/i;

function truncate(text: string, limit: number) {
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, Math.max(limit, 0));
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

export function telegramCaption(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= LIMIT) return normalized;
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const linkIndex = lines.findIndex((line) => URL_PATTERN.test(line));
  if (linkIndex < 0) return truncate(normalized, LIMIT);
  const tail = lines.slice(linkIndex).join("\n\n");
  const body = lines.slice(0, linkIndex).join(" ");
  return [truncate(body, Math.max(0, LIMIT - tail.length - 2)), tail].filter(Boolean).join("\n\n").slice(0, LIMIT);
}
