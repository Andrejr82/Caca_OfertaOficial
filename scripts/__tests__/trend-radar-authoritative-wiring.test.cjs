'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('seven-niche runner is authoritative and does not delegate to legacy commercial runner',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../oracle-trends-radar-runner-seven-niches.cjs'),'utf8');
 assert.equal(src.includes("require('./oracle-trends-radar-runner-final.cjs')"),false);
 assert.equal(src.includes("require('./oracle-trends-radar-runner.cjs')"),false);
 assert.equal(src.includes('target_products'),false);
 assert.match(src,/Shopee/); assert.match(src,/Mercado Livre/); assert.match(src,/Amazon/);
 assert.match(src,/seven_niche_authoritative/);
 assert.match(src,/publishCalls:0/); assert.match(src,/postsWrites:0/); assert.match(src,/offersWrites:0/);
});