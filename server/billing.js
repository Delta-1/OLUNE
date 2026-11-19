// Teste grátis e acesso por plano.
//
// Regras:
// - Toda empresa nova ganha OLUNE_TRIAL_DAYS dias grátis (padrão: 7), sem cartão.
// - Empresas que já existiam antes desta função ganham o teste a partir do
//   primeiro acesso depois da atualização (ninguém é bloqueado de surpresa).
// - Quando o teste acaba sem plano pago, a empresa fica em "somente leitura":
//   tudo continua visível (relatórios, documentos, histórico), mas nada novo é
//   registrado até o plano ser ativado. Nenhum dado é apagado.
// - Enquanto o Mercado Pago não está integrado, a ativação é manual pela
//   variável OLUNE_PAID_COMPANIES="CNPJ_OU_CPF:AAAA-MM-DD,..." no Railway.
//   O webhook de pagamento poderá gravar `paidUntil` no registro de billing.
import {fail,lookup} from './security.js';
import {normalizeDocument} from '../src/company-document.js';

const DAY=86400000;
// Rotas que continuam liberadas com o teste vencido: sair, trocar senha e pagar.
const ALWAYS_ALLOWED=['/auth/logout','/auth/password','/billing'];
export const EXPIRED_MESSAGE='O teste grátis do OLUNE terminou. Seus dados estão guardados; escolha um plano para voltar a registrar.';

export const trialDays=(env=process.env)=>{const n=Number(env.OLUNE_TRIAL_DAYS);return Number.isInteger(n)&&n>0&&n<=90?n:7;};

const endOfDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T23:59:59-03:00'):Date.parse(value);

export function paidCompanies(env=process.env){
 const out=new Map();
 for(const item of String(env.OLUNE_PAID_COMPANIES||'').split(',')){
  const [doc,until]=item.split(':').map(v=>(v||'').trim());
  const key=normalizeDocument(doc);
  if(key&&Number.isFinite(endOfDay(until)))out.set(key,until);
 }
 return out;
}

// Situação de acesso de uma empresa. Pura: fácil de testar.
export function accessFor(company,billing,env=process.env,now=Date.now()){
 const days=trialDays(env);
 const paid=[paidCompanies(env).get(normalizeDocument(company?.document)),billing?.paidUntil].filter(Boolean).map(endOfDay).filter(Number.isFinite);
 const paidUntil=paid.length?Math.max(...paid):null;
 if(paidUntil&&paidUntil>=now)return {status:'active',trialDays:days,paidUntil:new Date(paidUntil).toISOString()};
 const end=Date.parse(billing?.trialEndsAt||'');
 if(!Number.isFinite(end))return {status:'trialing',trialDays:days,daysLeft:days,trialEndsAt:null};
 const left=end-now;
 return {status:left>0?'trialing':'expired',trialDays:days,daysLeft:Math.max(0,Math.ceil(left/DAY)),trialEndsAt:new Date(end).toISOString(),...(paidUntil?{paidUntil:new Date(paidUntil).toISOString()}:{})};
}

export function createBilling({store,secret,companyFor,env=process.env}){
 const id=cid=>lookup(secret,'billing',cid);
 const enforce=String(env.OLUNE_BILLING||'on').toLowerCase()!=='off';
 // Registro próprio (não mexe no registro da empresa, evitando sobrescritas).
 const record=async cid=>{
  const existing=await store.get('billing',id(cid),cid);if(existing)return existing;
  const fresh={companyId:cid,trialStartedAt:new Date().toISOString(),trialEndsAt:new Date(Date.now()+trialDays(env)*DAY).toISOString()};
  try{return await store.put('billing',cid,fresh,id(cid),true);}
  catch(e){if(e.status===409)return await store.get('billing',id(cid),cid);throw e;}
 };
 // WhatsApp de vendas (OLUNE_SALES_WHATSAPP) para ativar o plano até existir pagamento online.
 const contact=String(env.OLUNE_SALES_WHATSAPP||'').replace(/\D/g,'').slice(0,15)||null;
 const status=async cid=>{const s=accessFor(await companyFor(cid),await record(cid),env);return {...s,enforced:enforce,contact};};
 const writable=async cid=>!enforce||(await status(cid)).status!=='expired';
 const assertWritable=async cid=>{if(!await writable(cid))throw fail(402,EXPIRED_MESSAGE);};
 const guard=async(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)||ALWAYS_ALLOWED.some(p=>req.path===p||req.path.startsWith(p+'/')))return next();
  await assertWritable(req.user.companyId);next();
 };
 const install=route=>{
  route('get','/billing/status',async(req,res)=>res.json(await status(req.user.companyId)));
 };
 return {record,status,writable,assertWritable,guard,install};
}
