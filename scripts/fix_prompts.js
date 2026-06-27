const fs = require('fs');
let code = fs.readFileSync('src/lib/affiliates/scraper.ts', 'utf8');
code = code.replace(/const promptText = "([^"]+)"/g, (match, p1) => {
  if (p1.includes("JSON") || p1.includes("json")) return match;
  return `const promptText = "${p1} Responda em formato JSON válido."`;
});
fs.writeFileSync('src/lib/affiliates/scraper.ts', code);
