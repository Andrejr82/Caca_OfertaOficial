'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('worker aponta para runner V4 temporal autoritativo',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-worker.cjs'),'utf8');
 assert.match(s,/oracle-trends-radar-runner-seven-niches-v4\.cjs/);
 assert.equal(s.includes('runner-seven-niches-v3.cjs'),false);
});

test('runner V4 usa ledger temporal e contrato V4 sem runner legado',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-runner-seven-niches-v4.cjs'),'utf8');
 assert.match(s,/trend-radar-seven-niches-v4\.cjs/);
 assert.match(s,/trend-radar-observation-history-v1\.cjs/);
 assert.match(s,/fetchObservationHistory/);
 assert.match(s,/persistObservationLedger/);
 assert.match(s,/trend-radar-seven-niches\/v4/);
 assert.equal(s.includes('oracle-trends-radar-runner-final.cjs'),false);
 assert.equal(s.includes("require('./oracle-trends-radar-runner.cjs')"),false);
});

test('V4 mantém três marketplaces e zero publicação',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-runner-seven-niches-v4.cjs'),'utf8');
 assert.match(s,/Shopee/);
 assert.match(s,/Mercado Livre/);
 assert.match(s,/Amazon/);
 assert.match(s,/publishCalls:0/);
 assert.match(s,/postsWrites:0/);
 assert.match(s,/offersWrites:0/);
});
