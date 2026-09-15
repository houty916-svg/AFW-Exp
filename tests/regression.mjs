// Run: node --test tests/regression.mjs (Node.js and Python standard library only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {onRequestPost as sessionPost,onRequestGet as sessionGet} from '../functions/api/session.js';
import {onRequestPost as responsePost} from '../functions/api/response.js';
import {onRequestPost as completePost} from '../functions/api/complete.js';
import {onRequestGet as exportGet} from '../functions/api/export.js';
const python=String.raw`import sys,json,sqlite3
p=json.load(sys.stdin)
c=sqlite3.connect(p['file']); c.row_factory=sqlite3.Row
out=[]
with c:
 for q in p['queries']:
  if 'script' in q: c.executescript(q['script']);out.append({});continue
  cur=c.execute(q['sql'],q.get('args',[]))
  out.append({'results':[dict(r) for r in cur.fetchall()] if cur.description else []})
print(json.dumps(out))
`;
function database(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'afw-tests-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'test.sqlite');
 const query=queries=>{
  const p=spawnSync('python',['-X','utf8','-c',python],{input:JSON.stringify({file,queries}),encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);
 };
 const db={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this},
  async all(){return query([this])[0]},async first(){return query([this])[0].results[0]||null},async run(){return query([this])[0]}}},
  async batch(q){return query(q)}};
 query([{script:fs.readFileSync('schema.sql','utf8')}]);
 return {db,query};
}
function call(handler,db,body,url='https://example.test/api'){
 return handler({env:{DB:db,ADMIN_KEY:'secret'},request:new Request(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
}
test('Migration retains old ratings; falsely completed sessions reopen only gaps; export keeps legacy rows',async t=>{
 const {db,query}=database(t);
 query([{sql:'DROP TABLE session_demographics'},
 {sql:'INSERT INTO sessions VALUES(?,?,?,?,?,?)',args:['old','S',JSON.stringify(['a.jpg','b.jpg','c.jpg']),1,'2020','2020']},
 {sql:'INSERT INTO responses VALUES(?,?,?,?,?,?,?,?)',args:['old','S',1,'a.jpg',7,100,'2020',3]},
 {sql:'INSERT INTO responses VALUES(?,?,?,?,?,?,?,?)',args:['old','S',3,'c.jpg',4,100,'2020',3]}]);
 const migration=fs.readFileSync('migrations/001_demographics.sql','utf8');
 query([{script:migration},{script:migration}]);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM responses').first()).n,2);
 let res=await call(sessionGet,db,null,'https://example.test/api/session?subject_id=S');
 let state=await res.json();assert.deepEqual(state.missing_trial_orders,[2]);
 let csv=await (await call(exportGet,db,null,'https://example.test/api/export?key=secret')).text();
 assert.match(csv,/gender,age/);assert.match(csv,/old,1,a.jpg,7,100,2020,3,,/);
 res=await call(completePost,db,{session_id:'old'});assert.equal(res.status,409);
 res=await call(sessionPost,db,{subject_id:'S',gender:'女',age:23,order:['different.jpg']});
 state=await res.json();assert.equal(state.session_id,'old');assert.deepEqual(state.order,['a.jpg','b.jpg','c.jpg']);
 const rating={session_id:'old',subject_id:'S',trial_order:2,image:'b.jpg',fear_rating_0_100:0,rt_ms:500};
 assert.equal((await call(responsePost,db,rating)).status,200);
 assert.equal((await call(responsePost,db,{...rating,fear_rating_0_100:9})).status,200);
 assert.equal((await db.prepare('SELECT fear_rating_0_100 AS r FROM responses WHERE trial_order=2').first()).r,0);
 assert.equal((await call(responsePost,db,{...rating,image:'wrong.jpg'})).status,400);
 assert.equal((await call(responsePost,db,{...rating,fear_rating_0_100:10})).status,400);
 assert.equal((await call(responsePost,db,{...rating,subject_id:'other'})).status,400);
 assert.equal((await call(completePost,db,{session_id:'old'})).status,200);
 res=await call(sessionPost,db,{subject_id:'S',gender:'女',age:23,order:['new.jpg']});
 assert.equal((await res.json()).session_id,'old');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n,1);
 csv=await (await call(exportGet,db,null,'https://example.test/api/export?key=secret')).text();
 assert.match(csv,/,女,23/);
 assert.equal((await call(exportGet,db,null,'https://example.test/api/export?key=wrong')).status,401);
});
test('New starts validate demographics; concurrent starts reuse session; malformed rows cannot complete',async t=>{
 const {db,query}=database(t);
 for(const bad of [{gender:'',age:22},{gender:'男',age:0},{gender:'男',age:22.5}])
  assert.equal((await call(sessionPost,db,{subject_id:'N',order:['a.jpg','b.jpg'],...bad})).status,400);
 const body={subject_id:'N',gender:'男',age:22,order:['a.jpg','b.jpg']};
 const states=await Promise.all([call(sessionPost,db,body),call(sessionPost,db,body)]);
 assert.equal((await states[0].json()).session_id,(await states[1].json()).session_id);
 const s=await db.prepare('SELECT * FROM sessions').first();
 query([{sql:'INSERT INTO responses VALUES(?,?,?,?,?,?,?,?)',args:[s.session_id,'N',1,'wrong.jpg',5,100,'2020',2]},
 {sql:'INSERT INTO responses VALUES(?,?,?,?,?,?,?,?)',args:[s.session_id,'N',2,'b.jpg',5,100,'2020',2]}]);
 const res=await call(completePost,db,{session_id:s.session_id});assert.equal(res.status,409);
 assert.deepEqual((await res.json()).missing_trial_orders,[1]);
});
function browser(){
 const elements=new Map();
 const el=id=>{if(!elements.has(id)){
  const classes=new Set(['start'].includes(id)?[]:['hidden']);
  elements.set(id,{value:'',textContent:'',disabled:false,style:{},dataset:{},
   classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){on?classes.add(x):classes.delete(x)}},
   setAttribute(){},removeAttribute(){},addEventListener(){}});
 }return elements.get(id)};
 const keys=Array.from({length:10},(_,i)=>{const e=el('key'+i);e.dataset.rating=String(i);return e});
 const ctx=vm.createContext({document:{getElementById:el,querySelectorAll:()=>keys,addEventListener(){}},
  Image:class {},performance:{now:()=>100},setTimeout:()=>1,clearTimeout(){},AbortController,console});
 const script=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace('initializeStimuli();','');
 vm.runInContext(script,ctx);
 vm.runInContext(`subject='S';sessionId='id';order=['a.jpg','b.jpg','c.jpg'];idx=0;showSection('task');imageReady=true;selectedRating=0;`,ctx);
 return {ctx,el,run:code=>vm.runInContext(code,ctx)};
}
test('Double submission saves once; input stays locked until acknowledgement; missing index is never skipped',async()=>{
 const b=browser();
 b.run(`var requests=[];var resolveSave;api=(url,body)=>{requests.push(body);return new Promise(r=>resolveSave=r)};
 var p1=submitCurrent();var p2=submitCurrent();chooseRating(9);`);
 assert.equal(b.run('requests.length'),1);assert.equal(b.run('selectedRating'),0);assert.equal(b.el('nextBtn').disabled,true);
 b.run('resolveSave({ok:true,trial_order:1})');await b.run('Promise.all([p1,p2])');
 assert.equal(b.run('idx'),1);assert.equal(b.run('completedSet.size'),1);
 b.run('completedSet=new Set([1,3]);idx=nextUnfinishedIndex()');assert.equal(b.run('idx'),1);
});
test('Network failure retains rating; missing or failed completion never displays success; server verified success does',async()=>{
 const b=browser();
 b.run(`api=async()=>{throw new Error('offline')};`);await b.run('submitCurrent()');
 assert.equal(b.run('idx'),0);assert.equal(b.run('selectedRating'),0);assert.equal(b.run('completedSet.size'),0);
 await b.run('finishExperiment()');assert.equal(b.el('end').classList.contains('hidden'),true);
 assert.equal(b.el('retryFinishBtn').classList.contains('hidden'),false);
 b.run(`api=async()=>{const e=new Error('missing');e.data={session_id:'id',order,completed_trial_orders:[1,3],missing_trial_orders:[2]};throw e};`);
 await b.run('finishExperiment()');assert.equal(b.run('idx'),1);assert.equal(b.el('end').classList.contains('hidden'),true);
 b.run('api=async()=>({ok:true,complete:true})');await b.run('finishExperiment()');
 assert.equal(b.el('end').classList.contains('hidden'),false);
});
test('Image load is required before a rating can be selected',()=>{
 const b=browser();b.run('showTrial();chooseRating(8)');assert.equal(b.run('selectedRating'),null);
 b.run('activeImage.onerror();chooseRating(8)');assert.equal(b.run('selectedRating'),null);
 b.run('activeImage.onload();chooseRating(8)');assert.equal(b.run('selectedRating'),8);
});
