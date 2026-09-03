import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const {createReader,words}=await vite.ssrLoadModule('/lib/reader.ts');
const {passageParts}=await vite.ssrLoadModule('/lib/passage.ts');
const {ReadingPassage}=await vite.ssrLoadModule('/components/reading-passage.tsx');

const TEXT='Across the harbor sailed the boats that the lantern guided.';
const locate=needle=>{const start=TEXT.indexOf(needle);return {start,end:start+needle.length};};
const selection={start:0,end:TEXT.length};
const components=[{role:'subject',range:locate('the boats')},{role:'predicate',range:locate('sailed')},{role:'complement',range:locate('Across the harbor')}];
const structure={id:'guided',range:locate('that the lantern guided.'),attachesTo:locate('the boats'),guide:'which boats are meant',meaning:'These are the boats guided by the lantern.'};
const chunks=[{range:locate('the boats')},{range:locate('sailed')},{range:locate('Across the harbor')},{range:locate('that the lantern guided.')}];
function analyzed(){const reader=createReader(TEXT);reader.select(selection);const revision=reader.getSnapshot().revision;reader.run('mark_spine',{revision,components});reader.run('unfold_nested_structure',{revision,structures:[structure]});return reader;}

test('inline render marks the sentence spine and folds the modifier without duplication',()=>{
 const state=analyzed().getSnapshot();const html=renderToStaticMarkup(React.createElement(ReadingPassage,{state,active:null,onLayer(){}}));
 assert.match(html,/data-role-label="Subject" class="selected-words subject">the boats<\/span>/);assert.match(html,/data-role-label="Verb" class="selected-words predicate">sailed<\/span>/);assert.match(html,/data-role-label="Object \/ complement" class="selected-words complement">Across the harbor<\/span>/);assert.match(html,/which boats are meant/);assert.doesNotMatch(html,/role="dialog"/);assert.equal((html.match(/Across the harbor/g)||[]).length,1);
});
test('expanding restores exact original words and places the close control at the phrase end',()=>{
 const reader=analyzed();reader.run('expand_modifier',{revision:reader.getSnapshot().revision,id:'guided'});const parts=passageParts(reader.getSnapshot());assert.equal(parts.map(part=>words(part.range,TEXT)).join(''),TEXT);const close=parts.find(part=>part.closes.includes('guided'));assert.equal(close.range.end,locate('that the lantern guided.').end);
});
test('reorder changes display order in place while retaining every source character',()=>{
 const reader=analyzed();reader.run('reorder_syntax',{revision:reader.getSnapshot().revision,chunks});const state=reader.getSnapshot();const displayed=passageParts(state).map(part=>words(part.range,TEXT)).join(' ');assert.match(displayed,/the boats sailed Across the harbor that the lantern guided\./);const ranges=passageParts(state).map(part=>part.range).sort((a,b)=>a.start-b.start);assert.equal(ranges.map(range=>words(range,TEXT)).join('').replace(/\s/g,''),TEXT.replace(/\s/g,''));reader.run('collapse_modifier',{revision:state.revision,id:'guided'});assert.equal(passageParts(reader.getSnapshot()).filter(part=>part.chip==='guided').length,1);
});
test('focused text preserves analysis and is exposed with a fresh revision',()=>{
 const reader=analyzed(),old=reader.getSnapshot().revision;reader.focus(locate('the lantern'));assert.equal(reader.getSnapshot().structures.length,1);assert.equal(reader.getSnapshot().revision,old+1);const response=JSON.parse(reader.run('get_selected_sentence',{}).content[0].text);assert.equal(response.focusedText.text,'the lantern');assert.equal(response.selection.text,TEXT);
});
test('the sentence highlight can be hidden without discarding structural analysis',()=>{
 const state=analyzed().getSnapshot();const html=renderToStaticMarkup(React.createElement(ReadingPassage,{state,active:null,showSelection:false,onLayer(){}}));assert.doesNotMatch(html,/selected-words/);assert.match(html,/data-role-label="Verb" class="predicate">sailed<\/span>/);assert.equal(state.structures.length,1);assert.equal(state.components.length,3);
});
