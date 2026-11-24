import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../server/store.js';
import {createDeletionWorker} from '../server/linky-deletions.js';

// Banco mínimo: só as consultas que o worker usa.
function fakeDb(requests){
 const updates=[],linksDeleted=[];
 const table=name=>{const f={};const q={select:()=>q,eq:(k,v)=>{f[k]=v;return q;},order:()=>q,limit:async()=>({data:requests.filter(r=>r.status==='pending'),error:null}),maybeSingle:async()=>({data:{id:'app-olune'},error:null}),
  update:row=>({eq:async(k,v)=>{updates.push({id:v,...row});const r=requests.find(x=>x.id===v);Object.assign(r,row);return {error:null};}}),
  delete:()=>({eq:()=>({eq:async(k,v)=>{linksDeleted.push(v);return {error:null};}})})};return q;};
 return {db:{from:table},updates,linksDeleted};
}
const silent={log(){},error(){}};

test('apaga a empresa inteira quando a pessoa é a única dela', async()=>{
 const store=new MemoryStore();
 await store.put('company','moodcorp:c1',{id:'moodcorp:c1',name:'Central Brasiléia'});
 await store.put('user','moodcorp:c1',{id:'u1',companyId:'moodcorp:c1',email:'a@x.test',linkySub:'sub-1'});
 await store.put('checkin','moodcorp:c1',{owner:'u1',mood:4});
 await store.put('company','moodcorp:c2',{id:'moodcorp:c2',name:'Outra'});
 const requests=[{id:'r1',status:'pending',central_user_id:'sub-1',external_user_id:'u1',email:'a@x.test'}];
 const {db,linksDeleted}=fakeDb(requests);
 await createDeletionWorker({db,store,clientId:'c',log:silent}).tick();
 assert.equal(requests[0].status,'done');
 assert.equal(await store.get('user','u1'),null);
 assert.equal(await store.get('company','moodcorp:c1'),null);
 assert.ok(await store.get('company','moodcorp:c2'),'outra empresa continua');
 assert.deepEqual(linksDeleted,['sub-1']);
});

test('mantém a empresa quando há outras pessoas e apaga só os dados da pessoa', async()=>{
 const store=new MemoryStore();
 await store.put('company','moodcorp:c1',{id:'moodcorp:c1'});
 await store.put('user','moodcorp:c1',{id:'u1',companyId:'moodcorp:c1',linkySub:'sub-1'});
 await store.put('user','moodcorp:c1',{id:'u2',companyId:'moodcorp:c1',linkySub:'sub-2'});
 await store.put('checkin','moodcorp:c1',{owner:'u1'},'k1');
 await store.put('checkin','moodcorp:c1',{owner:'u2'},'k2');
 const requests=[{id:'r1',status:'pending',central_user_id:'sub-1',external_user_id:null,email:null}];
 await createDeletionWorker({db:fakeDb(requests).db,store,clientId:'c',log:silent}).tick();
 assert.equal(requests[0].status,'done');
 assert.equal(await store.get('user','u1'),null);
 assert.ok(await store.get('user','u2'));
 assert.ok(await store.get('company','moodcorp:c1'));
 assert.equal(await store.get('checkin','k1'),null);
 assert.ok(await store.get('checkin','k2'));
});

test('conclui o pedido mesmo sem dados no OLUNE', async()=>{
 const requests=[{id:'r1',status:'pending',central_user_id:'nada',external_user_id:null,email:'z@x.test'}];
 await createDeletionWorker({db:fakeDb(requests).db,store:new MemoryStore(),clientId:'c',log:silent}).tick();
 assert.equal(requests[0].status,'done');
 assert.equal(requests[0].detail,'nenhum dado no OLUNE');
});
