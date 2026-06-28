import fs from 'fs';

let content = fs.readFileSync('src/lib/affiliates/scraper.ts', 'utf-8');

// Fix the Amazon specific filter logic
content = content.replace(/const validProducts = fcData\.data\.extract\.products[\s\S]*?\.filter\([\s\S]*?\);/g, 
  `const validProducts = sanitizeScrapedData(fcData.data?.extract?.products || [], "Trends_API");`);

fs.writeFileSync('src/lib/affiliates/scraper.ts', content);
console.log("Scraper updated successfully via regex (Amazon fix).");
