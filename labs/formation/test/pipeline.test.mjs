import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {acquire,preprocess,runPipeline,writeCommand,emptyStore} from '../lib/pipeline.mjs';
import {extractWithModel,makeMessages} from '../lib/model-adapter.mjs';
const input=JSON.parse(fs.readFileSync(new URL('../fixtures/atlas.json',import.meta.url),'utf8'));
const expected=JSON.parse(fs.readFileSync(new URL('../fixtures/expected.json',import.meta.url),'utf8'));
const run=()=>runPipeline(structuredClone(input));
const decision=(r,id)=>r.selected.find(d=>d.candidate_id===id);
const command=id=>input.commands.find(c=>c.event_id===id);
test('scenario decisions and writes match separately authored expectations',()=>{
 const r=run();
 assert.deepEqual(Object.fromEntries(r.selected.map(d=>[d.candidate_id,d.decision])),expected.decisions);
 assert.deepEqual(r.write.results.map(x=>[x.event_id,x.action]),expected.writes);
 assert.equal(Object.keys(r.write.store.items).length,3);
 assert.equal(Object.values(r.write.store.items).flat().length,4);
 assert.equal(r.write.store.outbox.length,5);
});
test('deduplicate source versions, exclude unauthorized data, reject version collisions',()=>{
 const a=acquire(input.events,input.context);assert.equal(a.duplicates.length,1);assert.equal(a.sources.length,12);
 assert(a.rejected.some(x=>x.reason==='SOURCE_NOT_AUTHORIZED'));
 const changed=structuredClone(input.events[0]);changed.source.content+=' changed';
 assert.throws(()=>acquire([input.events[0],changed],input.context),/SOURCE_VERSION_COLLISION/);
});
test('table keeps header and exception together; offsets refer to normalized snapshot',()=>{
 const p=preprocess(acquire(input.events,input.context),input.preprocessing),s=p.sources.find(s=>s.id==='policy'),c=s.chunks.find(c=>c.text.includes('| 普通发布'));
 assert(c.text.includes('| 发布类型'));assert(c.text.includes('24 小时内补复盘'));assert(c.oversized);
 for(const chunk of p.chunks){const source=p.sources.find(s=>s.source_key===chunk.source_key);assert.equal(source.normalized_text.slice(chunk.start,chunk.end),chunk.text);}
});
test('quote exists but unsupported count is rejected',()=>{
 const d=decision(run(),'rule-hallucinated');assert(d.evidence.quote.includes('需要审批'));
 assert.equal(d.reason,'UNSUPPORTED_NUMBER');assert.equal(d.decision,'REJECTED');
});
test('scope smuggling, fabricated quote and foreign source fail closed',()=>{
 const r=run();assert.equal(decision(r,'scope-smuggling').reason,'INVALID_CANDIDATE');
 assert.equal(decision(r,'quote-fabricated').reason,'QUOTE_NOT_FOUND');
 assert.equal(decision(r,'pref-foreign').reason,'SOURCE_UNAVAILABLE');
});
test('temporary, no-save and inferred memories have distinct outcomes',()=>{
 const r=run();assert.equal(decision(r,'pref-temporary').decision,'TRANSIENT');
 assert.equal(decision(r,'pref-no-save').reason,'RETENTION_DENIED');
 assert.equal(decision(r,'pref-inferred').decision,'NEEDS_REVIEW');
});
test('tool success, untested procedures and instructions in data cannot become authoritative',()=>{
 const r=run();assert.equal(decision(r,'tool-goal').reason,'GOAL_NOT_CONFIRMED');
 assert.equal(decision(r,'procedure-unsafe').decision,'NEEDS_REVIEW');
 assert.equal(decision(r,'instruction-in-data').decision,'REJECTED');
});
test('changing a candidate invalidates review even if quote still exists',()=>{
 const x=structuredClone(input);x.candidates.find(c=>c.id==='rule-normal').value='999';
 assert.equal(decision(runPipeline(x),'rule-normal').reason,'NO_MATCHING_REVIEW');
});
test('changing source invalidates review without changing quoted row',()=>{
 const x=structuredClone(input);x.events=x.events.filter(e=>e.event_id!=='ingest-policy-replay');
 x.events[0].source.content+='\n\n补充：以上仅供演练。';
 assert.equal(decision(runPipeline(x),'rule-normal').reason,'NO_MATCHING_REVIEW');
});
test('ambiguous quote does not select arbitrary occurrence',()=>{
 const x=structuredClone(input);x.events.find(e=>e.source.id==='vague-note').source.content='发布前需要审批。发布前需要审批。';
 assert.equal(decision(runPipeline(x),'rule-hallucinated').reason,'AMBIGUOUS_QUOTE');
});
test('receipt replay changes no versions or outbox; same key different payload conflicts',()=>{
 const d=decision(run(),'rule-normal'),cmd=command('write-rule'),a=writeCommand(emptyStore(),d,cmd,input.context);
 const b=writeCommand(a.store,d,cmd,input.context);assert.equal(b.result.replayed,true);assert.deepEqual(a.store,b.store);
 const c=writeCommand(a.store,d,{...cmd,operation:'UPDATE'},input.context);
 assert.equal(c.result.reason,'IDEMPOTENCY_CONFLICT');assert.deepEqual(a.store,c.store);
});
test('stale expected version cannot overwrite current preference',()=>{
 const r=run();assert.equal(r.write.results.find(x=>x.event_id==='write-pref-stale').reason,'VERSION_CONFLICT');
 const versions=Object.values(r.write.store.items).find(v=>v[0].type==='preference');
 assert.equal(versions.length,2);assert.equal(versions.at(-1).value,'brief');
});
test('read access alone does not grant write access',()=>{
 const d=decision(run(),'rule-normal'),ctx={...input.context,writable_scopes:[]};
 assert.equal(writeCommand(emptyStore(),d,command('write-rule'),ctx).result.reason,'WRITE_NOT_AUTHORIZED');
});
test('failure before simulated commit leaves all transaction data unchanged',()=>{
 const store=emptyStore(),d=decision(run(),'rule-normal');
 assert.throws(()=>writeCommand(store,d,command('write-rule'),input.context,{failBeforeCommit:true}),/SIMULATED_PRECOMMIT_FAILURE/);
 assert.deepEqual(store,emptyStore());
});
test('mutation after verification is blocked by writer',()=>{
 const d=structuredClone(decision(run(),'rule-normal'));d.candidate.value='999';
 assert.throws(()=>writeCommand(emptyStore(),d,command('write-rule'),input.context),/VERIFIED_INPUT_MUTATED/);
});
test('DELETE only hands off to governance and is separately authorized',()=>{
 const r=run();assert.equal(r.write.results.find(x=>x.event_id==='request-delete').action,'DELETE_REQUESTED');
 assert(r.write.store.outbox.some(x=>x.type==='deletion_requested'));
 assert(Object.values(r.write.store.items).some(v=>v.at(-1).type==='preference'));
 const d=decision(r,'rule-normal');
 assert.equal(writeCommand(r.write.store,d,{event_id:'bad-delete',candidate_id:d.candidate_id,operation:'DELETE',expected_version:1},input.context).result.reason,'DELETE_NOT_AUTHORIZED');
});
test('adapter uses authorized source subset, bounded output and disallows model review field',async()=>{
 const prepared=preprocess(acquire(input.events,input.context)),messages=makeMessages(prepared);
 assert(!messages[1].content.includes('以后请用英语回复我'));assert(!messages[1].content.includes('深夜工作'));
 let request;const env={FORMATION_API_KEY:'test-key',FORMATION_MODEL:'mock'};
 const result=await extractWithModel(prepared,{env,fetchImpl:async(url,options)=>{
  request=JSON.parse(options.body);assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"candidates":[]}'}}]})};
 }});
 assert.equal(result.mode,'live-model');assert.equal(request.max_completion_tokens,2500);
 await assert.rejects(()=>extractWithModel(prepared,{env,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"candidates":[],"reviews":[]}'}}]})})}),/MODEL_CANDIDATE_ENVELOPE_INVALID/);
});
test('adapter fails on configuration, HTTP errors, truncation, refusal and invalid JSON',async()=>{
 const p=preprocess(acquire(input.events,input.context)),env={FORMATION_API_KEY:'test-key',FORMATION_MODEL:'mock'};
 const response=c=>async()=>({ok:true,json:async()=>({choices:[c]})});
 await assert.rejects(()=>extractWithModel(p,{env:{}}),/MODEL_CONFIG_REQUIRED/);
 await assert.rejects(()=>extractWithModel(p,{env:{...env,FORMATION_BASE_URL:'http://example.com'}}),/MODEL_BASE_URL_INVALID/);
 await assert.rejects(()=>extractWithModel(p,{env,fetchImpl:async()=>({ok:false,status:429})}),/MODEL_HTTP_ERROR: 429/);
 await assert.rejects(()=>extractWithModel(p,{env,fetchImpl:async()=>{throw new DOMException('expired','TimeoutError');}}),/MODEL_TRANSPORT_ERROR/);
 await assert.rejects(()=>extractWithModel(p,{env,fetchImpl:async()=>({ok:true,json:async()=>{throw Error('invalid body');}})}),/MODEL_RESPONSE_NOT_JSON/);
 await assert.rejects(()=>extractWithModel(p,{env,fetchImpl:response({finish_reason:'length',message:{content:'{}'}})}),/MODEL_INCOMPLETE_OUTPUT/);
 await assert.rejects(()=>extractWithModel(p,{env,fetchImpl:response({finish_reason:'stop',message:{content:'not JSON'}})}),/MODEL_CONTENT_NOT_JSON/);
 await assert.rejects(()=>extractWithModel(p,{env,fetchImpl:response({finish_reason:'stop',message:{refusal:'no'}})}),/MODEL_REFUSAL/);
});
