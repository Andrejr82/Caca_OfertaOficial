'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const core=require('../trend-radar-seven-niches-v4.cjs');const hist=require('../trend-radar-observation-history-v1.cjs');
const nowMs=Date.now();const now=()=>new Date(nowMs).toISOString();const ago=h=>new Date(nowMs-h*3600000).toISOString();
const niches={
 casa_cozinha_organizacao:{name:'Casa',guardrails:{allowedProductTerms:['air fryer','organizador'],blockedProductTerms:[]}},
 beleza:{name:'Beleza',guardrails:{allowedProductTerms:['serum','condicionador'],blockedProductTerms:[]}},
 moda:{name:'Moda',guardrails:{allowedProductTerms:['relogio','calca jeans'],blockedProductTerms:[]}},
 eletrodomesticos:{name:'Eletro',guardrails:{allowedProductTerms:['geladeira','ar condicionado'],blockedProductTerms:[]}},
 informatica:{name:'Info',guardrails:{allowedProductTerms:['notebook','mouse sem fio'],blockedProductTerms:[]}},
 ferramentas:{name:'Ferramentas',guardrails:{allowedProductTerms:['furadeira','alicate'],blockedProductTerms:[]}},
 pet:{name:'Pet',guardrails:{allowedProductTerms:['tapete higienico'],blockedProductTerms:[]}},
};

test('baseline prefers ~24h and ignores repeated-click observations',()=>{const history=[{sales:6801,observedAt:ago(.27)},{sales:6600,observedAt:ago(25)},{sales:5585,observedAt:ago(240)}];const t=core.calculateTemporal({marketplace:'Shopee',productName:'Tapete Higiênico',sales:6801,observedAt:now()},history);assert.equal(t.salesBaselineTier,'preferred');assert.equal(t.previousSales,6600);assert.equal(t.salesDelta,201);assert.ok(t.salesHours>24&&t.salesHours<26);});

test('when only click-near + old history exist, old baseline is preserved as fallback instead of zero delta',()=>{const history=[{sales:6801,observedAt:ago(.27)},{sales:5585,observedAt:ago(240)}];const t=core.calculateTemporal({marketplace:'Shopee',productName:'Tapete Higiênico',sales:6801,observedAt:now()},history);assert.equal(t.salesBaselineTier,'fallback');assert.equal(t.salesDelta,1216);assert.ok(t.salesVelocityPerDay>100);});

test('real 24h Shopee sales acceleration verifies product',()=>{const c={marketplace:'Shopee',itemId:'p1',productName:'Tapete Higiênico Pet',sales:6801,observedAt:now(),...core.classifyCanonicalNiche({productName:'Tapete Higiênico Pet'},niches),primaryFamilyMatch:true};const out=core.calculateTrendEvidence(c,[{sales:6500,observedAt:ago(24)}]);assert.equal(out.strongSalesAcceleration,true);assert.equal(out.productSpecificStrong,true);assert.equal(out.trending,true);assert.ok(out.trendScore>=50);});

test('10-day cumulative sales momentum alone is not called a daily trend',()=>{const c={marketplace:'Shopee',productName:'Tapete Higiênico Pet',sales:6801,observedAt:now(),nicheId:'pet',matchedTerm:'tapete higienico',primaryFamilyMatch:true};const out=core.calculateTrendEvidence(c,[{sales:5585,observedAt:ago(240)}]);assert.equal(out.sustainedSalesMomentum,true);assert.equal(out.trending,false);});

test('fallback sales momentum can verify only when independently corroborated cross-market',()=>{const c={marketplace:'Shopee',productName:'Tapete Higiênico Pet',sales:6801,observedAt:now(),nicheId:'pet',matchedTerm:'tapete higienico',primaryFamilyMatch:true,crossStrongCount:2};const out=core.calculateTrendEvidence(c,[{sales:5585,observedAt:ago(240)}]);assert.equal(out.fallbackMomentumCorroborated,true);assert.equal(out.trending,true);assert.ok(out.trendScore>=50);});

test('Amazon rank rise over useful window verifies; static best seller does not',()=>{const base={marketplace:'Amazon',productName:'Ar condicionado Split',rank:6,rankSource:'Amazon Best Sellers',rankAuthoritative:true,bestSeller:true,amazonBestSeller:true,observedAt:now(),nicheId:'eletrodomesticos',matchedTerm:'ar condicionado',primaryFamilyMatch:true};const moved=core.calculateTrendEvidence(base,[{rank:18,rankAuthoritative:true,observedAt:ago(24)}]);assert.equal(moved.strongRankRise,true);assert.equal(moved.trending,true);const staticOne=core.calculateTrendEvidence(base,[]);assert.equal(staticOne.trending,false);});

