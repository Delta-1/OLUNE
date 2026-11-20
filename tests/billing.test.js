import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {licenseState} from '../server/billing.js';

const secret='test-only-secret-for-moodcorp-at-least-32-chars';
const WEBHOOK_SECRET='whsec_teste';
const DAY=86400e3;
const person=(email,extra={})=>({name:'Pessoa Teste',phone:'5568999999999',jobTitle:'RH',department:'RH',birthDate:'1999-05-20',email,password:'teste-Seguro123',...extra});

async function listen(app){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return server;}

async function fixture(t,{configured=true}={}){
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
  const companyId=reg.body.user.companyId;
  // Ajusta datas da licença direto no banco (simula o tempo passando).
  const setLicense=async patch=>{const id='billing:'+companyId,cur=await store.get('billing',id,companyId);await store.put('billing',companyId,{...cur,...patch},id);};
  return {calls,request,store,setLicense,admin:reg.body.token,companyId};
}
const sign=(body,ts=Math.floor(Date.now()/1000))=>`t=${ts},v1=${crypto.createHmac('sha256',WEBHOOK_SECRET).update(ts+'.'+body).digest('hex')}`;

test('regras da licença: teste, aviso de renovação, tolerância e bloqueio',()=>{
  const now=Date.parse('2026-11-20T12:00:00Z');
  const trial=licenseState({trialEndsAt:new Date(now+5*DAY).toISOString()},now);
  assert.equal(trial.phase,'trial');assert.equal(trial.daysLeft,5);assert.equal(trial.notice,'trial');assert.equal(trial.prices[0].price,190);
  const longPaid=licenseState({trialEndsAt:new Date(now-40*DAY).toISOString(),paidUntil:new Date(now+30*DAY).toISOString()},now);
  assert.equal(longPaid.phase,'active');assert.equal(longPaid.notice,null);
  assert.equal(licenseState({paidUntil:new Date(now+7*DAY).toISOString()},now).notice,'renew');
  const grace=licenseState({paidUntil:new Date(now-1*DAY).toISOString()},now);
  assert.equal(grace.phase,'grace');assert.equal(grace.graceDaysLeft,2);assert.equal(grace.prices[2].price,2160,'sem desconto depois de vencer');
  assert.equal(licenseState({paidUntil:new Date(now-4*DAY).toISOString()},now).phase,'blocked');
});

test('empresa nova ganha 7 dias de teste com tela de ativação',async t=>{
  const f=await fixture(t);
  const l=(await f.request('/billing/license',undefined,f.admin)).body;
  assert.equal(l.phase,'trial');assert.equal(l.daysLeft,7);assert.equal(l.activationSeen,false);assert.equal(l.configured,true);
  assert.equal((await f.request('/billing/license/seen',{},f.admin)).status,200);
  assert.equal((await f.request('/billing/license',undefined,f.admin)).body.activationSeen,true);
});

test('pagar o anual durante o teste: 5% de desconto e os dias do teste não se perdem',async t=>{
  const f=await fixture(t);
  const out=await f.request('/billing/checkout',{planId:'annual'},f.admin);
  assert.equal(out.status,200);assert.equal(out.body.url,'https://mp.test/pay/1');assert.equal(out.body.amount,2052);
  assert.equal(f.calls[0].kind,'checkouts');assert.equal(f.calls[0].body.amount,2052);assert.equal(f.calls[0].body.externalReference,f.companyId);
  const event=JSON.stringify({id:'evt_1',type:'charge.paid',data:{id:'chg_1',externalReference:f.companyId,status:'paid'}});
  assert.equal((await f.request('/billing/hubcash',event,'',{'x-hubcash-signature':'t=1,v1=errado'})).status,401);
  assert.equal((await f.request('/billing/hubcash',event,'',{'x-hubcash-signature':sign(event)})).status,200);
  assert.equal((await f.request('/billing/hubcash',event,'',{'x-hubcash-signature':sign(event)})).status,200,'aviso repetido não soma de novo');
  const l=(await f.request('/billing/license',undefined,f.admin)).body;
  assert.equal(l.phase,'active');assert.equal(l.plan,'annual');
  const days=(Date.parse(l.paidUntil)-Date.now())/DAY;assert.ok(days>365+6&&days<366+8,'12 meses depois do fim do teste: '+days);
});

test('licença vencida: tolerância de 3 dias e depois só leitura',async t=>{
  const f=await fixture(t);
  await f.setLicense({trialEndsAt:new Date(Date.now()-1*DAY).toISOString()});
  let l=(await f.request('/billing/license',undefined,f.admin)).body;
  assert.equal(l.phase,'grace');assert.equal(l.notice,'grace');
  assert.notEqual((await f.request('/attendance/punch',{event:'in'},f.admin)).status,403,'na tolerância ainda funciona');
  await f.setLicense({trialEndsAt:new Date(Date.now()-5*DAY).toISOString()});
  l=(await f.request('/billing/license',undefined,f.admin)).body;
  assert.equal(l.phase,'blocked');
  const punch=await f.request('/attendance/punch',{event:'in'},f.admin);
  assert.equal(punch.status,403);assert.equal(punch.body.license,'blocked');
  assert.equal((await f.request('/bootstrap',undefined,f.admin)).status,200,'consultas continuam');
  assert.equal((await f.request('/billing/checkout',{planId:'monthly'},f.admin)).status,200,'consegue pagar');
  assert.equal(f.calls.at(-1).body.amount,200,'sem desconto depois de vencer');
});

test('sem HubCash configurado, o pagamento fica em demonstração',async t=>{
  const f=await fixture(t,{configured:false});
  const out=await f.request('/billing/checkout',{planId:'annual'},f.admin);
  assert.equal(out.status,503);assert.match(out.body.error,/não configurad/);
  assert.equal((await f.request('/billing/license',undefined,f.admin)).body.configured,false);
});
