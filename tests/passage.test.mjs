import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const {createReader,runExample,reorderExample,TEXT,words,locate}=await vite.ssrLoadModule('/lib/reader.ts');
const {passageParts}=await vite.ssrLoadModule('/lib/passage.ts');
const {ReadingPassage}=await vite.ssrLoadModule('/components/reading-passage.tsx');

test('inline render marks original subject and folds phrases without duplicating the sentence',()=>{
 const r=createReader();runExample(r);const s=r.getSnapshot();
 const html=renderToStaticMarkup(React.createElement(ReadingPassage,{state:s,active:null,onReference(){},onLayer(){}}));
 assert.match(html,/data-source-start="0" data-source-end="1" data-role-label="Subject" class="subject">I<\/span>/);
 assert.match(html,/data-role-label="Verb" class="selected-words predicate">savour<\/span>/);
 assert.match(html,/data-role-label="Object \/ complement" class="selected-words object">the sleep<\/span>/);
 assert.match(html,/data-source-start="204" data-source-end="205" class="selected-words"> <\/span>/);
 assert.match(html,/when this awareness happens/);assert.doesNotMatch(html,/title=/);
 assert.doesNotMatch(html,/role="dialog"/);assert.equal((html.match(/would go back/g)||[]).length,1);
 assert.equal(passageParts(s).filter(p=>p.chip).length,2);
});
test('expanding all restores exact original words and puts controls at phrase ends',()=>{
 const r=createReader();runExample(r);for(const s of r.getSnapshot().structures)r.run('expand_modifier',{revision:r.getSnapshot().revision,id:s.id});
 const parts=passageParts(r.getSnapshot());assert.equal(parts.map(p=>words(p.range)).join(''),TEXT);
 const glimmer=parts.find(p=>p.closes.includes('glimmer'));assert.equal(glimmer.range.end,locate('in a momentary glimmer of consciousness').end);
});
test('reorder replaces display order in place, retains each source character except whitespace and supports refolding',()=>{
 const r=createReader();runExample(r);reorderExample(r);
 const s=r.getSnapshot();const text=passageParts(s).map(p=>words(p.range)).join(' ');
 assert.match(text,/savour the sleep in a momentary glimmer/);
 assert.equal(s.structures.every(s=>s.expanded),true);
 const ranges=passageParts(s).map(p=>p.range).sort((a,b)=>a.start-b.start);
 assert.equal(ranges.map(r=>words(r)).join('').replace(/\s/g,''),TEXT.replace(/\s/g,''));
 r.run('collapse_modifier',{revision:s.revision,id:'sleep'});
 assert.equal(passageParts(r.getSnapshot()).filter(p=>p.chip==='sleep').length,1);
 assert.equal(passageParts(r.getSnapshot()).filter(p=>!p.chip).some(p=>words(p.range).includes('were plunged')),false);
 r.update({reordered:null});assert.equal(r.getSnapshot().structures.find(s=>s.id==='sleep').expanded,false);
});
test('focused text preserves analysis and is exposed with a fresh revision',()=>{
 const r=createReader();runExample(r);const old=r.getSnapshot().revision;r.focus(locate('whose'));
 assert.equal(r.getSnapshot().structures.length,4);assert.equal(r.getSnapshot().revision,old+1);
 const response=JSON.parse(r.run('get_selected_sentence',{}).content[0].text);
 assert.equal(response.focusedText.text,'whose');assert.equal(response.selection.text.startsWith('savour'),true);
});
test('direct reorder rejects word loss and duplicate chunks before changing the paragraph',()=>{
 const r=createReader();runExample(r);const revision=r.getSnapshot().revision;
 assert.equal(r.run('reorder_syntax',{revision,chunks:[{range:locate('savour')}]}).isError,true);
 assert.equal(r.getSnapshot().reordered,null);
});
test('the sentence highlight can be hidden without discarding structural analysis',()=>{
 const r=createReader();runExample(r);const s=r.getSnapshot();
 const html=renderToStaticMarkup(React.createElement(ReadingPassage,{state:s,active:null,showSelection:false,onReference(){},onLayer(){}}));
 assert.doesNotMatch(html,/selected-words/);
 assert.match(html,/data-role-label="Verb" class="predicate">savour<\/span>/);
 assert.equal(s.structures.length,4);assert.equal(s.components.length,3);
});
