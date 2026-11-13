import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.resolve('.site/content'),repo='https://github.com/Jin-sjh/ai-knowledge-memory-infrastructure/blob/main/';
const skip=new Set(['.git','.github','.site','.vitepress','node_modules']);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>skip.has(e.name)?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const pages=walk(root).filter(f=>f.endsWith('.md')).map(f=>path.relative(root,f).replaceAll('\\','/'));
const route=p=>p.replace(/(^|\/)README\.md$/,'$1index.md'),pageSet=new Set(pages);
fs.mkdirSync(out,{recursive:true});
for(const f of walk(out))if(f.endsWith('.md'))fs.unlinkSync(f);
const nav=[];
for(const p of pages){
 const lines=fs.readFileSync(p,'utf8').split('\n');let fenced=false,marker='';
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^\s*(\x60{3,}|~{3,})/);
  if(m){if(!fenced){fenced=true;marker=m[1][0];}else if(m[1][0]===marker)fenced=false;continue;}
  if(fenced)continue;
  lines[i]=lines[i].replace(/(\]\()([^)\s]+)(\))/g,(all,start,url,end)=>{
   if(/^(?:https?:|mailto:|#)/.test(url))return all;
   const [dest,hash]=url.split('#'),target=path.posix.normalize(path.posix.join(path.posix.dirname(p),decodeURIComponent(dest)));
   if(!fs.existsSync(path.join(root,target)))throw Error('missing source link '+p+' -> '+url);
   const resolved=pageSet.has(target)?'/'+route(target).replace(/\.md$/,'.html'):repo+target;
   return start+resolved+(hash?'#'+hash:'')+end;
  });
 }
 let source=lines.join('\n');
 if(p==='README.md')source='---\nlayout: home\nhero:\n  name: AI 知识与记忆基础设施\n  text: 从统一模型到工程验证\n  tagline: 知识系统与 Agent 记忆系统并重的中文技术专著\n  actions:\n    - theme: brand\n      text: 开始阅读\n      link: /docs/01-foundations/\n    - theme: alt\n      text: 数据与接口\n      link: /examples/\nfeatures:\n  - title: 基础理论\n    details: 澄清知识、记忆、状态与上下文，建立统一表示和证据模型。\n  - title: 核心机制\n    details: 贯通形成、演进、检索与上下文构建，说明适用条件与失败模式。\n  - title: 工程与验证\n    details: 以架构、接口、选型与实验规程连接理论和实践。\n---\n\n'+source.replace(/^# .+\n\n\*\*.+\*\*\n\n/,'');
 const dest=path.join(out,route(p));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,source);
}
for(const d of fs.readdirSync('docs').filter(d=>/^\d\d-/.test(d)).sort()){
 const title=fs.readFileSync('docs/'+d+'/README.md','utf8').match(/^# (.+)/)[1].replace(/^第 (\d+) 章：/,'$1 ');
 nav.push({text:title,collapsed:true,link:'/docs/'+d+'/',items:fs.readdirSync('docs/'+d).filter(f=>/^\d\d\.md$/.test(f)).sort().map(f=>({text:fs.readFileSync('docs/'+d+'/'+f,'utf8').match(/^# (.+)/)[1],link:'/docs/'+d+'/'+f.replace(/\.md$/,'.html')}))});
}
fs.writeFileSync('.site/navigation.json',JSON.stringify(nav,null,2));
fs.writeFileSync('.site/pages.json',JSON.stringify(pages.map(p=>({source:p,page:route(p).replace(/\.md$/,'.html')})),null,2));
console.log('Prepared '+pages.length+' pages from existing Markdown.');
