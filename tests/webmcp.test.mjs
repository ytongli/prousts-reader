import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createReader} from '../lib/reader.ts';
const source=readFileSync(new URL('../lib/webmcp.ts',import.meta.url),'utf8').replace("'./reader'",JSON.stringify(new URL('../lib/reader.ts',import.meta.url).href));
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {registerReaderTools,WEBMCP_READY,WEBMCP_USED}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function environment(t,document,navigator={}){
 const oldDoc=Object.getOwnPropertyDescriptor(globalThis,'document'),oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'document',{configurable:true,value:document});Object.defineProperty(globalThis,'navigator',{configurable:true,value:navigator});
 t.after(()=>{if(oldDoc)Object.defineProperty(globalThis,'document',oldDoc);else delete globalThis.document;if(oldNav)Object.defineProperty(globalThis,'navigator',oldNav);else delete globalThis.navigator;});
}
test('native registry exposes real callbacks, marks actual calls, and cleans up',async t=>{
 const registry=new Map(),status=[];environment(t,{modelContext:{registerTool:tool=>registry.set(tool.name,tool),unregisterTool:name=>registry.delete(name)}});
 const reader=createReader('The trees swayed gently.');reader.select({start:0,end:reader.getSnapshot().text.length});
 const close=registerReaderTools(reader,s=>status.push(s));await flush();
 assert.equal(registry.size,8);assert.equal(status.at(-1),WEBMCP_READY);
 const result=await registry.get('get_selected_sentence').execute({});assert.equal(JSON.parse(result.content[0].text).selection.text,'The trees swayed gently.');assert.equal(status.at(-1),WEBMCP_USED);
 close();assert.equal(registry.size,0);
});
test('fallback ignores incomplete document API and unmount cancels registration',async t=>{
 const registry=new Map();environment(t,{modelContext:{}},{modelContext:{registerTool:tool=>registry.set(tool.name,tool),unregisterTool:name=>registry.delete(name)}});
 const close=registerReaderTools(createReader(),()=>{});close();await flush();assert.equal(registry.size,0);
});
test('late browser API is discovered without reloading',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const doc={},registry=new Map();environment(t,doc);
 const status=[];const close=registerReaderTools(createReader(),s=>status.push(s));assert.match(status.at(-1),/compatible browser/);
 doc.modelContext={registerTool:tool=>registry.set(tool.name,tool),unregisterTool:name=>registry.delete(name)};
 t.mock.timers.tick(1500);await flush();assert.equal(registry.size,8);assert.equal(status.at(-1),WEBMCP_READY);close();
});
test('sentence offsets remain exact after emoji and on a non-example sentence',()=>{
 const text='🌙 Night came. The trees swayed gently.';const reader=createReader(text);reader.select({start:text.indexOf('The'),end:text.length});
 const data=JSON.parse(reader.run('get_selected_sentence',{}).content[0].text);
 assert.deepEqual(data.sentenceTokens.map(t=>t.text),['The','trees','swayed','gently.']);for(const token of data.sentenceTokens)assert.equal(text.slice(token.start,token.end),token.text);
});
