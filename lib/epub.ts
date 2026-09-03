import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom';
export type TextFormat={start:number;end:number;italic?:boolean;bold?:boolean;sup?:boolean;href?:string;image?:string;alt?:string};
export type BookBlock={text:string;kind:string;formats:TextFormat[];sourceId:string};
export type PageBlock=BookBlock&{start:number;end:number};
export type BookPage={id:string;section:number;title:string;path:string;text:string;blocks:PageBlock[];formats:TextFormat[]};
export type TocEntry={label:string;href:string;depth:number;page:number;block?:string};
export type EpubBook={id:string;title:string;author:string;translator:string;pages:BookPage[];toc:TocEntry[];targets:Record<string,{page:number;block?:string}>;startPage:number};
const local=(n:XmlNode)=>n.localName??n.nodeName.split(':').at(-1)??'';
const elements=(n:XmlNode):XmlElement[]=>Array.from(n.childNodes??[]).filter(x=>x.nodeType===1) as XmlElement[];
const descendants=(n:XmlNode,name:string):XmlElement[]=>elements(n).flatMap(e=>[...(local(e)===name?[e]:[]),...descendants(e,name)]);
export function resolveEpubPath(base:string,href:string){
 if(/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href))return /^https?:/i.test(href)?href:'';
 let decoded=href;try{decoded=decodeURIComponent(href);}catch{}
 const [path,fragment]=decoded.split('#');const parts=(path?base.split('/').slice(0,-1).concat(path.split('/')):base.split('/')).reduce<string[]>((a,p)=>{if(p==='..')a.pop();else if(p&&p!=='.')a.push(p);return a;},[]);
 return parts.join('/')+(fragment?'#'+fragment:'');
}
const parseXML=(s:string)=>new DOMParser({onError:(level,message)=>{if(level!=='warning')throw new Error('Invalid EPUB XML: '+message.slice(0,120));}}).parseFromString(s.replace(/<!DOCTYPE[^>]*>/gi,''),'application/xhtml+xml');
function imageData(bytes:Uint8Array,mime:string){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+mime+';base64,'+btoa(s);}
export function parseEpub(bytes:Uint8Array):EpubBook{
 if(bytes.length>35*1024*1024)throw new Error('Please choose an EPUB smaller than 35 MB.');
 let total=0,count=0;
 const files=unzipSync(bytes,{filter:entry=>{if(++count>5000)throw new Error('This EPUB has too many files.');if(entry.originalSize>30*1024*1024||(total+=entry.originalSize)>100*1024*1024)throw new Error('This EPUB is too large to open.');return /\.(?:xml|opf|ncx|xhtml|html|htm|jpg|jpeg|png|gif|webp)$/i.test(entry.name)||entry.name==='mimetype';}});
 if(!files['META-INF/container.xml'])throw new Error('This file is not a valid EPUB.');
 const xml=(path:string)=>{if(!files[path])throw new Error('The EPUB is missing '+path);const s=strFromU8(files[path]);if(/<!ENTITY\s/i.test(s))throw new Error('EPUBs with custom XML entities are not supported.');return parseXML(s);};
 if(files['META-INF/encryption.xml']){const encrypted=xml('META-INF/encryption.xml');const refs=descendants(encrypted,'CipherReference');if(refs.some(r=>/\.(x?html?|xml)$/i.test(r.getAttribute('URI')??'')))throw new Error('This EPUB is encrypted and cannot be opened here.');}
 const container=xml('META-INF/container.xml');const opfPath=descendants(container,'rootfile')[0]?.getAttribute('full-path');if(!opfPath)throw new Error('Missing EPUB package.');
 const opf=xml(opfPath);const metadata=descendants(opf,'metadata')[0];
 const meta=(name:string)=>metadata?descendants(metadata,name).map(e=>e.textContent?.trim()??'').filter(Boolean).join(', '):'';
 const manifest=new Map(descendants(opf,'item').map(e=>[e.getAttribute('id')!,{path:resolveEpubPath(opfPath,e.getAttribute('href')??''),type:e.getAttribute('media-type')??'',properties:e.getAttribute('properties')??''}]));
 const spine=descendants(opf,'itemref').map(e=>manifest.get(e.getAttribute('idref')??'')).filter((x):x is NonNullable<typeof x>=>!!x);
 if(!spine.length)throw new Error('This EPUB has no reading order.');
 const navEntries:{label:string;href:string;depth:number}[]=[];
 const nav=[...manifest.values()].find(m=>m.properties.split(' ').includes('nav'));
 if(nav){const doc=xml(nav.path);const toc=descendants(doc,'nav').find(e=>(e.getAttribute('epub:type')??e.getAttribute('type')??'').includes('toc'))??descendants(doc,'nav')[0];if(toc){const walk=(el:XmlNode,depth:number)=>{for(const child of elements(el)){if(local(child)==='a')navEntries.push({label:child.textContent?.trim()??'',href:resolveEpubPath(nav.path,child.getAttribute('href')??''),depth:Math.max(0,depth-1)});else walk(child,depth+(local(child)==='ol'?1:0));}};walk(toc,0);}}
 if(!navEntries.length){const ncx=[...manifest.values()].find(m=>m.type==='application/x-dtbncx+xml');if(ncx){const navMap=descendants(xml(ncx.path),'navMap')[0];const walk=(el:XmlNode,depth:number)=>{for(const point of elements(el).filter(e=>local(e)==='navPoint')){const label=descendants(point,'navLabel')[0]?.textContent?.trim()??'';const content=elements(point).find(e=>local(e)==='content');navEntries.push({label,href:resolveEpubPath(ncx.path,content?.getAttribute('src')??''),depth});walk(point,depth+1);}};if(navMap)walk(navMap,0);}}
 const pages:BookPage[]=[];const targets:Record<string,{page:number;block?:string}>={};let lastTitle='';const allText:string[]=[];
 for(let section=0;section<spine.length;section++){
  const item=spine[section];if(!/html|xml/.test(item.type))continue;
  const doc=xml(item.path),body=descendants(doc,'body')[0];if(!body)continue;
  const blocks:BookBlock[]=[];const anchors:Record<string,number>={};let text='',formats:TextFormat[]=[],kind='p';
  const flush=()=>{const left=text.length-text.trimStart().length;const trimmed=text.trim();if(trimmed){blocks.push({text:trimmed,kind,sourceId:item.path+'@'+blocks.length,formats:formats.map(f=>({...f,start:Math.max(0,f.start-left),end:Math.min(trimmed.length,f.end-left)})).filter(f=>f.end>f.start)});}text='';formats=[];kind='p';};
  const append=(s:string,style:Omit<TextFormat,'start'|'end'>)=>{let t=s.replace(/[\t\r\n ]+/g,' ');if(!text||/\s$/.test(text))t=t.replace(/^ +/,'');if(!t)return;const start=text.length;text+=t;if(Object.keys(style).length)formats.push({...style,start,end:text.length});};
  const walk=(node:XmlNode,style:Omit<TextFormat,'start'|'end'>={})=>{
   if(node.nodeType===3||node.nodeType===4){append(node.nodeValue??'',style);return;}
   if(node.nodeType!==1)return;const el=node as XmlElement,tag=local(el);
   if(['script','style','iframe','object','embed','audio','video','form'].includes(tag))return;
   const block=/^(p|h[1-6]|li|blockquote|pre|dt|dd)$/.test(tag);if(block){flush();kind=tag;}
   if(el.getAttribute('id'))anchors[el.getAttribute('id')!]=blocks.length;
   const next={...style};if(['em','i'].includes(tag))next.italic=true;if(['b','strong'].includes(tag))next.bold=true;if(tag==='sup')next.sup=true;
   if(tag==='a'&&el.getAttribute('href')){const href=resolveEpubPath(item.path,el.getAttribute('href')!);if(href)next.href=href;}
   if(tag==='br'){text+='\n';return;}
   if(tag==='img'||tag==='image'){
    const src=el.getAttribute('src')??el.getAttribute('xlink:href')??el.getAttribute('href');if(src){const path=resolveEpubPath(item.path,src);const asset=files[path];const ext=path.split('.').at(-1)?.toLowerCase();if(asset&&['png','jpg','jpeg','gif','webp'].includes(ext??'')){append('\uFFFC',{...next,image:imageData(asset,ext==='jpg'?'image/jpeg':'image/'+ext),alt:el.getAttribute('alt')??'Book illustration'});}}
   }else for(const child of Array.from(node.childNodes??[]))walk(child,next);
   if(block||['div','section','article','table','tr'].includes(tag))flush();
  };
  walk(body);flush();
  if(!blocks.length)continue;
  allText.push(...blocks.map(b=>b.text));
  const title=navEntries.find(e=>e.href===item.path)?.label||blocks.find(b=>/^h/.test(b.kind))?.text||lastTitle||'Section '+(section+1);lastTitle=title;
  const sectionFirst=pages.length;let group:BookBlock[]=[];let length=0;
  const emit=()=>{if(!group.length)return;let content='';const pageBlocks:PageBlock[]=[];const pageFormats:TextFormat[]=[];for(const b of group){if(content)content+='\n\n';const start=content.length;content+=b.text;pageBlocks.push({...b,start,end:content.length});pageFormats.push(...b.formats.map(f=>({...f,start:f.start+start,end:f.end+start})));targets[b.sourceId]={page:pages.length,block:b.sourceId};}
   const firstIndex=blocks.indexOf(group[0]);const pageTitle=navEntries.filter(e=>e.href.startsWith(item.path+'#')&&(anchors[e.href.split('#')[1]]??Infinity)<=firstIndex).at(-1)?.label??title;
   pages.push({id:item.path+':'+pages.length,section,title:pageTitle==='2'?'Combray · 2':pageTitle,path:item.path,text:content,blocks:pageBlocks,formats:pageFormats});group=[];length=0;};
  for(const block of blocks){if(length>6000&&group.length)emit();group.push(block);length+=block.text.length;}emit();
  targets[item.path]={page:sectionFirst};for(const [id,index]of Object.entries(anchors)){const block=blocks[Math.min(index,blocks.length-1)];if(block)targets[item.path+'#'+id]=targets[block.sourceId];}
 }
 if(!pages.length)throw new Error('No readable content was found in this EPUB.');
 const toc=navEntries.filter(e=>targets[e.href]||targets[e.href.split('#')[0]]).map(e=>({...e,...(targets[e.href]??targets[e.href.split('#')[0]])}));
 let title=meta('title')||'Untitled book';let translator=metadata?descendants(metadata,'creator').filter(e=>(e.getAttribute('opf:role')??'')==='trl').map(e=>e.textContent?.trim()).join(', '):'';
 const bookText=allText.slice(0,100).join(' ');
 // This package uses the series title in OPF; its actual volume and translator are on the title page.
 if(meta('identifier').includes('9780141914152')&&bookText.includes('Lydia Davis')){title='The Way by Swann’s';translator='Lydia Davis';}
 let hash=2166136261;for(const b of bytes)hash=Math.imul(hash^b,16777619);const id='epub-'+(hash>>>0).toString(16);
 const startPage=toc.find(e=>/combray/i.test(e.label))?.page??0;
 return {id,title,author:meta('creator')||'Unknown author',translator,pages,toc:toc.length?toc:pages.filter((p,i)=>i===0||pages[i-1].section!==p.section).map(p=>({label:p.title,href:p.path,depth:0,page:targets[p.path].page})),targets,startPage};
}
