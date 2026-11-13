import {Annotation,StateGraph,MemorySaver,InMemoryStore,START,END} from '@langchain/langgraph';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

/** Real LangGraph objects; no model, embeddings, network request, or simulated Store. */
export async function runLangGraphCase(){
 const store=new InMemoryStore(),checkpointer=new MemorySaver();
 const namespace=user=>['users',user,'preferences'];
 const State=Annotation.Root({
  question:Annotation(),
  observedStyle:Annotation(),
  visits:Annotation({reducer:(previous,next)=>previous+next,default:()=>0})
 });
 const graph=new StateGraph(State)
  .addNode('readPreference',async(_state,config)=>{
   // Demo IDs are fixed inputs. A real service must authenticate/authorize before choosing this namespace.
   const user=config.configurable.user_id;
   const item=await store.get(namespace(user),'answer_style');
   return {observedStyle:item?.value.style??'未设置',visits:1};
  })
  .addEdge(START,'readPreference').addEdge('readPreference',END)
  .compile({checkpointer,store});
 const config=(thread,user)=>({configurable:{thread_id:thread,user_id:user}});
 const a=config('conversation-a','u1'),b=config('conversation-b','u1'),c=config('conversation-c','u2');
 await store.put(namespace('u1'),'answer_style',{style:'详细解释'});
 const first=await graph.invoke({question:'第一次读取'},a);
 await store.put(namespace('u1'),'answer_style',{style:'先给简短结论'});
 const second=await graph.invoke({question:'新会话读取'},b);
 const resumed=await graph.invoke({question:'原会话继续'},a);
 const otherUser=await graph.invoke({question:'另一用户读取'},c);
 const snapshotA=await graph.getState(a),snapshotB=await graph.getState(b);
 const oneKeyCount=(await store.search(namespace('u1'))).length;
 // A broader prefix is accessible through the raw Store API: namespaces alone are not authentication.
 await store.put(namespace('u2'),'answer_style',{style:'使用英语'});
 const broad=await store.search(['users']);
 const freshStoreHasData=(await new InMemoryStore().get(namespace('u1'),'answer_style'))!==null;
 return {
  library:{langgraph:JSON.parse(fs.readFileSync(new URL('../../node_modules/@langchain/langgraph/package.json',import.meta.url),'utf8')).version,
   checkpoint:JSON.parse(fs.readFileSync(new URL('../../node_modules/@langchain/langgraph-checkpoint/package.json',import.meta.url),'utf8')).version},
  observations:[
   {thread:'conversation-a',user:'u1',style:first.observedStyle,visits:first.visits},
   {thread:'conversation-b',user:'u1',style:second.observedStyle,visits:second.visits},
   {thread:'conversation-a',user:'u1',style:resumed.observedStyle,visits:resumed.visits},
   {thread:'conversation-c',user:'u2',style:otherUser.observedStyle,visits:otherUser.visits}
  ],
  checkpointVisits:{a:snapshotA.values.visits,b:snapshotB.values.visits},
  u1KeysAfterOverwrite:oneKeyCount,
  rawStoreBroadPrefixUsers:broad.map(item=>item.namespace[1]).sort(),
  freshStoreHasData,
  scope:'实际调用官方内存 Store 与检查点；不验证模型提取、语义搜索、认证或数据库持久化。'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runLangGraphCase().then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
