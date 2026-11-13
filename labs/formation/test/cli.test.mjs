import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
function withOutput(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formation-cli-'));
 try{fn(dir);}
 finally{
  const base=path.resolve(os.tmpdir())+path.sep,resolved=path.resolve(dir);
  if(!resolved.startsWith(base)||!path.basename(resolved).startsWith('formation-cli-'))throw Error('unsafe cleanup target');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
}
function invoke(args){return spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env:{...process.env,FORMATION_API_KEY:'',FORMATION_MODEL:''}});}
test('acquire stage stops before extraction or writing',()=>withOutput(out=>{
 const p=invoke(['--stage','acquire','--out',out]);assert.equal(p.status,0,p.stderr);
 const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));
 assert.deepEqual(summary.stages,['acquire']);assert.equal(summary.sources,12);
 assert(!fs.existsSync(path.join(out,'03-extract.json')));assert(!fs.existsSync(path.join(out,'06-write.json')));
}));
test('all-stage CLI writes inspectable deterministic results',()=>withOutput(out=>{
 const p=invoke(['--stage','all','--out',out]);assert.equal(p.status,0,p.stderr);
 const w=JSON.parse(fs.readFileSync(path.join(out,'06-write.json'),'utf8'));
 assert.equal(w.results.length,18);assert.equal(Object.keys(w.store.items).length,3);
 assert.equal(w.results.at(-1).replayed,true);
}));
test('importing candidates does not silently reuse fixture approvals',()=>withOutput(out=>{
 const first=invoke(['--stage','extract','--out',out]);assert.equal(first.status,0,first.stderr);
 const second=invoke(['--candidates',path.join(out,'03-extract.json'),'--stage','verify','--out',out]);assert.equal(second.status,0,second.stderr);
 const results=JSON.parse(fs.readFileSync(path.join(out,'04-verify.json'),'utf8'));
 assert.equal(results.find(d=>d.candidate_id==='rule-normal').status,'NEEDS_REVIEW');
}));
test('live extraction without configuration stops before saving fake model output',()=>withOutput(out=>{
 const p=invoke(['--mode','live','--stage','extract','--out',out]);assert.equal(p.status,1);
 assert(p.stderr.includes('MODEL_CONFIG_REQUIRED'));assert(!fs.existsSync(path.join(out,'03-extract.json')));
}));
