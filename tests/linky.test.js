import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';

const secret='test-only-secret-for-moodcorp-at-least-32-chars';
const person=(email,extra={})=>({name:'Pessoa Teste',phone:'5568999999999',jobTitle:'RH',department:'RH',birthDate:'1999-05-20',email,password:'teste-Seguro123',...extra});

async function fixture(t,identity){
 const who={...identity},client={start:async()=>({url:'https://linky.test/auth?x=1',pending:{verifier:'v',state:'s',nonce:'n'}}),finish:async(url,pending)=>{assert.equal(pending.state,'s');assert.equal(url.searchParams.get('code'),'abc');return {...who};}};
 const store=new MemoryStore(),gateway={status:async()=>({status:'disconnected'}),connect:async()=>{},disconnect:async()=>{}};
 const server=createApp({store,secret,gateway,ai:async()=>'ok',platformEnv:{LINKY_APP_URL:'http://127.0.0.1'},publicAppUrl:'https://olune.test',linkyClient:client}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,body,headers={})=>{const res=await fetch(base+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,location:res.headers.get('location')||'',cookie:res.headers.get('set-cookie')||'',body:res.headers.get('content-type')?.includes('json')?await res.json():null};};
 // Fluxo completo do navegador: start → (LINKY) → callback com o cookie do start.
 const login=async()=>{const s=await call('/auth/linky/start');const cookie=s.cookie.split(';')[0];return call('/auth/linky/callback?code=abc&state=s',undefined,{cookie});};
 return {who,store,call,login};
}
const hashOf=location=>new URLSearchParams(new URL(location).hash.slice(1));

test('LINKY entra na conta OLUNE existente pelo e-mail verificado, sem criar nada',async t=>{
 const f=await fixture(t,{sub:'linky-1',email:'rh@empresa.com',emailVerified:true});
 const reg=await f.call('/auth/register',person('rh@empresa.com',{mode:'company',document:'11222333000181',companyName:'Empresa Teste'}));assert.equal(reg.status,201);
 const before=(await f.store.list('user',reg.body.user.companyId)).length;
 const back=await f.login();assert.equal(back.status,303);
 const ticket=hashOf(back.location).get('linky_login');assert.match(ticket,/^[\w-]{43}$/);
 const out=await f.call('/auth/linky/redeem',{ticket});assert.equal(out.status,200);assert.equal(out.body.user.email,'rh@empresa.com');
 assert.equal((await f.call('/auth/linky/redeem',{ticket})).status,400,'bilhete é de uso único');
 assert.equal((await f.call('/attendance/mine',undefined,{authorization:'Bearer '+out.body.token})).status<400,true);
 const users=await f.store.list('user',reg.body.user.companyId);assert.equal(users.length,before);assert.equal(users[0].linkySub,'linky-1');
 assert.equal((await f.call('/auth/login',{email:'rh@empresa.com',password:'teste-Seguro123'})).status,200,'senha continua valendo');
 // Depois de vinculada, outra conta LINKY com o mesmo e-mail não entra.
 f.who.sub='linky-2';assert.equal(hashOf((await f.login()).location).get('linky_error'),'outra');
});

test('LINKY sem conta, e-mail não verificado ou sem cookie não entra',async t=>{
 const f=await fixture(t,{sub:'linky-9',email:'novo@empresa.com',emailVerified:true});
 assert.equal(hashOf((await f.login()).location).get('linky_error'),'conta');
 f.who.emailVerified=false;assert.equal(hashOf((await f.login()).location).get('linky_error'),'email');
 assert.equal(hashOf((await f.call('/auth/linky/callback?code=abc&state=s')).location).get('linky_error'),'expirado');
 assert.equal((await f.call('/auth/linky/redeem',{ticket:'x'.repeat(43)})).status,400);
});
