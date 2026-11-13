import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import MarkdownIt from 'markdown-it';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {score} from './score.mjs';
const root=process.cwd(),md=new MarkdownIt({html:true}),errors=[],tick=String.fromCharCode(96),fence=tick.repeat(3);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>['node_modules','.git','.site','.vitepress','.lab-runs'].includes(e.name)?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(root),markdown=files.filter(f=>f.endsWith('.md')),read=f=>fs.readFileSync(f,'utf8');
const relative=f=>path.relative(root,f).replaceAll('\\','/'),texts=new Map(markdown.map(f=>[f,read(f)]));
function slugs(text){
 const used=new Map(),result=[];
 for(const line of text.split('\n').filter(l=>/^#{1,6} /.test(l))){
  let s=line.replace(/^#{1,6} /,'').replaceAll(tick,'').replace(/[*_~]/g,'').toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu,'').replace(/\s/g,'-');
  const n=used.get(s)||0;used.set(s,n+1);if(n)s+='-'+n;result.push(s);
 }return new Set(result);
}
let links=0,jsonBlocks=0,diagrams=0;
const dom=new JSDOM('<!doctype html><html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;
const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
for(const [file,text]of texts){
 const tokens=md.parse(text,{});
 if(text.split('\n').filter(l=>l.startsWith(fence)).length%2)errors.push(relative(file)+': unbalanced fences');
 const checkLink=url=>{
  if(!url||/^(https?:|mailto:|data:)/i.test(url))return;links++;
  try{const [p,a]=url.split('#'),target=p?path.resolve(path.dirname(file),decodeURIComponent(p)):file;
   if(!target.startsWith(root+path.sep)&&target!==root)throw Error('outside repository');
   if(!fs.existsSync(target))throw Error('missing target '+p);
   if(a&&target.endsWith('.md')&&!slugs(read(target)).has(decodeURIComponent(a)))throw Error('missing anchor '+a);
  }catch(e){errors.push(relative(file)+': '+url+' '+e.message);}
 };
 for(const t of tokens){
  if(t.type==='inline')for(const c of t.children||[]){if(c.type==='link_open')checkLink(c.attrGet('href'));if(c.type==='image')checkLink(c.attrGet('src'));}
  if(t.type==='fence'&&t.info.trim()==='json'){jsonBlocks++;try{JSON.parse(t.content);}catch(e){errors.push(relative(file)+': JSON '+e.message);}}
  if(t.type==='fence'&&t.info.trim()==='mermaid'){diagrams++;try{await mermaid.parse(t.content);}catch(e){errors.push(relative(file)+': Mermaid '+e.message);}}
 }
}
const allJSON=files.filter(f=>f.endsWith('.json')&&!f.endsWith('package-lock.json'));
for(const f of allJSON)try{JSON.parse(read(f));}catch(e){errors.push(relative(f)+': '+e.message);}
const ajv=new Ajv2020({allErrors:true,strict:true});addFormats(ajv);
const validate=ajv.compile(JSON.parse(read('examples/schema/bundle.schema.json'))),bundle=JSON.parse(read('examples/atlas-bundle.json'));
function semantic(b){
 const sources=new Set(b.sources.map(x=>x.id+'@'+x.version)),items=new Set(b.items.map(x=>x.id+'@'+x.version)),eids=new Set(b.evidence.map(x=>x.id));
 assert.equal(sources.size,b.sources.length);assert.equal(items.size,b.items.length);assert.equal(eids.size,b.evidence.length);
 for(const e of b.evidence){assert(sources.has(e.source.id+'@'+e.source.version),'missing source');const s=b.sources.find(s=>s.id===e.source.id&&s.version===e.source.version);assert(s.content.includes(e.quote),'quote not found');}
 for(const i of b.items){
  assert(i.evidence_ids.every(id=>eids.has(id)),'missing evidence');assert(i.valid_to===null||Date.parse(i.valid_to)>Date.parse(i.valid_from),'invalid time');
  if(i.supersedes){assert(items.has(i.supersedes.id+'@'+i.supersedes.version),'missing superseded');assert(i.supersedes.id===i.id&&i.supersedes.version<i.version,'invalid successor');}
  for(const id of i.evidence_ids){const e=b.evidence.find(x=>x.id===id),s=b.sources.find(s=>s.id===e.source.id&&s.version===e.source.version);assert.deepEqual(s.scope,i.scope,'scope mismatch');}
 }
 for(const a of b.artifacts)for(const d of a.depends_on)assert(items.has(d.id+'@'+d.version),'missing dependency');
}
try{
 assert(validate(bundle),JSON.stringify(validate.errors));semantic(bundle);
 const bad=structuredClone(bundle);bad.items[0].version=0;assert.equal(validate(bad),false);
 const missing=structuredClone(bundle);missing.items[0].evidence_ids=['nonexistent'];assert.throws(()=>semantic(missing));
 const time=structuredClone(bundle);time.items[0].valid_to=time.items[0].valid_from;assert.throws(()=>semantic(time));
 const cross=structuredClone(bundle);cross.items[0].scope.tenant_id='other';assert.throws(()=>semantic(cross));
 const g=JSON.parse(read('examples/evaluation/gold.json')),p=JSON.parse(read('examples/evaluation/sample-predictions.json'));
 assert.equal(score(g,p).macroRecall,1);assert.equal(score(g,p).forbiddenItemCount,0);
 const leak=structuredClone(p);leak.find(x=>x.id==='isolation').retrieved=['preference@1'];assert.equal(score(g,leak).queriesWithForbidden,1);
 assert.throws(()=>score(g,p.slice(1)));assert.throws(()=>score(g,[...p,p[0]]));
}catch(e){errors.push('data/scoring: '+e.message);}
const outline=read('sources/outline-v2.md'),sections=[...outline.matchAll(/^### (\d+\.\d+) /gm)],points=[...outline.matchAll(/^- (\d+\.\d+\.\d+) /gm)];
const bodies=[...texts].filter(([f])=>/docs[\\/]\d\d-[^\\/]+[\\/]\d\d\.md$/.test(f));
for(const s of sections)if(bodies.filter(([,t])=>t.startsWith('# '+s[1]+' ')).length!==1)errors.push('section coverage '+s[1]);
for(const p of points)if(bodies.filter(([,t])=>t.includes('### '+p[1]+' ')).length!==1)errors.push('point coverage '+p[1]);
for(const [f,t]of bodies){if(/TODO|TBD|待补充|待撰写/.test(t))errors.push(relative(f)+': placeholder');if([...t.matchAll(/[\u4e00-\u9fff]/g)].length<300)errors.push(relative(f)+': insufficient body');}
for(const [f,t]of texts)for(const m of t.matchAll(/\[R(\d\d)\]/g))if(!texts.get(path.join(root,'docs/references/README.md')).includes('## R'+m[1]+'\n'))errors.push(relative(f)+': unknown reference '+m[1]);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(JSON.stringify({markdown:markdown.length,localLinks:links,chapters:8,sections:sections.length,points:points.length,mermaidParsed:diagrams,jsonFiles:allJSON.length,jsonCodeBlocks:jsonBlocks,schemaAndSemanticChecks:'passed',negativeDataAndScorerChecks:'passed'},null,2));
