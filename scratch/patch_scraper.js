const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'lib', 'affiliates', 'scraper.ts');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update the ML Prompt
code = code.replace(
  /Extraia os top \$\{limit\} produtos dos resultados de busca para "\$\{category\}". Para cada produto, traga o título, url original do produto lista.mercadolivre.com.br, imagem, o preço promocional \(somente número\) e a categoria do produto \(exemplos: \$\{MAIN_CATEGORY_NAMES\.slice\(0,8\)\.join\([^)]+\)\}\)\. Se tiver preço antigo riscado, traga também\./g,
  `Extraia os top \${limit} produtos dos resultados de busca para "\${category}". Para cada produto, traga o título, url original do produto lista.mercadolivre.com.br, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: \${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). Se tiver preço antigo riscado, traga também. IMPORTANTE: Se não houver produtos, retorne products como vazio. Não invente ou crie produtos falsos (como bebidas ou imagens de example/unsplash).`
);

code = code.replace(
  /Extraia os top \$\{limit\} produtos mais vendidos desta página\. Para cada produto, traga o título completo do produto, a URL completa do produto \(href do link, começando com https:\/\/www\.mercadolivre\.com\.br\/\), a URL da imagem principal do produto e o preço atual como número \(ex: 329\.90\)\. Se tiver preço antigo riscado, traga também\. e a categoria do produto \(exemplos: \$\{MAIN_CATEGORY_NAMES\.slice\(0,8\)\.join\([^)]+\)\}\)\./g,
  `Extraia os top \${limit} produtos mais vendidos desta página. Para cada produto, traga o título completo do produto, a URL completa do produto (href do link, começando com https://www.mercadolivre.com.br/), a URL da imagem principal do produto e o preço atual como número (ex: 329.90). Se tiver preço antigo riscado, traga também. e a categoria do produto (exemplos: \${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). IMPORTANTE: Se não houver produtos, retorne products como vazio. Não invente ou crie produtos falsos (como bebidas ou imagens de example/unsplash).`
);


// 2. Update the ML image proxy bug in enhanceImageUrl
code = code.replace(
  /enhanced = enhanced\.replace\(\/-\[a-zA-Z\]\\\\\.jpg\$\/i, "-O\.jpg"\);/g,
  `// enhanced = enhanced.replace(/-[a-zA-Z]\\.jpg$/i, "-O.jpg"); // Removido para evitar 404 de imagem quebrada no Mercado Livre`
);


// 3. Update all filter conditions across the whole file to prevent mock images
code = code.replace(
  /\.filter\(\(p: any\) => p\.title && p\.price > 0\)/g,
  `.filter((p: any) => p.title && p.price > 0 && !p.image?.includes("unsplash.com") && !p.image?.includes("example.com") && !p.image?.includes("mock"))`
);


fs.writeFileSync(filePath, code);
console.log("Feito! Arquivo modificado.");
