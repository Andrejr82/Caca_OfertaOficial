'use strict';

const fs = require('node:fs');
const path = require('node:path');

const rep = JSON.parse(fs.readFileSync(path.join(__dirname, '../../reports/commercial-niche-sample-validation.json'), 'utf8'));

rep.niches.forEach((n) => {
  console.log(`\n========================================`);
  console.log(`NICHO: ${n.nicheName} (${n.nicheId})`);
  console.log(`========================================`);
  n.terms.forEach((t) => {
    console.log(`\n[${t.tier.toUpperCase()}] Termo: "${t.term}" (Consolidado: ${t.consolidated.status}, Válidos: ${t.consolidated.validTotal})`);
    ['Amazon', 'Shopee', 'Mercado Livre'].forEach((mkt) => {
      const m = t.marketplaces[mkt];
      console.log(`  * ${mkt} (${m.validCount}/${m.rawCount} válidos) [${m.status}]:`);
      if (!m.products || m.products.length === 0) {
        console.log(`    - 0 produtos`);
      } else {
        m.products.forEach((p) => {
          const acc = p.accepted ? 'ACCEPTED' : `REJECTED [${p.rejectionReason}]`;
          const pr = typeof p.price === 'number' ? `R$ ${p.price.toFixed(2)}` : 'R$ unavailable';
          console.log(`    - [${acc}] ${p.title} | ${pr} | ID: ${p.itemId}`);
        });
      }
    });
  });
});
