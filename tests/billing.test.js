import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {lookup} from '../server/security.js';
import {accessFor,paidCompanies,trialDays} from '../server/billing.js';
const secret='test-only-secret-for-billing-at-least-32-chars';
const DAY=86400000;
const person=(email,extra={})=>({name:'Pessoa Teste',phone:'5568999999999',jobTitle:'Analista',department:'Operações',birthDate:'1999-05-20',email,password:'teste-Seguro123',...extra});
async function fixture(t,billingEnv={}){
 const store=new MemoryStore(),app=createApp({store,secret,billingEnv,gateway:{status:async()=>({status:'disconnected'}),connect:async()=>{},disconnect:async()=>{}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=async(path,body,session='',method)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 const company=async()=>{const out=await request('/auth/register',person('rh@example.com',{mode:'company',document:'11222333000181',companyName:'Empresa Teste',remember:true}));assert.equal(out.status,201);return out.body;};
 const expire=async cid=>{const id=lookup(secret,'billing',cid),b=await store.get('billing',id,cid);b.trialEndsAt=new Date(Date.now()-1000).toISOString();await store.put('billing',cid,b,id);};
 return {store,request,company,expire};
}

test('regras puras: 7 dias por padrão, contagem e plano pago manual',()=>{
 const now=Date.parse('2026-11-19T12:00:00Z'),c={document:'11222333000181'};
 assert.equal(trialDays({}),7);assert.equal(trialDays({OLUNE_TRIAL_DAYS:'14'}),14);assert.equal(trialDays({OLUNE_TRIAL_DAYS:'abc'}),7);
 const start=accessFor(c,{trialEndsAt:new Date(now+7*DAY).toISOString()},{},now);assert.equal(start.status,'trialing');assert.equal(start.daysLeft,7);
 const last=accessFor(c,{trialEndsAt:new Date(now+3*3600000).toISOString()},{},now);assert.equal(last.status,'trialing');assert.equal(last.daysLeft,1);
 const over=accessFor(c,{trialEndsAt:new Date(now-1).toISOString()},{},now);assert.equal(over.status,'expired');assert.equal(over.daysLeft,0);
 const paid=accessFor(c,{trialEndsAt:new Date(now-1).toISOString()},{OLUNE_PAID_COMPANIES:'11.222.333/0001-81:2026-12-31'},now);assert.equal(paid.status,'active');
 const lapsed=accessFor(c,{trialEndsAt:new Date(now-1).toISOString()},{OLUNE_PAID_COMPANIES:'11222333000181:2026-11-01'},now);assert.equal(lapsed.status,'expired');
 assert.equal(paidCompanies({OLUNE_PAID_COMPANIES:'semdata, 123:ontem'}).size,0);
});

test('empresa nova começa com 7 dias grátis visíveis no bootstrap',async t=>{
 const f=await fixture(t),a=await f.company();
 const boot=await f.request('/bootstrap',undefined,a.token);
 assert.equal(boot.body.access.status,'trialing');assert.equal(boot.body.access.daysLeft,7);assert.equal(boot.body.access.trialDays,7);
 assert.equal((await f.request('/billing/status',undefined,a.token)).body.status,'trialing');
});

test('teste vencido: somente leitura, sem apagar dados; sair e consultar continuam liberados',async t=>{
 const f=await fixture(t),a=await f.company(),cid=a.user.companyId;
 assert.equal((await f.request('/checkins',{mood:4},a.token)).status,200);
 await f.expire(cid);
 const boot=await f.request('/bootstrap',undefined,a.token);assert.equal(boot.status,200);assert.equal(boot.body.access.status,'expired');
 assert.equal(boot.body.checkins.length,1,'os dados continuam guardados');
 const blocked=await f.request('/checkins',{mood:5},a.token);assert.equal(blocked.status,402);assert.match(blocked.body.error,/teste grátis/i);
 assert.equal((await f.request('/profile',{shareMood:true},a.token,'PATCH')).status,402);
 assert.equal((await f.request('/admin/overview',undefined,a.token)).status,200);
 assert.equal((await f.request('/auth/logout',{},a.token)).status,200);
});

test('plano ativado manualmente libera a empresa; OLUNE_BILLING=off desliga o bloqueio',async t=>{
 const paid=await fixture(t,{OLUNE_PAID_COMPANIES:'11222333000181:2999-12-31'}),a=await paid.company();
 await paid.expire(a.user.companyId);
 assert.equal((await paid.request('/bootstrap',undefined,a.token)).body.access.status,'active');
 assert.equal((await paid.request('/checkins',{mood:3},a.token)).status,200);
 const off=await fixture(t,{OLUNE_BILLING:'off'}),b=await off.company();
 await off.expire(b.user.companyId);
 assert.equal((await off.request('/checkins',{mood:3},b.token)).status,200);
 assert.equal((await off.request('/bootstrap',undefined,b.token)).body.access.enforced,false);
});

test('empresa antiga sem registro de teste ganha 7 dias a partir do primeiro acesso',async t=>{
 const f=await fixture(t),a=await f.company(),cid=a.user.companyId;
 await f.store.remove('billing',lookup(secret,'billing',cid),cid);
 const boot=await f.request('/bootstrap',undefined,a.token);
 assert.equal(boot.body.access.status,'trialing');assert.equal(boot.body.access.daysLeft,7);
});
