export const TITLE_BLACKLIST_REGEXES: RegExp[] = [
  /^Produto\s*\d*$/i,          // Produto, Produto 1, Produto 2...
  /^Item\s*\d*$/i,             // Item, Item 1...
  /^Example\s*\d*$/i,          // Example...
  /^Placeholder\s*\d*$/i,      // Placeholder...
  /^Lorem\s*ipsum/i,           // Lorem...
  /^Unknown$/i,                // Unknown
  /^Teste$/i,                  // Teste
  /^Generic\s*Product$/i,      // Generic Product
  /^Sem\s*Nome$/i,             // Sem Nome
  /^Produto\s*Gen[ée]rico$/i,  // Produto Genérico
  /Nome\s*limpo\s*do\s*produto/i,
];

export const IMAGE_BLACKLIST = [
  "unsplash.com",
  "picsum.photos",
  "placeholder.com",
  "mock",
  "example.com",
  "data:image", // Bloqueia data uris e base64
  "svg"
];

export function isBlacklistedTitle(title: string): boolean {
  if (!title) return true;
  return TITLE_BLACKLIST_REGEXES.some(regex => regex.test(title.trim()));
}

export function isBlacklistedImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return true; // Rejeita null e undefined
  
  const lowerUrl = imageUrl.toLowerCase();
  
  // Rejeita domínios de mock
  if (IMAGE_BLACKLIST.some(blocked => lowerUrl.includes(blocked))) {
    return true;
  }
  
  // Rejeita URLs que não comecem estritamente com http/https (rejeita relativas)
  if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
    return true;
  }
  
  return false;
}
