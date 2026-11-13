import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import schema from '../candidate.schema.json' with {type:'json'};

export const POLICY_VERSION='formation-v1';
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
const scopeKey=s=>[s.tenant_id,s.kind,s.id].join('/');
export const canAccess=(scope,context)=>context.allowed_scopes.includes(scopeKey(scope));
export const sourceKey=s=>s.id+'@'+s.version;

export function acquire(events,context){
 const sources=[],duplicates=[],rejected=[],seen=new Map();
 for(const event of events){
  const s=event.source;
  if(!s||typeof s.id!=='string'||!Number.isInteger(s.version)||s.version<1||typeof s.content!=='string'||!s.content.trim()||!s.scope||!['document','message','tool'].includes(s.kind)||!Number.isFinite(Date.parse(s.recorded_at))){
   rejected.push({event_id:event.event_id,reason:'INVALID_SOURCE'});continue;
  }
  if(!canAccess(s.scope,context)){rejected.push({event_id:event.event_id,reason:'SOURCE_NOT_AUTHORIZED'});continue;}
  const key=sourceKey(s),hash=digest(s);
  if(seen.has(key)){
   if(seen.get(key)!==hash)throw Error('SOURCE_VERSION_COLLISION: '+key);
   duplicates.push({event_id:event.event_id,source_key:key,reason:'SAME_SOURCE_VERSION'});continue;
  }
  seen.set(key,hash);sources.push({...structuredClone(s),source_key:key,source_hash:hash});
 }
 return {sources,duplicates,rejected};
}

