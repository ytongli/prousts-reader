import { inside, overlap, type Range, type State } from './reader';
export type PassagePart = {range:Range; prefix?:string; chip?:string; closes:string[]; moved:boolean};
// Build one reading surface in source order or the requested display order.
// Source coordinates never change, even when visible text is folded or moved.
export function passageParts(state:State,scope:Range={start:0,end:state.text.length}):PassagePart[]{
 const ordered=[{range:{start:0,end:state.selection.start}},...(state.reordered??[{range:state.selection}]),{range:{start:state.selection.end,end:state.text.length}}];
 const collapsed=state.structures.filter(s=>!s.expanded).filter(s=>!state.structures.some(p=>p.id!==s.id&&!p.expanded&&inside(s.range,p.range)));
 const seen=new Set<string>();const result:PassagePart[]=[];
 for(const original of ordered){
  if(!overlap(original.range,scope))continue;
  const chunk={...original,range:{start:Math.max(original.range.start,scope.start),end:Math.min(original.range.end,scope.end)}};
  if(chunk.range.start===chunk.range.end)continue;
  const bounds=new Set([chunk.range.start,chunk.range.end]);
  for(const s of state.structures)for(const n of [s.range.start,s.range.end])if(n>chunk.range.start&&n<chunk.range.end)bounds.add(n);
  const b=[...bounds].sort((a,b)=>a-b);
  for(let i=0;i<b.length-1;i++){
   const range={start:b[i],end:b[i+1]};const hidden=collapsed.find(s=>inside(range,s.range));
   if(hidden){if(seen.has(hidden.id))continue;seen.add(hidden.id);result.push({range:hidden.range,chip:hidden.id,closes:[],moved:!!state.reordered});}
   else result.push({range,prefix:i===0?chunk.prefix:undefined,closes:[],moved:!!state.reordered&&inside(range,state.selection)});
  }
 }
 for(const s of state.structures.filter(s=>s.expanded)){
  if(collapsed.some(p=>inside(s.range,p.range)))continue;
  for(let i=result.length-1;i>=0;i--)if(overlap(result[i].range,s.range)){result[i].closes.push(s.id);break;}
 }
 return result;
}
