'use client';
import { Fragment } from 'react';
import { Plus, Minus } from 'lucide-react';
import { inside, words, type Range, type State } from '@/lib/reader';
import { passageParts } from '@/lib/passage';

export function SourceWords({range,state,active,showSelection,onLink}:{range:Range;state:State;active:Range|null;showSelection:boolean;onLink?:(href:string)=>void}){
 const regions=[...(showSelection&&state.selection.end>state.selection.start?[{...state.selection,style:'selected-words'}]:[]),...(showSelection&&state.focus?[{...state.focus,style:'selected-words'}]:[]),...state.components.map(c=>({...c.range,style:c.role})),...state.structures.filter(s=>s.expanded).map(s=>({...s.range,style:'expanded-words'})),...(active?[{...active,style:'mapped'}]:[])];
 const bounds=new Set([range.start,range.end]);
 for(const r of [...regions,...state.formats])for(const n of [r.start,r.end])if(n>range.start&&n<range.end)bounds.add(n);
 const b=[...bounds].sort((a,b)=>a-b);
 return <>{b.slice(0,-1).map((start,i)=>{const part={start,end:b[i+1]};const styles=regions.filter(r=>inside(part,r)).map(r=>r.style).join(' ');
 const formats=state.formats.filter(f=>inside(part,f));const href=formats.find(f=>f.href)?.href;const image=formats.find(f=>f.image);
 const formatClass=[formats.some(f=>f.italic)?'book-italic':'',formats.some(f=>f.bold)?'book-bold':'',formats.some(f=>f.sup)?'book-sup':''].join(' ');
 const component=state.components.find(c=>inside(part,c.range));
 const roleLabel=component?.role==='predicate'?'Verb':component?.role==='subject'?'Subject':component?'Object / complement':undefined;
 const text=<span data-source-start={part.start} data-source-end={part.end} data-role-label={roleLabel} className={[styles,formatClass].filter(s=>s.trim()).join(' ')}>{image?<img src={image.image} alt={image.alt??'Book illustration'} className="book-image"/>:words(part,state.text)}</span>;
 if(href)return <button className="book-link" key={start} onClick={()=>onLink?.(href)}>{text}</button>;
 return <Fragment key={start}>{text}</Fragment>;})}</>;
}
export function ReadingPassage({state,active,onLayer,range,onLink,showSelection=true}:{state:State;active:Range|null;onLayer:(id:string,expand:boolean)=>void;range?:Range;onLink?:(href:string)=>void;showSelection?:boolean}){
 // A single paragraph is the document and the explanation, never a second copy.
 return <>{passageParts(state,range).map((p,i)=>{const structure=state.structures.find(s=>s.id===p.chip);
 return <Fragment key={`${p.range.start}-${i}`}>
 {i>0&&state.reordered&&p.moved&&<span data-generated="true"> </span>}
 {p.prefix&&<span className="added-word" data-generated="true">{p.prefix}</span>}
 {structure?<button className="branch-chip" data-source-start={structure.range.start} data-source-end={structure.range.end} aria-expanded={false} aria-label={`Expand: ${structure.guide}`} onClick={()=>onLayer(structure.id,true)}><Plus size={12}/>{structure.guide}</button>:
 <span className={p.moved?'moved-phrase':''}><SourceWords range={p.range} state={state} active={active} showSelection={showSelection} onLink={onLink}/></span>}
 {p.closes.map(id=><button key={id} className="inline-collapse" onClick={()=>onLayer(id,false)} aria-label={`Collapse: ${state.structures.find(s=>s.id===id)?.guide}`}><Minus size={12}/></button>)}
 </Fragment>;})}</>;
}
// Convert DOM selection endpoints to immutable source coordinates. Counting the
// paragraph's textContent would include button labels and break after folding.
export function sourceOffset(node:Node,offset:number,end:boolean):number|null{
 const element=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
 const source=element?.closest<HTMLElement>('[data-source-start]');
 if(source){const r=document.createRange();r.selectNodeContents(source);r.setEnd(node,offset);return Math.min(Number(source.dataset.sourceEnd),Number(source.dataset.sourceStart)+r.toString().length);}
 if(node.nodeType===Node.ELEMENT_NODE){const children=node.childNodes;const child=children[end?offset-1:offset];if(!child)return null;const el=child.nodeType===Node.ELEMENT_NODE?child as Element:child.parentElement;const spans=el?.querySelectorAll<HTMLElement>('[data-source-start]');const span=el?.matches('[data-source-start]')?el as HTMLElement:spans?.[end?spans.length-1:0];if(span)return Number(end?span.dataset.sourceEnd:span.dataset.sourceStart);}
 return null;
}
