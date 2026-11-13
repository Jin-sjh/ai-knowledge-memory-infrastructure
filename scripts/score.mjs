import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function score(gold,predictions,k=5){
 if(!Number.isInteger(k)||k<1)throw Error('K must be positive integer');
 if(!Array.isArray(gold)||!gold.length||!Array.isArray(predictions))throw Error('gold and predictions must be arrays');
 const gids=new Set(gold.map(x=>x.id)),pids=new Set(predictions.map(x=>x.id));
 if(gids.size!==gold.length||pids.size!==predictions.length)throw Error('duplicate query IDs');
 if(gids.size!==pids.size||[...pids].some(id=>!gids.has(id)))throw Error('prediction IDs must exactly match gold');
 let sum=0,answerable=0,unanswerable=0,forbiddenItemCount=0,queriesWithForbidden=0;
 for(const g of gold){
  if(typeof g.id!=='string'||!Array.isArray(g.relevant)||!Array.isArray(g.forbidden)||[...g.relevant,...g.forbidden].some(x=>typeof x!=='string'))throw Error('invalid gold');
  if(g.relevant.some(x=>g.forbidden.includes(x)))throw Error('relevant/forbidden overlap');
  const p=predictions.find(p=>p.id===g.id);
  if(!Array.isArray(p.retrieved)||p.retrieved.some(x=>typeof x!=='string'))throw Error('invalid retrieved IDs');
  const got=[...new Set(p.retrieved)].slice(0,k),rel=[...new Set(g.relevant)];
  if(rel.length){answerable++;sum+=got.filter(x=>rel.includes(x)).length/rel.length;}else unanswerable++;
  const v=got.filter(x=>g.forbidden.includes(x)).length;forbiddenItemCount+=v;if(v)queriesWithForbidden++;
 }
 return {queries:gold.length,k,answerable,unanswerable,macroRecall:answerable?sum/answerable:null,forbiddenItemCount,queriesWithForbidden};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [,,g,p,k]=process.argv;if(!g||!p)throw Error('usage: node scripts/score.mjs gold.json predictions.json [K]');console.log(JSON.stringify(score(JSON.parse(fs.readFileSync(g,'utf8')),JSON.parse(fs.readFileSync(p,'utf8')),k===undefined?5:Number(k)),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
