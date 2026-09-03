import { descriptions, jsonSchemas, type Reader, type ToolName } from './reader';

type Tool = { name:string; title:string; description:string; inputSchema:object; annotations:{readOnlyHint:boolean;untrustedContentHint:boolean}; execute:(args:unknown)=>unknown };
type ModelContext = { registerTool:(tool:Tool,options?:{signal:AbortSignal})=>void|Promise<void>; unregisterTool?:(name:string)=>void };
export const WEBMCP_READY = 'WebMCP tools available';
export const WEBMCP_USED = 'WebMCP · agent has called';
const titles:Record<ToolName,string>={
 get_selected_sentence:'Read selected sentence',get_surrounding_context:'Read surrounding context',mark_spine:'Mark sentence spine',unfold_nested_structure:'Unfold nested structure',collapse_modifier:'Collapse structure',expand_modifier:'Expand structure',reorder_syntax:'Reorder syntax',show_plain_meaning:'Show plain meaning'
};

// Return cleanup immediately so a React unmount can cancel in-flight registration.
// Some host browsers install the API after hydration; keep watching until it arrives.
export function registerReaderTools(reader:Reader, onStatus:(s:string)=>void) {
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let api:ModelContext|undefined;
 const registered:string[]=[];
 const release=()=>{
  controller.abort(); clearTimeout(timer);
  for(const name of registered) { try { api?.unregisterTool?.(name); } catch { /* Already removed by the abort signal. */ } }
  registered.length=0;
 };
 async function connect(){
  if(controller.signal.aborted)return;
  const doc=document as Document & {modelContext?:ModelContext};
  const nav=navigator as Navigator & {modelContext?:ModelContext};
  api=doc.modelContext?.registerTool?doc.modelContext:nav.modelContext;
  if(!api?.registerTool){
   onStatus('WebMCP · compatible browser needed');
   timer=setTimeout(()=>void connect(),1500); return;
  }
  try{
   for(const name of Object.keys(descriptions) as ToolName[]){
    if(controller.signal.aborted)return;
    // Record before awaiting: synchronous registration must be cleaned up even
    // when an unmount happens while its returned promise is being resolved.
    const pending=api.registerTool({name,title:titles[name],description:descriptions[name],inputSchema:jsonSchemas[name],annotations:{readOnlyHint:name==='get_selected_sentence'||name==='get_surrounding_context',untrustedContentHint:false},execute:async(args)=>{
     if(controller.signal.aborted)return {isError:true,content:[{type:'text',text:'Reader closed. Discover the tools again.'}]};
     onStatus(WEBMCP_USED);
     return reader.run(name,args,'WebMCP');
    }},{signal:controller.signal});
    registered.push(name);
    await pending;
   }
   if(!controller.signal.aborted)onStatus(WEBMCP_READY);
  }catch(e){
   if(controller.signal.aborted)return;
   release();
   onStatus('WebMCP · registration failed');
   console.warn('Reader WebMCP registration failed',e);
  }
 }
 void connect();
 return release;
}
