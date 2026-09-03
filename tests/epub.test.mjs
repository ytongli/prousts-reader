import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {parseEpub,resolveEpubPath} from '../lib/epub.ts';
import {createReader,words} from '../lib/reader.ts';
const bytes=readFileSync(new URL('../public/books/the-way-by-swanns.epub',import.meta.url));
const book=parseEpub(bytes);
test('the attached EPUB contains the full volume, contents, and original opening',()=>{
 assert.equal(book.title,"Swann's Way");assert.equal(book.author,'Marcel Proust');
 assert.equal(book.pages.length,152);assert.equal(book.toc.length,10);
 assert.equal(book.pages.reduce((n,p)=>n+p.blocks.length,0),1138);
 for(const entry of book.toc){assert.ok(book.pages[entry.page]);if(entry.block)assert.ok(book.pages[entry.page].blocks.find(b=>b.sourceId===entry.block));}
 assert.ok(book.toc.some(t=>t.label==='COMBRAY'));assert.ok(book.toc.some(t=>t.label==='THE FULL PROJECT GUTENBERG™ LICENSE'));
 assert.ok(book.pages.some(page=>page.text.includes('For a long time I used to go to bed early.')));
});
test('all body text from every spine document is preserved in order',()=>{
 const files=unzipSync(bytes);const xml=path=>new DOMParser().parseFromString(strFromU8(files[path]),'application/xhtml+xml');
 const opf=xml('OEBPS/content.opf');const manifest=Object.fromEntries(Array.from(opf.getElementsByTagName('item')).map(e=>[e.getAttribute('id'),resolveEpubPath('OEBPS/content.opf',e.getAttribute('href'))]));
 const paths=Array.from(opf.getElementsByTagName('itemref')).map(e=>manifest[e.getAttribute('idref')]);
 for(const path of paths){const original=xml(path).getElementsByTagName('body')[0].textContent.replace(/\s/g,'');const rendered=book.pages.filter(p=>p.path===path).map(p=>p.text).join('').replace(/[\s\uFFFC]/g,'');assert.equal(rendered,original,'Text changed in '+path);}
});
test('paragraph ranges, emphasis, images and internal hyperlinks survive import',()=>{
 let links=0,italic=0,images=0;
 for(const page of book.pages){for(const b of page.blocks)assert.equal(page.text.slice(b.start,b.end),b.text);for(const f of page.formats){assert.ok(f.start>=0&&f.end<=page.text.length);if(f.italic)italic++;if(f.image){images++;assert.match(f.image,/^data:image\//);}if(f.href&&!/^https?:/.test(f.href)){links++;assert.ok(book.targets[f.href]??book.targets[f.href.split('#')[0]],'Broken link '+f.href);}}}
 assert.ok(links>0);assert.ok(italic>100);assert.ok(images>0);
});
test('the pre-loaded opening supports exact reader selection without changing its neighbors',()=>{
 const sentence='For a long time I used to go to bed early.',page=book.pages.find(page=>page.text.includes(sentence)),offset=page?.text.indexOf(sentence)??-1,r=createReader('');
 assert.ok(offset>=0);r.loadDocument({text:page.text,documentId:page.id,formats:page.formats});r.select({start:offset,end:offset+sentence.length});
 const s=r.getSnapshot();assert.equal(words(s.selection,s.text),sentence);assert.equal(s.text,page.text);assert.equal(s.components.length,0);
});
test('new pages reject stale mutations and expose their own sentence/context',()=>{
 const r=createReader('');const first=book.pages[13],next=book.pages[73];r.loadDocument({text:first.text,documentId:first.id});r.select({start:0,end:Math.min(20,first.text.length)});const old=r.getSnapshot().revision;
 r.loadDocument({text:next.text,documentId:next.id,before:first.text.slice(-100)});r.select({start:0,end:Math.min(20,next.text.length)});
 assert.equal(r.run('show_plain_meaning',{revision:old,paraphrase:'wrong page'}).isError,true);assert.equal(r.getSnapshot().plainMeaning,null);
 const context=JSON.parse(r.run('get_surrounding_context',{}).content[0].text);assert.equal(context.documentId,next.id);assert.equal(context.text,next.text);assert.equal(context.before,first.text.slice(-100));assert.equal(r.getSnapshot().components.length,0);
});
function minimal(chapter){return zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package><metadata><title>Test Book</title><creator>Test Author</creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="text"/></spine></package>'),'nav.xhtml':strToU8('<html><body><nav><ol><li><a href="text.xhtml#start">Chapter One</a></li></ol></nav></body></html>'),'text.xhtml':strToU8(chapter)});}
test('EPUB 3 navigation works and book markup cannot execute code',()=>{
 const b=parseEpub(minimal('<html><body><p id="start">Hello <em>reader</em>. <a href="javascript:alert(1)">Read</a>.</p><script>alert(1)</script><iframe src="https://example.com"/><p>Next paragraph.</p></body></html>'));
 assert.equal(b.title,'Test Book');assert.equal(b.toc[0].label,'Chapter One');assert.equal(b.pages[0].text,'Hello reader. Read.\n\nNext paragraph.');assert.equal(b.pages[0].formats.some(f=>f.href),false);
});
test('bad archives and oversized books are rejected clearly',()=>{
 assert.throws(()=>parseEpub(strToU8('not an epub')));assert.throws(()=>parseEpub(new Uint8Array(36*1024*1024)),/smaller than 35 MB/);
});
