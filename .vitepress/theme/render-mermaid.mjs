let queue=Promise.resolve();
export function renderDiagram(id,source,dark){
 const task=queue.then(async()=>{
  const {default:mermaid}=await import('mermaid');
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:dark?'dark':'default',fontFamily:'system-ui, sans-serif'});
  const {svg}=await mermaid.render(id,source);
  return svg;
 });
 queue=task.catch(()=>{});
 return task;
}
