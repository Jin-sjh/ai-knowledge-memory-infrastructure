<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, useId } from 'vue';
import { useData } from 'vitepress';
import { renderDiagram } from './render-mermaid.mjs';
const props=defineProps({source:{type:String,required:true}});
const {isDark}=useData(),svg=ref(''),error=ref(''),code=computed(()=>decodeURIComponent(props.source));
const id='mermaid-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
let alive=true,revision=0;
async function draw(){
 const current=++revision;
 try{const output=await renderDiagram(id,code.value,isDark.value);if(alive&&current===revision){svg.value=output;error.value='';}}
 catch(e){if(alive&&current===revision){svg.value='';error.value='图表暂未渲染，请查看下方源码。';console.error(e);}}
}
onMounted(()=>{draw();watch([code,isDark],draw);});
onBeforeUnmount(()=>{alive=false;revision++;});
</script>
<template>
 <figure class="mermaid-diagram" aria-label="架构与流程图">
  <div v-if="svg" v-html="svg"></div>
  <template v-else><p v-if="error" role="status">{{ error }}</p><pre><code>{{ code }}</code></pre></template>
 </figure>
</template>
