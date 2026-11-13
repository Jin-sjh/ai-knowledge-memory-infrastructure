import test from 'node:test';
import assert from 'node:assert/strict';
import {runLangGraphCase} from './langgraph-store.mjs';
test('official Store crosses conversation threads while checkpoints retain separate state',async()=>{
 const r=await runLangGraphCase();
 assert.deepEqual(r.observations,[
  {thread:'conversation-a',user:'u1',style:'详细解释',visits:1},
  {thread:'conversation-b',user:'u1',style:'先给简短结论',visits:1},
  {thread:'conversation-a',user:'u1',style:'先给简短结论',visits:2},
  {thread:'conversation-c',user:'u2',style:'未设置',visits:1}
 ]);
 assert.deepEqual(r.checkpointVisits,{a:2,b:1});
 assert.equal(r.u1KeysAfterOverwrite,1);
 assert.equal(r.freshStoreHasData,false);
});
test('a namespace prefix is data organization, not an authorization boundary',async()=>{
 const r=await runLangGraphCase();assert.deepEqual(r.rawStoreBroadPrefixUsers,['u1','u2']);
});
