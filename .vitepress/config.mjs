import { defineConfig } from 'vitepress';
import fs from 'node:fs';
const chapters=JSON.parse(fs.readFileSync('.site/navigation.json','utf8'));
export default defineConfig({
 lang:'zh-CN',title:'AI 知识与记忆基础设施',
 description:'知识系统与 Agent 记忆系统并重：理论、机制、架构、工程与评测。',
 base:'/ai-knowledge-memory-infrastructure/',srcDir:'.site/content',outDir:'.site/dist',cacheDir:'.site/cache',cleanUrls:false,
 head:[['meta',{name:'theme-color',content:'#0f766e'}]],
 themeConfig:{
  siteTitle:'知识与记忆基础设施',
  nav:[{text:'阅读',link:'/docs/01-foundations/'},{text:'术语表',link:'/docs/appendices/glossary.html'},{text:'参考文献',link:'/docs/references/'},{text:'GitHub',link:'https://github.com/Jin-sjh/ai-knowledge-memory-infrastructure'}],
  sidebar:[...chapters,{text:'附录与设计',collapsed:true,items:[
   {text:'统一术语',link:'/docs/appendices/glossary.html'},
   {text:'Atlas 贯穿案例',link:'/docs/appendices/atlas-case.html'},
   {text:'第三章可运行实验',link:'/labs/formation/'},
   {text:'数据模型与示例',link:'/examples/'},
   {text:'API 契约',link:'/docs/appendices/api-contract.html'},
   {text:'技术选型矩阵',link:'/docs/appendices/technology-matrix.html'},
   {text:'评测规程',link:'/docs/appendices/evaluation-protocol.html'},
   {text:'参考文献',link:'/docs/references/'},
   {text:'大纲覆盖映射',link:'/sources/coverage.html'}
  ]}],
  outline:{level:[2,3],label:'本页目录'},docFooter:{prev:'上一节',next:'下一节'},
  sidebarMenuLabel:'章节目录',returnToTopLabel:'返回顶部',darkModeSwitchLabel:'切换深浅色',
  lightModeSwitchTitle:'切换浅色模式',darkModeSwitchTitle:'切换深色模式',
  search:{provider:'local',options:{
   miniSearch:{options:{tokenize:(text)=>Array.from(new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)).filter(s=>s.isWordLike).map(s=>s.segment)}},
   locales:{root:{translations:{button:{buttonText:'搜索全书',buttonAriaLabel:'搜索全书'},modal:{noResultsText:'没有找到结果',resetButtonTitle:'清空搜索',footer:{selectText:'选择',navigateText:'切换',closeText:'关闭'}}}}}
  }},
  footer:{message:'正文与图表 CC BY 4.0 · 代码与合成数据 MIT',copyright:'© 2026 Jin-sjh 与贡献者'}
 },
 markdown:{config(md){
  const fallback=md.renderer.rules.fence;
  md.renderer.rules.fence=(tokens,idx,...args)=>tokens[idx].info.trim()==='mermaid'
   ?'<MermaidDiagram source="'+encodeURIComponent(tokens[idx].content)+'" />'
   :fallback(tokens,idx,...args);
 }}
});
