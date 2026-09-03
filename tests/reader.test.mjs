import test from 'node:test';
import assert from 'node:assert/strict';
import {createReader,words,shouldClearSentenceHighlight,schemas,jsonSchemas} from '../lib/reader.ts';

const TEXT='Across the harbor sailed the boats that the lantern guided.';
const locate=(needle,from=0)=>{const start=TEXT.indexOf(needle,from);if(start<0)throw new Error('Missing fixture text');return {start,end:start+needle.length};};
const selection={start:0,end:TEXT.length};
const outer={id:'guided',range:locate('that the lantern guided.'),attachesTo:locate('the boats'),guide:'which boats are meant',meaning:'These are the boats guided by the lantern.'};
const inner={id:'lantern',range:locate('the lantern'),attachesTo:locate('guided'),guide:'what did the guiding',meaning:'The lantern did the guiding.'};
const components=[{role:'subject',range:locate('the boats')},{role:'predicate',range:locate('sailed')},{role:'complement',range:locate('Across the harbor')}];
const chunks=[{range:locate('the boats')},{range:locate('sailed')},{range:locate('Across the harbor')},{range:locate('that the lantern guided.')}];
function analyzed(){const reader=createReader(TEXT);reader.select(selection);const revision=reader.getSnapshot().revision;reader.run('mark_spine',{revision,components});reader.run('unfold_nested_structure',{revision,structures:[outer,inner]});return reader;}

test('a reader begins with no analysis or selection',()=>{
 const state=createReader(TEXT).getSnapshot();assert.equal(state.text,TEXT);assert.deepEqual(state.selection,{start:0,end:0});assert.equal(state.components.length,0);assert.equal(state.structures.length,0);
});
test('marking the spine and nested structures preserves exact source text',()=>{
 const state=analyzed().getSnapshot();assert.deepEqual(state.components.map(component=>words(component.range,state.text)),['the boats','sailed','Across the harbor']);assert.equal(state.structures.length,2);assert.equal(state.text,TEXT);assert.equal(state.trace.every(entry=>entry.ok),true);
});
test('expanding a nested structure restores its ancestor',()=>{
 const reader=analyzed(),revision=reader.getSnapshot().revision;reader.run('expand_modifier',{revision,id:'lantern'});assert.equal(reader.getSnapshot().structures.filter(structure=>structure.expanded).length,2);reader.run('collapse_modifier',{revision,id:'guided'});assert.equal(reader.getSnapshot().structures.find(structure=>structure.id==='lantern').expanded,true);
});
test('the most recently opened modifier receives the newest explanation order',()=>{
 const reader=analyzed(),revision=reader.getSnapshot().revision;reader.run('expand_modifier',{revision,id:'guided'});const first=reader.getSnapshot().structures.find(structure=>structure.id==='guided').openedAt;reader.run('expand_modifier',{revision,id:'lantern'});const second=reader.getSnapshot().structures.find(structure=>structure.id==='lantern').openedAt;assert.ok(second>first);reader.run('collapse_modifier',{revision,id:'guided'});reader.run('expand_modifier',{revision,id:'guided'});assert.ok(reader.getSnapshot().structures.find(structure=>structure.id==='guided').openedAt>second);
});
test('stale selections cannot receive old agent mutations',()=>{
 const reader=analyzed(),revision=reader.getSnapshot().revision;reader.select(locate('the boats'));assert.equal(reader.run('show_plain_meaning',{revision,paraphrase:'stale'}).isError,true);assert.equal(reader.getSnapshot().plainMeaning,null);assert.equal(reader.run('expand_modifier',{revision:reader.getSnapshot().revision,id:'guided'}).isError,true);
});
test('bad overlaps and missing prerequisites do not alter the document',()=>{
 const reader=createReader(TEXT);reader.select(selection);let revision=reader.getSnapshot().revision;assert.equal(reader.run('unfold_nested_structure',{revision,structures:[outer]}).isError,true);reader.run('mark_spine',{revision,components});assert.equal(reader.run('unfold_nested_structure',{revision,structures:[{...outer,range:locate('the boats that')}]}).isError,true);assert.equal(reader.getSnapshot().structures.length,0);assert.equal(reader.getSnapshot().text,TEXT);
});
test('reordering uses every exact source chunk once',()=>{
 const reader=analyzed(),revision=reader.getSnapshot().revision;assert.equal(reader.run('reorder_syntax',{revision,chunks}).isError,undefined);const state=reader.getSnapshot();assert.deepEqual(state.reordered.map(chunk=>words(chunk.range,state.text)),['the boats','sailed','Across the harbor','that the lantern guided.']);assert.equal(state.structures.every(structure=>structure.expanded),true);
});
test('reordering rejects missing or repeated source words',()=>{
 const reader=analyzed(),revision=reader.getSnapshot().revision;assert.equal(reader.run('reorder_syntax',{revision,chunks:[{range:locate('sailed')}]}).isError,true);assert.equal(reader.run('reorder_syntax',{revision,chunks:[...chunks,{range:locate('sailed')}]}).isError,true);assert.equal(reader.getSnapshot().reordered,null);
});
test('tool schemas expose only the eight supported capabilities',()=>{
 assert.deepEqual(Object.keys(schemas),Object.keys(jsonSchemas));assert.deepEqual(Object.keys(schemas),['get_selected_sentence','get_surrounding_context','mark_spine','unfold_nested_structure','collapse_modifier','expand_modifier','reorder_syntax','show_plain_meaning']);const reader=createReader(TEXT);assert.equal(reader.run('get_selected_sentence',{injected:'value'}).isError,true);
});
test('selected sentence results expose exact text and token offsets',()=>{
 const reader=createReader(TEXT);reader.select(selection);const data=JSON.parse(reader.run('get_selected_sentence',{}).content[0].text);assert.equal(data.selection.text,TEXT);for(const token of data.sentenceTokens)assert.equal(TEXT.slice(token.start,token.end),token.text);
});
test('plain meaning stays separate from the original and needs no spine',()=>{
 const reader=createReader(TEXT);reader.select(selection);const revision=reader.getSnapshot().revision;assert.equal(reader.run('show_plain_meaning',{revision,paraphrase:'Boats crossed the harbor, guided by a lantern.'}).isError,undefined);assert.equal(reader.getSnapshot().plainMeaning,'Boats crossed the harbor, guided by a lantern.');assert.equal(reader.getSnapshot().text,TEXT);assert.equal(reader.getSnapshot().components.length,0);
});
test('restore returns the original text and ends structural analysis',()=>{
 const reader=analyzed();reader.run('reorder_syntax',{revision:reader.getSnapshot().revision,chunks});reader.run('show_plain_meaning',{revision:reader.getSnapshot().revision,paraphrase:'A plain meaning.'});reader.reset();const state=reader.getSnapshot();assert.equal(state.text,TEXT);assert.deepEqual(state.selection,{start:0,end:0});assert.equal(state.reordered,null);assert.equal(state.components.length,0);assert.equal(state.structures.length,0);assert.equal(state.plainMeaning,null);assert.equal(state.focus,null);
});
test('a completed selection survives its click while a later empty click clears it',()=>{
 assert.equal(shouldClearSentenceHighlight(false,true),false);assert.equal(shouldClearSentenceHighlight(true,true),true);assert.equal(shouldClearSentenceHighlight(true,false),false);
});