test('ML global term stays partial without history, even with native product corroboration',()=>{const base={marketplace:'Mercado Livre',productName:'Geladeira EOS 230L',observedAt:now(),nicheId:'eletrodomesticos',matchedTerm:'geladeira',primaryFamilyMatch:true,nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'geladeira'}};assert.equal(core.calculateTrendEvidence(base,[]).trending,false);const corroborated=core.calculateTrendEvidence({...base,bestSeller:true,rank:4,rankSource:'Mercado Livre Highlights',rankAuthoritative:true},[]);assert.equal(corroborated.nativeProductCorroborated,true);assert.equal(corroborated.historyAvailable,false);assert.equal(corroborated.trending,false);});

test('accessory false families remain rejected',()=>{assert.equal(core.classifyCanonicalNiche({productName:'Mochila para Notebook 15 polegadas'},niches),null);assert.equal(core.classifyCanonicalNiche({productName:'Organizador para Geladeira com Bandeja'},niches).nicheId,'casa_cozinha_organizacao');assert.equal(core.classifyCanonicalNiche({productName:'Adaptador para Furadeira 90 graus'},niches),null);});

test('snapshot remains capped while ledger can keep the full canonical observation set',()=>{const evaluated=Array.from({length:145},(_,i)=>({identityKey:String(i),nicheId:['pet','beleza','moda','informatica','ferramentas','eletrodomesticos','casa_cozinha_organizacao'][i%7],trendScore:i<2?60:10,trending:i<2,commercialScore:50}));const s=core.selectSnapshot(evaluated);assert.equal(s.persisted.length,20);assert.equal(s.verified.length,2);});

test('ledger row stores stable marketplace identity and current source metrics',()=>{const item={marketplace:'Shopee',itemId:'44001553177',shopId:'99',productName:'Tapete Higiênico Pet',sales:6801,observedAt:now(),nicheId:'pet',nicheLabel:'Pet',matchedTerm:'tapete higienico',trendScore:50,commercialScore:60,productSpecificStrong:true,scope:null,reasons:['x']};const row=hist.buildObservationRow(item,{id:'run',user_id:'user'},core);assert.equal(row.identity_key,'Shopee:44001553177');assert.equal(row.sales,6801);assert.equal(row.trend_strategy_version,'trend-radar-seven-niches-v4');});

test('canonical identity removes repeated marketplace prefixes for Amazon and Mercado Livre',()=>{
  assert.equal(core.resolveIdentity({marketplace:'Amazon',identityKey:'Amazon:Amazon:B077Q4NBGT'}),'Amazon:B077Q4NBGT');
  assert.equal(core.resolveIdentity({marketplace:'Amazon',identityKey:'Amazon:B077Q4NBGT'}),'Amazon:B077Q4NBGT');
  assert.equal(core.resolveIdentity({marketplace:'Mercado Livre',identityKey:'Mercado Livre:Mercado Livre:MLB5074854807'}),'Mercado Livre:MLB5074854807');
});


test('history loader preserves multiple observations per SKU instead of only latest click',async()=>{
  const rows=[
    {identity_key:'Shopee:1',item_id:'1',product_id:null,sales:120,rank_position:null,rank_authoritative:false,observed_at:ago(1)},
    {identity_key:'Shopee:1',item_id:'1',product_id:null,sales:100,rank_position:null,rank_authoritative:false,observed_at:ago(24)},
    {identity_key:'Shopee:1',item_id:'1',product_id:null,sales:80,rank_position:null,rank_authoritative:false,observed_at:ago(240)},
  ];
  const chain={select(){return this},eq(){return this},gte(){return this},order(){return this},limit:async()=>({data:rows,error:null})};
  const client={from(){return chain}};
  const map=await hist.fetchObservationHistory(client,'u',{now:new Date(nowMs)});
  assert.equal(map.get('Shopee:1').length,3);
  assert.equal(map.diagnostics.rows,3);
});

test('ledger persistence stores all evaluated canonical candidates, not only 20 display rows',async()=>{
  const captured=[];const client={from(){return{upsert:async(rows)=>{captured.push(...rows);return{error:null}}}}};
  const evaluated=Array.from({length:145},(_,i)=>({marketplace:'Shopee',itemId:String(i),productName:`Produto ${i}`,observedAt:now(),nicheId:'pet',nicheLabel:'Pet',matchedTerm:'tapete higienico',sales:i,trendScore:10,commercialScore:20,reasons:[]}));
  const result=await hist.persistObservationLedger(client,{id:'run',user_id:'user'},evaluated,core);
  assert.equal(result.rows,145);assert.equal(captured.length,145);
});
