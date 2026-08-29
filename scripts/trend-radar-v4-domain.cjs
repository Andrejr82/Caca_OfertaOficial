'use strict';
const HEAD_BLOCKERS=Object.freeze(['tripe','transformador','adaptador de voltagem','conversor de voltagem','cartao de memoria','cabo usb','cabo de dados','suporte para','suporte notebook','suporte monitor','tripe camera','base para']);
const DOMAIN_CONFLICT_PATTERNS=Object.freeze({
 beleza:Object.freeze([/\bautomotiv\w*\b/,/\bcarro\w*\b/,/\bveicul\w*\b/,/\bv\s*floc\b/,/\bvonixx\b/,/\bvintex\b/,/\bpretinho\b/]),
 moda:Object.freeze([/\bporta\s+relogio\b/,/\bporta\s+joia\w*\b/,/\bestojo\s+(?:para\s+)?relogio\b/,/\bbolsa\b.*\blavar\b.*\bteni\w*\b/,/\blavar\b.*\bteni\w*\b/,/\blavar\b.*\bsapato\w*\b/]),
 informatica:Object.freeze([/\bmonitor\b.*\bpressao\b/,/\bpressao\b.*\bmonitor\b/,/\bpressao\s+arterial\b/,/\bmedidor\s+de\s+pressao\b/,/\boximetro\b/,/\bglicemi\w*\b/]),
 eletrodomesticos:Object.freeze([/\borganizad\w*\b.*\bgeladeira\b/,/\bgeladeira\b.*\borganizad\w*\b/,/\bporta\s+frios\b/,/\bsuporte\b.*\bgeladeira\b/,/\bbase\b.*\bgeladeira\b/]),
 ferramentas:Object.freeze([/\badaptador\b.*\bparafusadeira\b/,/\badaptador\b.*\bfuradeira\b/,/\bacessorio\w*\b.*\bparafusadeira\b/,/\bacessorio\w*\b.*\bfuradeira\b/]),
});
const FAMILY_ACCESSORY_PATTERNS=Object.freeze({
 informatica:Object.freeze([/\b(?:mochila|bolsa|capa|case|sleeve|suporte|mesa|base|cooler|carregador|adaptador|hub|dock)\b.*\b(?:notebook|laptop|monitor|computador)\b/,/\b(?:notebook|laptop|monitor|computador)\b.*\b(?:mochila|bolsa|capa|case|sleeve|suporte|mesa|base|cooler|carregador|adaptador|hub|dock)\b/]),
 eletrodomesticos:Object.freeze([/\b(?:organizador|bandeja|suporte|base|capa|protetor|porta)\w*\b.*\b(?:geladeira|freezer|refrigerador|microondas)\b/,/\b(?:geladeira|freezer|refrigerador|microondas)\b.*\b(?:organizador|bandeja|suporte|base|capa|protetor|porta)\w*\b/]),
 ferramentas:Object.freeze([/\b(?:adaptador|broca|mandril|acessorio|extensor|chave)\w*\b.*\b(?:furadeira|parafusadeira)\b/,/\b(?:furadeira|parafusadeira)\b.*\b(?:adaptador|broca|mandril|acessorio|extensor)\w*\b/]),
});
function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function phraseIn(text,phrase){const h=` ${normalize(text)} `,n=` ${normalize(phrase)} `;return n.trim().length>0&&h.includes(n);}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function getDefaultNiches(){return require('./commercial-niche-config.cjs').COMMERCIAL_NICHES;}
function hasDomainConflict(nicheId,candidate={}){const title=normalize(candidate.productName||candidate.title||'');return Boolean(title)&&(DOMAIN_CONFLICT_PATTERNS[nicheId]||[]).some(p=>p.test(title));}
function isPrimaryProductFamilyMatch(candidate={}){const title=normalize(candidate.productName||candidate.title||''),nicheId=candidate.nicheId||candidate.classification?.nicheId||null,matchedTerm=normalize(candidate.matchedTerm||'');if(!title||!nicheId||!matchedTerm||!phraseIn(title,matchedTerm))return false;return !(FAMILY_ACCESSORY_PATTERNS[nicheId]||[]).some(p=>p.test(title));}
function classifyCanonicalNiche(candidate={},niches=null){const registry=niches||getDefaultNiches(),title=normalize(candidate.productName||candidate.title||'');if(!title)return null;const head=title.split(' ').slice(0,7).join(' ');if(HEAD_BLOCKERS.some(term=>phraseIn(head,term)))return null;let best=null;for(const [nicheId,niche] of Object.entries(registry||{})){if(hasDomainConflict(nicheId,candidate))continue;const g=niche?.guardrails||{};if((g.blockedProductTerms||[]).some(t=>phraseIn(title,t)))continue;const matches=(g.allowedProductTerms||[]).filter(t=>phraseIn(title,t));if(!matches.length)continue;const strongest=matches.map(term=>({term,normalized:normalize(term)})).sort((a,b)=>b.normalized.split(' ').length-a.normalized.split(' ').length||b.normalized.length-a.normalized.length)[0],score=strongest.normalized.split(' ').filter(Boolean).length*100+strongest.normalized.length;if(!best||score>best.score)best={nicheId,nicheLabel:niche.name||nicheId,matchedTerm:strongest.normalized,score};}if(!best||!isPrimaryProductFamilyMatch({...candidate,...best}))return null;return best;}
function canonicalMarketplace(value){const raw=String(value||'').trim(),key=normalize(raw);if(key==='amazon')return'Amazon';if(key==='mercado livre')return'Mercado Livre';if(key==='shopee')return'Shopee';return raw;}
function stripMarketplacePrefixes(value,marketplace){let result=String(value||'').trim();const labels=[marketplace,'Amazon','Mercado Livre','Shopee'].filter(Boolean).sort((a,b)=>b.length-a.length);for(let i=0;i<4;i++){const before=result;for(const label of labels){const escaped=String(label).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const prefix=new RegExp(`^${escaped}\\s*:\\s*`,'iu');if(prefix.test(result)){result=result.replace(prefix,'').trim();break;}}if(result===before)break;}return result;}
function resolveIdentity(candidate={}){const marketplace=canonicalMarketplace(candidate.marketplace),raw=candidate.identityKey||candidate.itemId||candidate.productId||candidate.asin||candidate.productName||candidate.title||'',nativeId=stripMarketplacePrefixes(raw,marketplace);return `${marketplace}:${nativeId}`;}
function isAuthoritativeRank(candidate={}){if(candidate.rankAuthoritative===true)return true;const source=normalize(candidate.rankSource||candidate.rankingSource||candidate.provenance||'');return /amazon best sellers|sales rank|salesrank|mercado livre highlights/.test(source);}
function nativeTrendScope(candidate={}){const source=normalize(candidate.marketplaceTrendEvidence?.source||candidate.nativeTrendSource||'');if(source.includes('category'))return'category';if(source.includes('global')||source==='mercadolivre trends')return'global';if(candidate.nativeTrend===true||candidate.marketplaceTrendEvidence)return'native';return null;}
function nativeMatchQuality(candidate={}){const keyword=normalize(candidate.marketplaceTrendEvidence?.keyword||candidate.nativeTrendKeyword||''),title=normalize(candidate.productName||candidate.title||'');if(!keyword||!phraseIn(title,keyword))return 0;return keyword.split(' ').length>=2?10:7;}
function isBestSeller(candidate={}){return candidate.bestSeller===true||candidate.amazonBestSeller===true||candidate.marketplaceDemandEvidence?.type==='BEST_SELLER';}
function candidateImageUrl(candidate={}){const metrics=candidate.marketplaceMetrics&&typeof candidate.marketplaceMetrics==='object'?candidate.marketplaceMetrics:{};return String(candidate.imageUrl||candidate.image_url||metrics.imageUrl||metrics.image_url||'').trim();}
function candidatePermalink(candidate={}){const metrics=candidate.marketplaceMetrics&&typeof candidate.marketplaceMetrics==='object'?candidate.marketplaceMetrics:{};return String(candidate.permalink||candidate.sourceUrl||candidate.productLink||metrics.affiliateUrl||metrics.productLink||'').trim();}
function hasNativeIdentity(candidate={}){const metrics=candidate.marketplaceMetrics&&typeof candidate.marketplaceMetrics==='object'?candidate.marketplaceMetrics:{};return Boolean(String(candidate.itemId||candidate.productId||candidate.asin||candidate.shopeeItemId||metrics.itemId||metrics.item_id||metrics.productId||metrics.product_id||'').trim());}
function validateCommercialContract(candidate={}){
  const metrics=candidate.marketplaceMetrics&&typeof candidate.marketplaceMetrics==='object'?candidate.marketplaceMetrics:{};
  const reasons=[];
  if(!hasNativeIdentity(candidate)) reasons.push('native_identity_required');
  if(!(Number(candidate.currentPrice??candidate.price)>0)) reasons.push('current_price_required');
  if(!/^https:\/\//iu.test(candidateImageUrl(candidate))) reasons.push('image_https_required');
  if(!/^https:\/\//iu.test(candidatePermalink(candidate))) reasons.push('permalink_https_required');
  const available=candidate.available??candidate.inStock??metrics.available??metrics.inStock;
  const stock=candidate.stock??candidate.stockQuantity??metrics.stock??metrics.stockQuantity;
  if(available===false||String(available).toLowerCase()==='false'||(stock!==null&&stock!==undefined&&stock!==''&&Number(stock)<=0)) reasons.push('stock_unavailable');
  return {valid:reasons.length===0,reasons,imageUrl:candidateImageUrl(candidate),permalink:candidatePermalink(candidate)};
}
module.exports={HEAD_BLOCKERS,DOMAIN_CONFLICT_PATTERNS,FAMILY_ACCESSORY_PATTERNS,normalize,phraseIn,num,hasDomainConflict,classifyCanonicalNiche,isPrimaryProductFamilyMatch,canonicalMarketplace,stripMarketplacePrefixes,resolveIdentity,isAuthoritativeRank,nativeTrendScope,nativeMatchQuality,isBestSeller,candidateImageUrl,candidatePermalink,hasNativeIdentity,validateCommercialContract};
