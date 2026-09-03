'use client';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { BookOpen, RotateCcw, Sparkles, Braces, X, ArrowRight, ChevronLeft, ChevronRight, Upload, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { createReader, inside, shouldClearSentenceHighlight, TEXT, exampleReferences, runExample, words, type Range, type State } from '@/lib/reader';
import { registerReaderTools, WEBMCP_READY, WEBMCP_USED } from '@/lib/webmcp';
import { ReadingPassage, sourceOffset } from '@/components/reading-passage';
import type { EpubBook, PageBlock } from '@/lib/epub';
import { readStoredBook, saveStoredBook } from '@/lib/book-storage';

export default function Home(){
 const [reader]=useState(()=>createReader(''));const state=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot);
 const [book,setBook]=useState<EpubBook|null>(null),[pageIndex,setPageIndex]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[tocOpen,setTocOpen]=useState(false);
 const [status,setStatus]=useState('Checking WebMCP…'),[active,setActive]=useState<Range|null>(null),[selectionVisible,setSelectionVisible]=useState(false),[notice,setNotice]=useState(''),[explanationTop,setExplanationTop]=useState<number|null>(null),[returnTo,setReturnTo]=useState<{page:number;scroll:number}|null>(null);
 const sourceRef=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null),bookRef=useRef<EpubBook|null>(null),pageRef=useRef(0),requestId=useRef(0),pageStates=useRef(new Map<string,State>());
 const isAnalyzed=state.components.length>0,selection=state.focus??state.selection,sampleReferences=exampleReferences(state),page=book?.pages[pageIndex];
 const hasSelection=selection.end>selection.start;
 const visibleStructures=state.structures.filter(structure=>!state.reordered&&structure.expanded&&structure.openedAt!==undefined&&!state.structures.some(parent=>parent.id!==structure.id&&inside(structure.range,parent.range)&&!parent.expanded)).sort((a,b)=>(b.openedAt??0)-(a.openedAt??0)||a.range.start-b.range.start);
 const hasVisibleExplanations=visibleStructures.length>0||!!state.reference||!!state.plainMeaning||state.notes.length>0;
 const text=(r:Range)=>words(r,state.text);
 function clearHints(){setNotice('');setActive(null);}
 function goTo(index:number,block?:string,scroll=0){
  const b=bookRef.current;if(!b||index<0||index>=b.pages.length)return;
  const old=reader.getSnapshot();if(old.text)pageStates.current.set(old.documentId,old);
  const p=b.pages[index],documentId=b.id+'/'+p.id;
  reader.loadDocument({text:p.text,documentId,formats:p.formats,before:b.pages[index-1]?.text.slice(-2000)??'',after:b.pages[index+1]?.text.slice(0,2000)??''},pageStates.current.get(documentId));
  pageRef.current=index;setPageIndex(index);setSelectionVisible(false);clearHints();setTocOpen(false);
  try{localStorage.setItem('reading:'+b.id,JSON.stringify({page:index,scroll}));}catch{}
  requestAnimationFrame(()=>requestAnimationFrame(()=>{const target=block?Array.from(document.querySelectorAll<HTMLElement>('[data-book-block]')).find(e=>e.dataset.bookBlock===block):null;if(target)target.scrollIntoView({block:'start'});else window.scrollTo({top:scroll,behavior:'instant'});}));
 }
 async function openBook(bytes:ArrayBuffer){
  const id=++requestId.current;setLoading(true);setError('');
  try{const {parseEpub}=await import('@/lib/epub');const next=parseEpub(new Uint8Array(bytes));if(id!==requestId.current)return;
   pageStates.current.clear();reader.loadDocument({text:'',documentId:'loading'});bookRef.current=next;setBook(next);setReturnTo(null);
   let position={page:next.startPage,scroll:0};try{const stored=JSON.parse(localStorage.getItem('reading:'+next.id)??'null');if(stored&&Number.isInteger(stored.page)&&stored.page>=0&&stored.page<next.pages.length)position={page:stored.page,scroll:Math.max(0,Number(stored.scroll)||0)};}catch{}
   goTo(position.page,undefined,position.scroll);setLoading(false);return true;
  }catch(e){if(id===requestId.current){setError(e instanceof Error?e.message:'This EPUB could not be opened.');setLoading(false);}return false;}
 }
 useEffect(()=>{let cancelled=false;void(async()=>{try{const stored=await readStoredBook().catch(()=>null);if(cancelled)return;if(stored&&await openBook(stored.bytes))return;const response=await fetch('/books/the-way-by-swanns.epub');if(!response.ok)throw new Error('The pre-loaded book could not be opened.');if(cancelled)return;if(await openBook(await response.arrayBuffer()))await saveStoredBook(null).catch(()=>{});}catch(e){if(!cancelled){setError(e instanceof Error?e.message:'The book could not be opened.');setLoading(false);}}})();return()=>{cancelled=true;requestId.current++;};},[]);
 useEffect(()=>registerReaderTools(reader,setStatus),[reader]);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const save=()=>{clearTimeout(timer);timer=setTimeout(()=>{const b=bookRef.current;if(b)try{localStorage.setItem('reading:'+b.id,JSON.stringify({page:pageRef.current,scroll:window.scrollY}));}catch{}},200);};window.addEventListener('scroll',save,{passive:true});return()=>{window.removeEventListener('scroll',save);clearTimeout(timer);};},[]);
 useLayoutEffect(()=>{
  const root=sourceRef.current;if(!root||!hasSelection||!hasVisibleExplanations){setExplanationTop(null);return;}
  let frame=0;
  const position=()=>{const selected=Array.from(root.querySelectorAll<HTMLElement>('[data-source-start][data-source-end]')).filter(el=>Number(el.dataset.sourceStart)<state.selection.end&&Number(el.dataset.sourceEnd)>state.selection.start);const rects=selected.flatMap(el=>Array.from(el.getClientRects())).filter(rect=>rect.width||rect.height);if(!rects.length){setExplanationTop(null);return;}const last=rects.reduce((best,rect)=>rect.bottom>best.bottom+1||(Math.abs(rect.bottom-best.bottom)<=1&&rect.right>best.right)?rect:best);setExplanationTop(Math.round(last.bottom-root.getBoundingClientRect().top+12));};
  frame=requestAnimationFrame(position);const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position);});observer.observe(root);window.addEventListener('resize',position);return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',position);};
 },[state,pageIndex,hasSelection,hasVisibleExplanations]);
 async function upload(file?:File){if(!file)return;if(!/\.epub$/i.test(file.name)){setError('Choose an .epub file.');return;}if(file.size>35*1024*1024){setError('Please choose an EPUB smaller than 35 MB.');return;}const bytes=await file.arrayBuffer();if(await openBook(bytes)){try{await saveStoredBook({bytes,name:file.name});}catch{setNotice('Book opened. This browser could not save it for your next visit.');}}if(fileRef.current)fileRef.current.value='';}
 function captureSelection(){const sel=window.getSelection(),root=sourceRef.current;if(!root||!sel||sel.isCollapsed||!sel.rangeCount)return;const r=sel.getRangeAt(0);if(!root.contains(r.startContainer)||!root.contains(r.endContainer))return;
  const start=sourceOffset(r.startContainer,r.startOffset,false),end=sourceOffset(r.endContainer,r.endOffset,true);if(start===null||end===null)return;
  if(start>=end||(state.reordered&&r.toString().trim()!==state.text.slice(start,end).trim())){setNotice('Select one phrase at a time in the reordered text, or restore the original order.');return;}
  if(!page?.blocks.some(b=>inside({start,end},b))){setNotice('Select a sentence or phrase within one paragraph. Surrounding paragraphs remain available to your agent.');return;}
  clearHints();setSelectionVisible(true);if(isAnalyzed&&inside({start,end},state.selection))reader.focus({start,end});else reader.select({start,end});
 }
 function reset(){window.getSelection()?.removeAllRanges();reader.reset();setSelectionVisible(false);clearHints();}
 function clearHighlightOnEmptySpace(event:MouseEvent<HTMLElement>){const target=event.target as HTMLElement,browserSelection=window.getSelection();if(!shouldClearSentenceHighlight(browserSelection?.isCollapsed??true,target.matches('.book-page,.book-text,.book-block,.passage')))return;browserSelection?.removeAllRanges();setSelectionVisible(false);setActive(null);}
 const agentReady=status===WEBMCP_READY||status===WEBMCP_USED;
 function tryExample(){const b=bookRef.current;if(!b)return;const index=b.pages.findIndex(p=>p.text.includes(TEXT));if(index<0)return;goTo(index);runExample(reader);setSelectionVisible(true);const p=b.pages[index],offset=p.text.indexOf(TEXT),block=p.blocks.find(b=>b.start<=offset&&b.end>offset);requestAnimationFrame(()=>requestAnimationFrame(()=>{const target=Array.from(document.querySelectorAll<HTMLElement>('[data-book-block]')).find(e=>e.dataset.bookBlock===block?.sourceId);target?.scrollIntoView({block:'center'});}));}
 function reference(i:number){if(!sampleReferences[i])return;reader.run('trace_references',{revision:state.revision,...sampleReferences[i]},'Example');clearHints();window.getSelection()?.removeAllRanges();}
 function layer(id:string,expand:boolean){reader.run(expand?'expand_modifier':'collapse_modifier',{revision:state.revision,id},'Reader');setActive(expand?reader.getSnapshot().structures.find(s=>s.id===id)?.attachesTo??null:null);}
 function followLink(href:string){if(/^https?:\/\//i.test(href)){window.open(href,'_blank','noopener,noreferrer');return;}const target=book?.targets[href]??book?.targets[href.split('#')[0]];if(target){setReturnTo({page:pageIndex,scroll:window.scrollY});goTo(target.page,target.block);}else setNotice('This link has no readable destination in the EPUB.');}
 function isSelectedBlock(b:PageBlock){return state.selection.end>state.selection.start&&b.start<=state.selection.start&&b.end>=state.selection.end;}
 const nav=<nav aria-label="Book contents" className="book-contents">{book?.toc.map((entry,i)=><button key={entry.href+'-'+i} className={`${entry.depth?'toc-nested ':''}${pageIndex===entry.page?'toc-active':''}`} aria-current={pageIndex===entry.page?'location':undefined} onClick={()=>{setReturnTo(null);goTo(entry.page,entry.block);}}>{entry.label==='2'?'Combray · 2':entry.label}</button>)}</nav>;
 function explanationStack(){return <aside className="explanation-stack" style={{top:explanationTop??0}} aria-label="Sentence explanations" aria-live="polite">
  {visibleStructures.map(structure=><section className="explanation-card modifier-card" key={structure.id}><div className="explanation-card-heading"><span className="eyebrow">MODIFIER</span><button className="icon-button" aria-label={`Close modifier: ${structure.guide}`} onClick={()=>layer(structure.id,false)}><X size={16}/></button></div><div className="explanation-field"><span>ORIGINAL TEXT</span><p className="explanation-quote">“{text(structure.range)}”</p></div><div className="explanation-field"><span>ATTACHES TO</span><p>“{text(structure.attachesTo)}”</p></div><div className="explanation-field"><span>WHAT IT MEANS</span><p>{structure.meaning}</p></div></section>)}
  {state.reference&&<section className="explanation-card"><div className="explanation-card-heading"><div><span className="eyebrow">REFERENCE</span><h2>What this points to</h2></div><button className="icon-button" aria-label="Close reference explanation" onClick={()=>reader.update({reference:null})}><X size={16}/></button></div><div className="explanation-reference"><span>{text(state.reference.source)}</span><ArrowRight size={18}/><span>{text(state.reference.target)}</span></div><p>{state.reference.explanation}</p>{state.reference.ambiguity&&<p><strong>Ambiguity:</strong> {state.reference.ambiguity}</p>}</section>}
  {state.plainMeaning&&<section className="explanation-card plain-meaning-card"><div className="explanation-card-heading"><div><span className="eyebrow">PLAIN-ENGLISH MEANING</span><h2>Last-resort paraphrase</h2></div><button className="icon-button" aria-label="Close plain-English meaning" onClick={()=>reader.update({plainMeaning:null})}><X size={16}/></button></div><p className="explanation-prose">{state.plainMeaning}</p><small>This is a paraphrase, not the author’s wording.</small></section>}
  {state.notes.map((note,i)=><section className="explanation-card" key={i}><div className="explanation-card-heading"><div><span className="eyebrow">STRUCTURAL NOTE</span><h2>Connection to notice</h2></div><button className="icon-button" aria-label="Close structural note" onClick={()=>reader.update({notes:state.notes.filter((_,index)=>index!==i)})}><X size={16}/></button></div><p>{note}</p></section>)}
 </aside>;}
 return <div className="app-shell epub-reader">
  <header className="topbar"><a className="brand" href="/" aria-label="Proust’s Reader home"><span className="brand-icon"><BookOpen size={20}/></span>Proust’s <span className="brand-light">Reader</span></a><div className="header-actions"><button className="text-link upload-button" disabled={loading} onClick={()=>fileRef.current?.click()}><Upload size={15}/>Open EPUB</button><Input ref={fileRef} type="file" accept=".epub,application/epub+zip" className="sr-only" aria-label="Open an EPUB book" onChange={e=>void upload(e.target.files?.[0])}/><div className="tool-status" role="status"><span className={agentReady?'status-dot online':'status-dot'}/><span>{status}</span><Braces size={15}/></div></div></header>
  <main className="reading-layout">
   <aside className="book-rail"><div className="rail-sticky"><div className="rail-label">ON YOUR DESK</div><div className="book-tile"><BookOpen size={19}/><div>{book?.title??'The Way by Swann’s'}<small>{book?.author??'Marcel Proust'}</small></div></div><div className="rail-divider"/><div className="rail-label">CONTENTS</div>{nav}</div></aside>
   <section className="book-page" aria-label="EPUB reader" onClick={clearHighlightOnEmptySpace}><div className="mobile-contents"><button className="text-link" aria-expanded={tocOpen} onClick={()=>setTocOpen(v=>!v)}><List size={16}/>Contents</button>{book?.pages.some(p=>p.text.includes(TEXT))&&<button className="text-link" onClick={tryExample}><Sparkles size={14}/>Try the prepared passage</button>}{tocOpen&&nav}</div>
    <div className="chapter-meta"><span>{book?.title??'THE WAY BY SWANN’S'}</span><span>{page?'READER PAGE '+(pageIndex+1)+' / '+book!.pages.length:'EPUB'}</span></div><h1 className="epub-title">{page?.title??'The Way by Swann’s'}</h1><div className="byline">{book?.author??'MARCEL PROUST'}{book?.translator&&<><span> / </span>{book.translator}, TRANSLATOR</>}</div>
    {error&&<div role="alert" className="book-error"><p>{error}</p></div>}
    {loading?<div className="book-loading" role="status"><BookOpen size={25}/><p>Opening your book…</p></div>:page&&<>
     <div className="page-navigation top-navigation"><button disabled={pageIndex===0} onClick={()=>goTo(pageIndex-1)}><ChevronLeft size={16}/>Previous</button>{returnTo?<button onClick={()=>{const target=returnTo;setReturnTo(null);goTo(target.page,undefined,target.scroll);}}>Return to reading</button>:<span>{pageIndex+1} of {book!.pages.length}</span>}<button disabled={pageIndex===book!.pages.length-1} onClick={()=>goTo(pageIndex+1)}>Next<ChevronRight size={16}/></button></div>
     <div className="book-text" ref={sourceRef} onMouseUp={captureSelection} onKeyUp={captureSelection} onTouchEnd={captureSelection}>
      {page.blocks.map(block=><div key={block.sourceId} data-book-block={block.sourceId} className="book-block">
       <p className={`passage book-${block.kind} ${isAnalyzed&&isSelectedBlock(block)?'is-analyzed':''}`}><ReadingPassage state={state} range={block} active={active} showSelection={selectionVisible} onReference={reference} onLayer={layer} onLink={followLink}/></p>
      </div>)}
      {explanationTop!==null&&hasVisibleExplanations&&explanationStack()}
     </div>
     {!!notice&&<p className="inline-notice standalone-notice" role="status">{notice}</p>}
     <div className="reader-foot"><span>Highlight a sentence to look closer. Click empty page space to remove the highlight.</span></div>
     <div className="page-navigation"><button disabled={pageIndex===0} onClick={()=>goTo(pageIndex-1)}><ChevronLeft size={16}/>Previous</button><span>Reader page {pageIndex+1} of {book!.pages.length}</span><button disabled={pageIndex===book!.pages.length-1} onClick={()=>goTo(pageIndex+1)}>Next<ChevronRight size={16}/></button></div>
    </>}
   </section>
   <aside className="margin"><span className="margin-line"/><span className="eyebrow">A LITTLE WAY IN</span><h2>Unfold the sentence.<br/>Stay in the book.</h2><p>Use only as much scaffolding as the sentence needs. The author’s words stay primary.</p><button className="restore-button" onClick={reset} title="Restore the original text and end this sentence analysis"><RotateCcw size={13}/>Restore original</button><div className="margin-steps"><div><span>1</span>Find the sentence spine</div><div><span>2</span>Open major nested structures</div><div><span>3</span>Try a clearer word order</div><div><span>4</span>Paraphrase only if needed</div></div>{book?.pages.some(p=>p.text.includes(TEXT))&&<><p className="demo-note">The prepared example is here, inside Combray.</p><button className="text-link" onClick={tryExample}><Sparkles size={14}/>Try the prepared passage</button></>}</aside>
  </main>
  <footer className="site-footer"><span>THE WHOLE BOOK. ONE SENTENCE AT A TIME.</span></footer>
 </div>;
}
