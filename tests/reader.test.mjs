import test from 'node:test';
import assert from 'node:assert/strict';
import {createReader,runExample,reorderExample,locate,words,shouldClearSentenceHighlight,TEXT,DEFAULT_SELECTION,sampleReferences,schemas,jsonSchemas} from '../lib/reader.ts';
test('exact pre-loaded selection and inherited subject survive analysis',()=>{
 const r=createReader();runExample(r);const s=r.getSnapshot();
 assert.equal(words(s.selection).startsWith('savour in a momentary glimmer'),true);
 assert.equal(words(s.selection).endsWith('return to share'),true);
 assert.deepEqual(s.components.map(c=>words(c.range)),['I','savour','the sleep']);
 assert.equal(s.components[0].inherited,true);assert.equal(s.structures.length,4);assert.equal(s.trace.every(t=>t.ok),true);
});
test('expanding nested structure restores its ancestor, collapsing preserves child state',()=>{
 const r=createReader();runExample(r);const revision=r.getSnapshot().revision;
 r.run('expand_modifier',{revision,id:'part'});assert.equal(r.getSnapshot().structures.filter(s=>s.expanded).length,2);
 r.run('collapse_modifier',{revision,id:'sleep'});assert.equal(r.getSnapshot().structures.find(s=>s.id==='part').expanded,true);
});
test('the most recently opened modifier receives the newest explanation order',()=>{
 const r=createReader();runExample(r);const revision=r.getSnapshot().revision;
 r.run('expand_modifier',{revision,id:'glimmer'});const first=r.getSnapshot().structures.find(s=>s.id==='glimmer').openedAt;
 r.run('expand_modifier',{revision,id:'sleep'});const second=r.getSnapshot().structures.find(s=>s.id==='sleep').openedAt;
 assert.ok(second>first);
 r.run('collapse_modifier',{revision,id:'glimmer'});r.run('expand_modifier',{revision,id:'glimmer'});
 assert.ok(r.getSnapshot().structures.find(s=>s.id==='glimmer').openedAt>second);
});
test('reference lookup works without analysis and opens all containing layers',()=>{
 const r=createReader();let revision=r.getSnapshot().revision;
 assert.equal(r.run('trace_references',{revision,...sampleReferences[2]}).isError,undefined);
 assert.equal(words(r.getSnapshot().reference.target),'that whole');
 runExample(r);revision=r.getSnapshot().revision;r.run('trace_references',{revision,...sampleReferences[2]});
 assert.equal(r.getSnapshot().structures.find(s=>s.id==='return').expanded,true);assert.equal(r.getSnapshot().structures.find(s=>s.id==='sleep').expanded,true);
});
test('stale selection cannot receive old agent annotations',()=>{
 const r=createReader();runExample(r);const revision=r.getSnapshot().revision;r.select(locate('whose'));
 assert.equal(r.run('add_margin_annotation',{revision,text:'stale'}).isError,true);assert.equal(r.getSnapshot().notes.length,0);
 assert.equal(r.run('expand_modifier',{revision:r.getSnapshot().revision,id:'part'}).isError,true);
});
test('bad ranges, overlaps and missing prerequisites cannot alter the document',()=>{
 const r=createReader();const revision=r.getSnapshot().revision;
 assert.equal(r.run('reorder_syntax',{revision,chunks:[{range:DEFAULT_SELECTION}]}).isError,undefined);
 assert.equal(r.run('trace_references',{revision,source:{start:0,end:TEXT.length+1},target:locate('the sleep'),explanation:'bad'}).isError,true);
 runExample(r);const v=r.getSnapshot().revision;
 assert.equal(r.run('unfold_nested_structure',{revision:v,structures:[{id:'bad',range:locate('the sleep'),attachesTo:locate('savour'),guide:'what this describes',meaning:'bad'}]}).isError,true);
 assert.equal(r.getSnapshot().structures.length,4);
});
test('reordered version only uses exact source chunks',()=>{
 const r=createReader();runExample(r);reorderExample(r);const s=r.getSnapshot();
 assert.equal(s.trace.at(-1).ok,true);assert.equal(s.reordered.length,8);
 assert.deepEqual(s.reordered.slice(0,3).map(c=>words(c.range)),['savour','the sleep','in a momentary glimmer of consciousness']);
 assert.equal(s.selection.start,DEFAULT_SELECTION.start);
});
test('tool schemas cover the same public vocabulary and reject unknown fields',()=>{
 assert.deepEqual(Object.keys(schemas),Object.keys(jsonSchemas));
 const r=createReader();assert.equal(r.run('get_selected_sentence',{injected:'value'}).isError,true);
 const response=r.run('get_selected_sentence',{});assert.equal(JSON.parse(response.content[0].text).text,TEXT);
});
test('nested structures require reader guidance and plain meaning instead of grammar labels',()=>{
 const r=createReader();const revision=r.getSnapshot().revision;
 r.run('mark_spine',{revision,components:[{role:'predicate',range:locate('savour')},{role:'object',range:locate('the sleep')}]});
 const range=locate('in a momentary glimmer of consciousness');
 assert.equal(r.run('unfold_nested_structure',{revision,structures:[{id:'old',range,attachesTo:locate('savour'),label:'Prepositional phrase',explanation:'A grammar label.'}]}).isError,true);
 const result=r.run('unfold_nested_structure',{revision,structures:[{id:'new',range,attachesTo:locate('savour'),guide:'when this awareness happens',meaning:'The awareness lasts only a moment.'}]});
 assert.equal(result.isError,undefined);assert.equal(r.getSnapshot().structures[0].guide,'when this awareness happens');
});
test('plain meaning stays separate from the original text and needs no spine',()=>{
 const r=createReader();const revision=r.getSnapshot().revision;
 const result=r.run('show_plain_meaning',{revision,paraphrase:'He briefly becomes aware of the sleeping room around him.'});
 assert.equal(result.isError,undefined);assert.equal(r.getSnapshot().plainMeaning,'He briefly becomes aware of the sleeping room around him.');
 assert.equal(r.getSnapshot().text,TEXT);assert.equal(r.getSnapshot().components.length,0);
});
test('restore returns original text and ends every part of structural analysis',()=>{
 const r=createReader();runExample(r);reorderExample(r);r.run('show_plain_meaning',{revision:r.getSnapshot().revision,paraphrase:'A plain meaning.'});
 r.reset();const s=r.getSnapshot();
 assert.equal(s.text,TEXT);assert.deepEqual(s.selection,{start:0,end:0});assert.equal(s.reordered,null);assert.equal(s.components.length,0);assert.equal(s.structures.length,0);assert.equal(s.reference,null);assert.equal(s.plainMeaning,null);assert.equal(s.notes.length,0);assert.equal(s.focus,null);
});
test('a completed text selection survives its click while a later empty click clears it',()=>{
 assert.equal(shouldClearSentenceHighlight(false,true),false);
 assert.equal(shouldClearSentenceHighlight(true,true),true);
 assert.equal(shouldClearSentenceHighlight(true,false),false);
});
