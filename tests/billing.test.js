import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';

const secret='test-only-secret-for-moodcorp-at-least-32-chars';
const WEBHOOK_SECRET='whsec_teste';
const person=(email,extra={})=>({name:'Pessoa Teste',phone:'5568999999999',jobTitle:'RH',department:'RH',birthDate:'1999-05-20',email,password:'teste-Seguro123',...extra});

async function listen(app){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return server;}

async function fixture(t,{configured=true}={}){
  // HubCash falso: guarda o que o OLUNE pediu.
  const calls=[],hub=express();hub.use(express.json());
  hub.post('/v1/:kind',(req,res)=>{calls.push({kind:req.params.kind,auth:req.get('authorization'),body:req.body});res.status(201).json({id:'chg_'+calls.length,checkoutUrl:'https://mp.test/pay/'+calls.length,status:'pending'});});
  const hubServer=await listen(hub);t.after(()=>new Promise(r=>hubServer.close(r)));
  const env=configured?{HUBCASH_URL:'http://127.0.0.1:'+hubServer.address().port,HUBCASH_API_KEY:'hc_test_chave',HUBCASH_WEBHOOK_SECRET:WEBHOOK_SECRET}:{};
  const store=new MemoryStore(),gateway={status:async()=>({status:'disconnected'}),connect:async()=>{},disconnect:async()=>{}};
  const server=await listen(createApp({store,secret,gateway,ai:async()=>'ok',platformEnv:env,publicAppUrl:'https://olune.test'}));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const request=async(path,body,session='',headers={})=>{const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{}),...headers},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body))});return {status:res.status,body:await res.json()};};
  const reg=await request('/auth/register',person('rh@empresa.com',{mode:'company',document:'11222333000181',companyName:'Empresa Teste',remember:true}));
  assert.equal(reg.status,201);
  return {calls,request,admin:reg.body.token,companyId:reg.body.user.companyId};
}
const sign=(body,ts=Math.floor(Date.now()/1000))=>`t=${ts},v1=${crypto.createHmac('sha256',WEBHOOK_SECRET).update(ts+'.'+body).digest('hex')}`;

test('plano anual abre checkout no HubCash e é ativado pelo webhook assinado',async t=>{
  const f=await fixture(t);
  const out=await f.request('/billing/checkout',{planId:'annual'},f.admin);
  assert.equal(out.status,200);assert.equal(out.body.url,'https://mp.test/pay/1');
  assert.equal(f.calls[0].kind,'checkouts');assert.equal(f.calls[0].auth,'Bearer hc_test_chave');
  assert.equal(f.calls[0].body.amount,2160);assert.equal(f.calls[0].body.externalReference,f.companyId);assert.equal(f.calls[0].body.maxInstallments,12);
  assert.equal((await f.request('/billing/subscription',undefined,f.admin)).body.status,'pending');

  const event=JSON.stringify({id:'evt_1',type:'charge.paid',data:{id:'chg_1',externalReference:f.companyId,status:'paid'}});
  assert.equal((await f.request('/billing/hubcash',event,'',{'x-hubcash-signature':'t=1,v1=errado'})).status,401);
  assert.equal((await f.request('/billing/hubcash',event,'',{'x-hubcash-signature':sign(event)})).status,200);
  const sub=(await f.request('/billing/subscription',undefined,f.admin)).body;
  assert.equal(sub.status,'active');assert.equal(sub.plan,'annual');
  const months=(new Date(sub.paidUntil)-Date.now())/(30*86400e3);assert.ok(months>11.5&&months<12.5);
});

test('plano mensal vira assinatura recorrente de R$ 200',async t=>{
  const f=await fixture(t);
  await f.request('/billing/checkout',{planId:'monthly'},f.admin);
  assert.equal(f.calls[0].kind,'subscriptions');assert.equal(f.calls[0].body.amount,200);assert.equal(f.calls[0].body.intervalMonths,1);
  assert.equal((await f.request('/billing/checkout',{planId:'vitalicio'},f.admin)).status,400);
});

test('sem HubCash configurado, a tela continua em demonstração',async t=>{
  const f=await fixture(t,{configured:false});
  const out=await f.request('/billing/checkout',{planId:'annual'},f.admin);
  assert.equal(out.status,503);assert.match(out.body.error,/não configurad/);
  assert.equal((await f.request('/billing/subscription',undefined,f.admin)).body.configured,false);
});
