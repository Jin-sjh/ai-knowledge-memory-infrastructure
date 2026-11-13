import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquire,preprocess,extractFixtures,verifyCandidates,selectCandidates,emptyStore,writeCommand} from './lib/pipeline.mjs';
import {extractWithModel} from './lib/model-adapter.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),stages=['acquire','preprocess','extract','verify','select','write'];
const options={stage:'all',mode:'offline',input:path.join(here,'fixtures/atlas.json'),out:'.lab-runs/formation'};
try{
 const args=process.argv.slice(2),allowed=new Set(['stage','mode','input','out','reviews','candidates']);
 for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||!args[i+1])throw Error('invalid arguments: --stage all|acquire|preprocess|extract|verify|select|write --mode offline|live --input file --out directory [--reviews file] [--candidates file]');options[key]=args[i+1];}
 if(options.stage!=='all'&&!stages.includes(options.stage))throw Error('unknown stage');
 if(!['offline','live'].includes(options.mode))throw Error('unknown mode');
 if(options.mode==='live'&&options.candidates)throw Error('cannot mix live and imported candidates');
 const input=JSON.parse(fs.readFileSync(options.input,'utf8')),snapshots={},stop=options.stage==='all'?5:stages.indexOf(options.stage);
 snapshots.acquire=acquire(input.events,input.context);
 if(stop>=1)snapshots.preprocess=preprocess(snapshots.acquire,input.preprocessing);
 if(stop>=2){
  snapshots.extract=options.mode==='live'?await extractWithModel(snapshots.preprocess):options.candidates?{mode:'imported-candidates',notice:'从指定文件导入，非本次模型生成。',candidates:JSON.parse(fs.readFileSync(options.candidates,'utf8')).candidates}:extractFixtures(input.candidates);
  if(!Array.isArray(snapshots.extract.candidates))throw Error('candidate file requires candidates array');
 }
 const reviews=options.reviews?JSON.parse(fs.readFileSync(options.reviews,'utf8')):options.mode==='live'||options.candidates?[]:input.reviews;
 if(!Array.isArray(reviews))throw Error('reviews must be array');
 if(stop>=3)snapshots.verify=verifyCandidates(snapshots.preprocess,snapshots.extract,reviews,input.context);
 if(stop>=4)snapshots.select=selectCandidates(snapshots.verify);
 if(stop>=5){
  let store=emptyStore();const results=[];
  for(const command of input.commands){const d=snapshots.select.find(x=>x.candidate_id===command.candidate_id),w=writeCommand(store,d,command,input.context);store=w.store;results.push(w.result);}
  snapshots.write={results,store,notice:'仅本进程事务模拟，JSON 快照不是数据库。DELETE_REQUESTED 未实际删除。'};
 }
 fs.mkdirSync(options.out,{recursive:true});
 for(const [stage,data]of Object.entries(snapshots))fs.writeFileSync(path.join(options.out,String(stages.indexOf(stage)+1).padStart(2,'0')+'-'+stage+'.json'),JSON.stringify(data,null,2)+'\n');
 const summary={mode:snapshots.extract?.mode??options.mode,stages:Object.keys(snapshots),sources:snapshots.acquire.sources.length,source_rejections:snapshots.acquire.rejected,duplicates:snapshots.acquire.duplicates.length};
 if(snapshots.select)summary.decisions=snapshots.select.map(x=>({id:x.candidate_id,decision:x.decision,reason:x.reason}));
 if(snapshots.write)summary.writes=snapshots.write.results;
 fs.writeFileSync(path.join(options.out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({output:path.resolve(options.out),...summary},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
