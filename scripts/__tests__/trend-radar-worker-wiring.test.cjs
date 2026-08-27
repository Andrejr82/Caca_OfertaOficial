'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('worker aponta para runner de 7 nichos',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-worker.cjs'),'utf8');
 assert.match(s,/oracle-trends-radar-runner-seven-niches\.cjs/);
});

test('runner instala recência antes do runner final',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-runner-seven-niches.cjs'),'utf8');
 const patch=s.indexOf('freshness.filterCandidatesWithRecency');
 const load=s.indexOf("require('./oracle-trends-radar-runner-final.cjs')");
 assert.ok(patch>=0 && load>patch);
});

test('runner reinstala adapters depois do runner final',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','oracle-trends-radar-runner-seven-niches.cjs'),'utf8');
 const load=s.indexOf("require('./oracle-trends-radar-runner-final.cjs')");
 const install=s.indexOf('installSevenNicheRuntime({',load);
 assert.ok(install>load);
});
