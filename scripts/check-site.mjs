import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const root=path.resolve('.site/dist'),base='/ai-knowledge-memory-infrastructure/';
const pages=JSON.parse(fs.readFileSync('.site/pages.json','utf8'));
const read=p=>fs.readFileSync(p,'utf8');
for(const p of pages)assert(fs.existsSync(path.join(root,p.page)),'missing built page '+p.page);
const htmlFiles=pages.map(p=>path.join(root,p.page)),errors=[];
let links=0,assets=0;
for(const f of htmlFiles){
 const dom=new JSDOM(read(f)),document=dom.window.document;
 const current=new URL(base+path.relative(root,f).replaceAll('\\','/'),'https://jin-sjh.github.io');
 for(const el of document.querySelectorAll('a[href],script[src],link[href],img[src]')){
  const raw=el.getAttribute('href')??el.getAttribute('src');if(!raw||/^(mailto:|data:|javascript:)/.test(raw))continue;
  const u=new URL(raw,current);if(u.origin!==current.origin)continue;
  if(!u.pathname.startsWith(base)){errors.push(path.relative(root,f)+': outside site base '+raw);continue;}
  let local=decodeURIComponent(u.pathname.slice(base.length));if(!local||local.endsWith('/'))local+='index.html';
  const target=path.resolve(root,local);
  if(!target.startsWith(root+path.sep)){errors.push('path outside output '+raw);continue;}
  if(!fs.existsSync(target)){errors.push(path.relative(root,f)+': missing '+raw);continue;}
  if(el.tagName==='A'){
   links++;
   if(u.hash&&local.endsWith('.html')){
    const doc=target===f?document:new JSDOM(read(target)).window.document;
    if(!doc.getElementById(decodeURIComponent(u.hash.slice(1))))errors.push(path.relative(root,f)+': missing anchor '+raw);
   }
  }else assets++;
 }
 dom.window.close();
}
assert.equal(errors.length,0,errors.slice(0,20).join('\n'));
const chapterPaths=pages.filter(p=>/^docs\/\d\d-[^/]+\/index\.html$/.test(p.page));
assert.equal(chapterPaths.length,8);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const themeBundle=walk(path.join(root,'assets')).filter(f=>f.endsWith('.js')).map(read).join('\n');
assert(read(path.join(root,'index.html')).includes('搜索全书'),'missing Chinese search UI');
assert(themeBundle.includes('Intl.Segmenter'),'missing Chinese segmentation');
assert(themeBundle.includes('mermaid'),'missing diagram client');
console.log(JSON.stringify({builtPages:pages.length,chapterIndexes:chapterPaths.length,localHtmlLinks:links,localAssetReferences:assets,base,searchAndDiagrams:'bundled',result:'passed'},null,2));