export function preprocess(acquisition,{maxChars=240}={}){
 if(!Number.isInteger(maxChars)||maxChars<1)throw Error('invalid maxChars');
 const sources=acquisition.sources.map(s=>{
  const text=s.content.replace(/\r\n?/g,'\n'); // Offsets refer to this normalized snapshot, in UTF-16 code units.
  const chunks=[];let cursor=0,heading=[];
  for(const block of text.split(/\n[ \t]*\n/)){
   const start=text.indexOf(block,cursor),end=start+block.length;cursor=end;
   if(!block.trim())continue;
   for(const line of block.split('\n')){
    const h=line.match(/^(#{1,6})\s+(.+)$/);
    if(h){heading=heading.slice(0,h[1].length-1);heading[h[1].length-1]=h[2];}
   }
   chunks.push({id:s.source_key+'#'+(chunks.length+1),source_key:s.source_key,start,end,text:block,heading_path:heading.filter(Boolean),oversized:block.length>maxChars});
  }
  return {...s,normalized_text:text,chunks};
 });
 return {sources,chunks:sources.flatMap(s=>s.chunks)};
}

const validate=new Ajv({allErrors:true,strict:true}).compile(schema);
export function extractFixtures(candidates){
 return {mode:'offline-fixture',notice:'手写候选，用于验证后续流程；不是模型提取结果。',candidates:structuredClone(candidates)};
}

export function verifyCandidates(prepared,extraction,reviews,context){
 const seen=new Set();
 return extraction.candidates.map(candidate=>{
  const id=typeof candidate?.id==='string'?candidate.id:null;
  const result={candidate_id:id,candidate_hash:digest(candidate),status:'REJECTED',reason:'INVALID_CANDIDATE',candidate};
  if(!validate(candidate))return {...result,details:structuredClone(validate.errors)};
  if(seen.has(id))throw Error('DUPLICATE_CANDIDATE_ID: '+id);seen.add(id);
  const source=prepared.sources.find(s=>s.source_key===candidate.source_key);
  if(!source)return {...result,reason:'SOURCE_UNAVAILABLE'};
  if(!canAccess(source.scope,context))return {...result,reason:'SOURCE_NOT_AUTHORIZED'};
  const chunk=source.chunks.find(c=>c.id===candidate.chunk_id);
  if(!chunk)return {...result,reason:'CHUNK_NOT_FOUND'};
  const first=chunk.text.indexOf(candidate.quote);
  if(first<0)return {...result,reason:'QUOTE_NOT_FOUND'};
  if(chunk.text.indexOf(candidate.quote,first+1)>=0)return {...result,reason:'AMBIGUOUS_QUOTE'};
  const evidence={source_key:source.source_key,source_hash:source.source_hash,origin_id:source.origin_id,
   chunk_id:chunk.id,start:chunk.start+first,end:chunk.start+first+candidate.quote.length,quote:candidate.quote};
  const review=reviews.find(r=>r.candidate_id===id&&r.candidate_hash===result.candidate_hash&&r.source_hash===source.source_hash);
  if(!review)return {...result,status:'NEEDS_REVIEW',reason:'NO_MATCHING_REVIEW',source,evidence};
  if(review.status!=='approved')return {...result,status:review.status==='rejected'?'REJECTED':'NEEDS_REVIEW',reason:review.reason,source,evidence,review};
  return {...result,status:'SUPPORTED',reason:'SCENARIO_REVIEW_APPROVED',source,evidence,review};
 });
}

export function selectCandidates(verified){
 return verified.map(v=>{
  const out={...v,decision:v.status==='NEEDS_REVIEW'?'NEEDS_REVIEW':'REJECTED'};
  if(v.source&&!v.source.retention_allowed)return {...out,decision:'REJECTED',reason:'RETENTION_DENIED'};
  if(v.status!=='SUPPORTED')return out;
  const s=v.source,c=v.candidate;
  if(!s.retention_allowed)return {...out,reason:'RETENTION_DENIED'};
  if(s.retention_basis==='session_only')return {...out,decision:'TRANSIENT',reason:'SESSION_ONLY'};
  if(!['project_approved','explicit_long_term','explicit_delete'].includes(s.retention_basis))return {...out,decision:'NEEDS_REVIEW',reason:'RETENTION_NOT_ESTABLISHED'};
  if(c.type==='preference'&&(s.scope.kind!=='user'||c.subject!==s.actor))return {...out,reason:'SUBJECT_SCOPE_MISMATCH'};
  if(c.type==='rule'&&s.retention_basis!=='project_approved')return {...out,decision:'NEEDS_REVIEW',reason:'RULE_AUTHORITY_NOT_ESTABLISHED'};
  if(c.type==='procedure')return {...out,decision:'NEEDS_REVIEW',reason:'PROCEDURE_REQUIRES_INDEPENDENT_VALIDATION'};
  return {...out,decision:'ACCEPTED',reason:'POLICY_PASSED',policy_version:POLICY_VERSION};
 });
}

export const emptyStore=()=>({items:{},receipts:{},outbox:[],audit:[]});
const objectKey=d=>canonical([d.source.scope,d.candidate.subject,d.candidate.predicate,d.candidate.conditions]);
const fingerprint=c=>digest({type:c.type,subject:c.subject,predicate:c.predicate,value:c.value,conditions:c.conditions,content:c.content});

/** A clone-and-swap transaction simulator; it is not a durable database or crash-safe service. */
export function writeCommand(store,decision,command,context,{failBeforeCommit=false}={}){
 if(!command||typeof command.event_id!=='string'||!command.event_id||!['ADD','UPDATE','NOOP','DELETE'].includes(command.operation)||!Number.isInteger(command.expected_version)||command.expected_version<0)throw Error('INVALID_COMMAND');
 if(!decision||decision.candidate_id!==command.candidate_id||decision.decision!=='ACCEPTED')return {store,result:{event_id:command.event_id,action:'BLOCKED',reason:decision?.reason??'CANDIDATE_NOT_FOUND'}};
 if(!canAccess(decision.source.scope,context)||!context.writable_scopes?.includes(scopeKey(decision.source.scope)))return {store,result:{event_id:command.event_id,action:'BLOCKED',reason:'WRITE_NOT_AUTHORIZED'}};
 // Revisions bind review to the exact candidate and exact source. Never trust an old APPROVED label.
 if(digest(decision.candidate)!==decision.candidate_hash||digest(Object.fromEntries(Object.entries(decision.source).filter(([k])=>!['source_key','source_hash','normalized_text','chunks'].includes(k))))!==decision.source.source_hash)throw Error('VERIFIED_INPUT_MUTATED');
 const key=objectKey(decision),receiptKey=canonical([decision.source.scope.tenant_id,command.event_id,POLICY_VERSION]);
 const requestHash=digest({command,candidate_hash:decision.candidate_hash,source_hash:decision.source.source_hash,scope:decision.source.scope,principal:context.principal_id});
 const old=store.receipts[receiptKey];
 if(old){
  if(old.request_hash!==requestHash)return {store,result:{event_id:command.event_id,action:'CONFLICT',reason:'IDEMPOTENCY_CONFLICT'}};
  return {store,result:{...old.result,replayed:true}};
 }
 const next=structuredClone(store),versions=next.items[key]??[],current=versions.at(-1),version=current?.version??0;
 let result={event_id:command.event_id,action:'NOOP',reason:'SAME_CONTENT',version};
 if(version!==command.expected_version)return {store,result:{event_id:command.event_id,action:'CONFLICT',reason:'VERSION_CONFLICT',current_version:version}};
 if(command.operation==='DELETE'){
  if(decision.source.retention_basis!=='explicit_delete'||decision.source.actor!==context.principal_id)return {store,result:{event_id:command.event_id,action:'BLOCKED',reason:'DELETE_NOT_AUTHORIZED'}};
  if(!current)return {store,result:{event_id:command.event_id,action:'BLOCKED',reason:'DELETE_TARGET_NOT_FOUND'}};
  result={...result,action:'DELETE_REQUESTED',reason:'GOVERNANCE_HANDOFF'};
  next.outbox.push({id:digest(receiptKey),type:'deletion_requested',object_key:key,version});
 }else if(command.operation==='NOOP'){
  if(!current||current.fingerprint!==fingerprint(decision.candidate))return {store,result:{event_id:command.event_id,action:'CONFLICT',reason:'NOOP_CONTENT_MISMATCH'}};
 }else if(current&&current.fingerprint===fingerprint(decision.candidate)){
  // No extra content version; this receipt remains an auditable observation of another source.
 }else{
  if(command.operation==='ADD'&&current)return {store,result:{event_id:command.event_id,action:'CONFLICT',reason:'OBJECT_ALREADY_EXISTS'}};
  if(command.operation==='UPDATE'&&!current)return {store,result:{event_id:command.event_id,action:'CONFLICT',reason:'OBJECT_NOT_FOUND'}};
  const item={version:version+1,scope:decision.source.scope,type:decision.candidate.type,subject:decision.candidate.subject,predicate:decision.candidate.predicate,value:decision.candidate.value,conditions:decision.candidate.conditions,content:decision.candidate.content,evidence:decision.evidence,fingerprint:fingerprint(decision.candidate)};
  next.items[key]=[...versions,item];
  result={...result,action:current?'UPDATE':'ADD',reason:'COMMITTED',version:item.version};
  next.outbox.push({id:digest(receiptKey),type:'index_requested',object_key:key,version:item.version});
 }
 next.audit.push({...result,source_key:decision.source.source_key,candidate_id:decision.candidate_id,policy_version:POLICY_VERSION});
 next.receipts[receiptKey]={request_hash:requestHash,result};
 if(failBeforeCommit)throw Error('SIMULATED_PRECOMMIT_FAILURE');
 return {store:next,result};
}

export function runPipeline(input,{candidates=input.candidates,mode='offline-fixture'}={}){
 const acquisition=acquire(input.events,input.context),prepared=preprocess(acquisition,input.preprocessing);
 const extraction=mode==='offline-fixture'?extractFixtures(candidates):{mode,notice:'模型输出仍是待验证候选。',candidates};
 const verified=verifyCandidates(prepared,extraction,input.reviews,input.context),selected=selectCandidates(verified);
 let store=emptyStore();const results=[];
 for(const cmd of input.commands){const d=selected.find(x=>x.candidate_id===cmd.candidate_id);const w=writeCommand(store,d,cmd,input.context);store=w.store;results.push(w.result);}
 return {acquisition,prepared,extraction,verified,selected,write:{results,store}};
}
