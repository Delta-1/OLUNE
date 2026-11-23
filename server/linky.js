// "Entrar com LINKY" no OLUNE (padrão UWY: docs/PADRAO_LOGIN_UWY.md no LINKY).
// OIDC Authorization Code + PKCE S256, state e nonce; o code é trocado aqui no servidor.
// O OLUNE é app da casa: o LINKY o registra sozinho como cliente público a partir de
// LINKY_OLUNE_CLIENT_ID e LINKY_OLUNE_URL configurados no próprio LINKY.
//
// Contas: o OLUNE continua dono do cadastro (empresa, setor, foto, convite…). O LINKY só
// prova quem é a pessoa. Na primeira vez, a conta OLUNE com o mesmo e-mail verificado é
// vinculada ao `sub` do LINKY; daí em diante só esse `sub` entra por LINKY nessa conta.
// Ninguém é criado por aqui e o login por e-mail e senha continua igual.
import * as oidc from 'openid-client';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {fail,digest,lookup,token} from './security.js';

export const LINKY_ISSUER='https://linky.uwy.app/api/identity';
const COOKIE='olune_linky',COOKIE_PATH='/api/auth/linky',TEN_MINUTES=600e3,TICKET_MINUTES=2;
const CLIENT_ID=/^uwy_olune_[A-Za-z0-9_-]{8,64}$/;

export function createLinkyClient({issuer=LINKY_ISSUER,clientId,redirectUri}){
 let configPromise;
 const config=()=>configPromise??=oidc.discovery(new URL(issuer),clientId,{id_token_signed_response_alg:'ES256'},oidc.None()).then(c=>{oidc.enableNonRepudiationChecks(c);return c;}).catch(e=>{configPromise=undefined;throw e;});
 return {
  async start(){const c=await config(),verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce();
   const url=oidc.buildAuthorizationUrl(c,{redirect_uri:redirectUri,scope:'openid email profile',code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',state,nonce});
   return {url:url.href,pending:{verifier,state,nonce}};},
  async finish(currentUrl,pending){const c=await config();
   const tokens=await oidc.authorizationCodeGrant(c,new URL(currentUrl),{pkceCodeVerifier:pending.verifier,expectedState:pending.state,expectedNonce:pending.nonce});
   const sub=tokens.claims().sub,info=await oidc.fetchUserInfo(c,tokens.access_token,sub);
   return {sub,email:typeof info.email==='string'?info.email.trim().toLowerCase():'',emailVerified:info.email_verified===true};},
 };
}

const keyFor=secret=>createHash('sha256').update('olune-linky-pending:'+secret).digest();
export function seal(secret,value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',keyFor(secret),iv),body=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64url');}
export function unseal(secret,raw,now=Date.now()){if(!raw)return null;try{const d=Buffer.from(raw,'base64url'),c=createDecipheriv('aes-256-gcm',keyFor(secret),d.subarray(0,12));c.setAuthTag(d.subarray(12,28));const v=JSON.parse(Buffer.concat([c.update(d.subarray(28)),c.final()]).toString('utf8'));return now-v.at<=TEN_MINUTES?v:null;}catch{return null;}}
const readCookie=(req,name)=>String(req.headers.cookie||'').split(/;\s*/).find(c=>c.startsWith(name+'='))?.slice(name.length+1);

export function installLinky({route,store,secret,issue,env=process.env,client}){
 // Endereço público fixo: o callback registrado no LINKY é um só (https://olune.uwy.app/...).
 const origin=new URL(env.LINKY_APP_URL||'https://olune.uwy.app').origin;
 const clientId=CLIENT_ID.test(env.LINKY_OLUNE_CLIENT_ID||'')?env.LINKY_OLUNE_CLIENT_ID:null;
 const linky=client||(clientId?createLinkyClient({issuer:env.LINKY_ISSUER||LINKY_ISSUER,clientId,redirectUri:origin+'/api/auth/linky/callback'}):null);
 const secure=origin.startsWith('https:');
 const cookie=(res,value,maxAge)=>res.cookie(COOKIE,value,{httpOnly:true,secure,sameSite:'lax',path:COOKIE_PATH,maxAge});
 const back=(res,hash)=>res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').redirect(303,origin+'/#'+hash);

 route('get','/auth/linky/status',async(req,res)=>res.json({enabled:!!linky,native:env.LINKY_NATIVE_AUTH==='true'}));
 route('get','/auth/linky/start',async(req,res)=>{
  if(!linky)return back(res,'linky_error=indisponivel');
  // O cookie do pedido precisa nascer no mesmo domínio do callback.
  if(req.get('host')!==new URL(origin).host&&!client)return res.redirect(303,origin+'/api/auth/linky/start'+(req.query.remember==='1'?'?remember=1':''));
  try{const {url,pending}=await linky.start();cookie(res,seal(secret,{...pending,remember:req.query.remember==='1',at:Date.now()}),TEN_MINUTES);res.set('Cache-Control','no-store').redirect(303,url);}
  catch{back(res,'linky_error=indisponivel');}
 });
 route('get','/auth/linky/callback',async(req,res)=>{
  const pending=unseal(secret,readCookie(req,COOKIE));cookie(res,'',0);
  if(!linky||!pending)return back(res,'linky_error=expirado');
  if(req.query.error)return back(res,'linky_error=cancelado');
  let who;try{who=await linky.finish(new URL(req.originalUrl,origin),pending);}catch{return back(res,'linky_error=falhou');}
  if(!who.email||!who.emailVerified)return back(res,'linky_error=email');
  const user=await store.get('user',lookup(secret,'email',who.email));
  if(!user)return back(res,'linky_error=conta&email='+encodeURIComponent(who.email));
  if(!user.active)return back(res,'linky_error=inativa');
  if(user.linkySub&&user.linkySub!==who.sub)return back(res,'linky_error=outra');
  if(!user.linkySub){user.linkySub=who.sub;user.linkyLinkedAt=new Date().toISOString();await store.put('user',user.companyId,user,user.id);}
  // Bilhete de uso único (2 min) trocado pela sessão normal do OLUNE na tela de login.
  const raw=token(),id=lookup(secret,'linky-ticket',digest(raw));
  await store.put('linky-ticket',user.companyId,{userId:user.id,companyId:user.companyId,remember:pending.remember===true,expiresAt:new Date(Date.now()+TICKET_MINUTES*60e3).toISOString()},id,true);
  back(res,'linky_login='+raw);
 });
 route('post','/auth/linky/redeem',async(req,res)=>{
  const raw=String(req.body?.ticket||'');if(!/^[\w-]{43}$/.test(raw))throw fail(400,'Login com LINKY expirado. Tente de novo.');
  const id=lookup(secret,'linky-ticket',digest(raw)),ticket=await store.get('linky-ticket',id);
  if(!ticket)throw fail(400,'Login com LINKY expirado. Tente de novo.');
  await store.remove('linky-ticket',id,ticket.companyId);
  if(Date.parse(ticket.expiresAt)<Date.now())throw fail(400,'Login com LINKY expirado. Tente de novo.');
  const user=await store.get('user',ticket.userId,ticket.companyId);if(!user?.active)throw fail(401,'Esta conta não está ativa.');
  res.json({...await issue(user,ticket.remember),remember:ticket.remember});
 });
}
