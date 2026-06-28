import fs from 'fs';

let content = fs.readFileSync('src/lib/affiliates/scraper.ts', 'utf-8');

// Inject imports
const importStr = `import { validateHtml, getScrapingPrompt, sanitizeScrapedData } from "@/core/scraper/validator";\n`;
if (!content.includes('import { validateHtml')) {
  const lastImportIndex = content.lastIndexOf('import ');
  const endOfLastImport = content.indexOf('\n', lastImportIndex);
  content = content.slice(0, endOfLastImport + 1) + importStr + content.slice(endOfLastImport + 1);
}

// 1. Replace ALL promptText declarations that start with "Você é um assistente caçador de Achadinhos"
// Notice they span multiple lines and end with "categoria.`;"
// We will use a regex that matches `const promptText = `...`;`
content = content.replace(/const promptText = `Você é um assistente caçador de Achadinhos[\s\S]*?`;/g, 'const promptText = getScrapingPrompt();');

// 2. Validate HTML
// Replace `const textToAnalyze = oracleData.data?.text || oracleData.data?.html;`
// with `const textToAnalyze = oracleData.data?.text || oracleData.data?.html; if (!validateHtml(textToAnalyze, "Scraper")) return [];`
content = content.replace(/const textToAnalyze = oracleData\.data\?\.text \|\| oracleData\.data\?\.html;/g, 
  `const textToAnalyze = oracleData.data?.text || oracleData.data?.html;\n          if (!validateHtml(textToAnalyze, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return []; }`);

// 3. Replace the .filter logic with sanitizeScrapedData
// In the original, it looks like:
// const validProducts = fcData.products
//   .filter((p: any) => p.title && p.price > 0 && ...);
content = content.replace(/const validProducts = fcData\.products[\s\S]*?\.filter\([\s\S]*?\);/g, 
  `const validProducts = sanitizeScrapedData(fcData.products || [], "Trends_API");`);

fs.writeFileSync('src/lib/affiliates/scraper.ts', content);
console.log("Scraper updated successfully via regex.");
