'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('worker aponta para runner V3 autoritativo de 7 nichos',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-worker.cjs'),'utf8');
 assert.match(s,/oracle-trends-radar-runner-seven-niches-v3\.cjs/);
});

test('wrapper V3 injeta contrato product-specific no runner autoritativo',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-runner-seven-niches-v3.cjs'),'utf8');
 assert.match(s,/trend-radar-seven-niches-v3\.cjs/);
 assert.match(s,/createAuthoritativeRadarRunner/);
 assert.equal(s.includes("oracle-trends-radar-runner-final.cjs"),false);
 assert.equal(s.includes("oracle-trends-radar-runner.cjs"),false);
});

test('runner base mantém autoridade e zero publicação',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-runner-seven-niches.cjs'),'utf8');
 assert.match(s,/createAuthoritativeRadarRunner/);
 assert.match(s,/seven_niche_authoritative/);
 assert.match(s,/publishCalls:0/);
 assert.match(s,/postsWrites:0/);
 assert.match(s,/offersWrites:0/);
});
