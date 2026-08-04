'use strict';

const STOPWORDS = new Set([
  'de', 'para', 'com', 'sem', 'em', 'da', 'do', 'das', 'dos', 'o', 'a', 'os', 'as', 
  'e', 'ou', 'kit', 'pcs', 'peças', 'unidades', 'tamanho', 'cor', 'frete', 'grátis', 
  'original', 'bivolt', '110v', '220v', 'masculino', 'feminino', 'infantil', 'atacado'
]);

function extractTrigrams(text) {
  const words = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d+[a-z]*$/.test(w)); 
    
  const ngrams = [];
  for (let i = 0; i <= words.length - 3; i++) {
    ngrams.push(words.slice(i, i + 3).join(' '));
  }
  return ngrams;
}

function mineTopTrends(titles, limit = 5) {
  const counts = {};
  titles.forEach(title => {
    const ngrams = extractTrigrams(title);
    const uniqueNgrams = [...new Set(ngrams)];
    uniqueNgrams.forEach(gram => {
      counts[gram] = (counts[gram] || 0) + 1;
    });
  });
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(entry => entry[0]);
}

module.exports = {
  mineTopTrends,
  extractTrigrams
};
