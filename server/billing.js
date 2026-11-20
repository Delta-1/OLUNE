// Planos do OLUNE cobrados pelo HubCash (central de pagamentos UWY).
// Sem HUBCASH_URL/HUBCASH_API_KEY a tela de planos continua em modo demonstração.
import crypto from 'node:crypto';
import {fail} from './security.js';

export const PLANS={
  monthly:{id:'monthly',name:'Mensal',months:1,total:200,kind:'subscription'},
  semiannual:{id:'semiannual',name:'Semestral',months:6,total:1140,kind:'checkout'},
  annual:{id:'annual',name:'Anual',months:12,total:2160,kind:'checkout'},
};

export function hubcashConfig(env=process.env){
  const url=String(env.HUBCASH_URL||'').replace(/\/$/,''),apiKey=env.HUBCASH_API_KEY,webhookSecret=env.HUBCASH_WEBHOOK_SECRET;
  return url&&apiKey?{url,apiKey,webhookSecret}:null;
}

// Mesmo formato do sdk/hubcash.js do HubCash: x-hubcash-signature "t=...,v1=HMAC(t.corpo)".
export function verifyHubcash(raw,header,secret,toleranceSec=300){
  if(!secret||!raw)return null;
  const parts=Object.fromEntries(String(header||'').split(',').map(p=>p.split('=').map(s=>s.trim())));
  const ts=Number(parts.t);if(!ts||!parts.v1||Math.abs(Date.now()/1000-ts)>toleranceSec)return null;
  const expected=crypto.createHmac('sha256',secret).update(ts+'.'+raw).digest('hex'),a=Buffer.from(expected),b=Buffer.from(String(parts.v1));
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{return JSON.parse(String(raw));}catch{return null;}
}

const addMonths=(from,months)=>{const d=new Date(from);d.setMonth(d.getMonth()+months);return d.toISOString();};
const recordId=companyId=>'billing:'+companyId;

export function installBilling({route,store,env=process.env,fetchImpl=globalThis.fetch,publicAppUrl}){
  const read=companyId=>store.get('billing',recordId(companyId),companyId);
  const write=(companyId,value)=>store.put('billing',companyId,value,recordId(companyId));
  const publicState=(b,configured)=>({configured,plan:b?.plan||null,planName:PLANS[b?.plan]?.name||null,status:b?.status||'none',paidUntil:b?.paidUntil||null,checkoutUrl:b?.status==='pending'?b.checkoutUrl:null});

  async function hubcash(path,body,idempotencyKey){
    const cfg=hubcashConfig(env);if(!cfg)throw fail(503,'Pagamentos ainda não configurados.');
    const res=await fetchImpl(cfg.url+path,{method:'POST',headers:{authorization:'Bearer '+cfg.apiKey,'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>null);
    if(!res.ok)throw fail(502,'Não foi possível abrir o pagamento: '+(data?.error||res.status));
    return data;
  }

  // Webhook do HubCash (público, autenticado pela assinatura). Registrar ANTES do middleware de login.
  const webhook=()=>route('post','/billing/hubcash',async(req,res)=>{
    const event=verifyHubcash(req.rawBody,req.get('x-hubcash-signature'),hubcashConfig(env)?.webhookSecret);
    if(!event)return res.status(401).json({error:'Assinatura inválida.'});
    const charge=event.data||{},companyId=String(charge.externalReference||'');
    const current=companyId&&await read(companyId);
    if(!current||current.chargeId!==charge.id)return res.json({ignored:true});
    const plan=PLANS[current.plan],now=new Date().toISOString(),next={...current,lastEvent:event.type,updatedAt:now};
    if(event.type==='charge.paid'||event.type==='subscription.payment_succeeded'){next.status='active';next.paidUntil=addMonths(current.paidUntil&&current.paidUntil>now?current.paidUntil:now,plan.months);}
    else if(event.type==='subscription.activated')next.status='active';
    else if(event.type==='subscription.canceled')next.status='canceled';
    else if(event.type==='charge.failed'||event.type==='subscription.payment_failed')next.status=current.status==='active'?'past_due':'failed';
    await write(companyId,next);res.json({ok:true});
  });

  const privateRoutes=({admin})=>{
    route('get','/billing/subscription',async(req,res)=>res.json(publicState(await read(req.user.companyId),!!hubcashConfig(env))));
    route('post','/billing/checkout',admin,async(req,res)=>{
      const plan=PLANS[req.body?.planId];if(!plan)throw fail(400,'Plano inválido.');
      const company=await store.get('company',req.user.companyId,req.user.companyId);
      const base=String(publicAppUrl||env.PUBLIC_APP_URL||'').replace(/\/$/,'');
      const common={amount:plan.total,description:`OLUNE · Plano ${plan.name}`,customer:{email:req.user.email,name:company?.name||req.user.name},externalReference:req.user.companyId,...(base?{returnUrl:base+'/?pagamento=ok'}:{})};
      const key=`olune:${req.user.companyId}:${plan.id}:${new Date().toISOString().slice(0,13)}`;
      const charge=plan.kind==='subscription'?await hubcash('/v1/subscriptions',{...common,intervalMonths:plan.months},key):await hubcash('/v1/checkouts',{...common,maxInstallments:12},key);
      const prev=await read(req.user.companyId);
      await write(req.user.companyId,{...(prev||{}),plan:plan.id,chargeId:charge.id,checkoutUrl:charge.checkoutUrl,status:prev?.status==='active'?'active':'pending',requestedBy:req.user.id,requestedAt:new Date().toISOString()});
      res.json({url:charge.checkoutUrl,chargeId:charge.id});
    });
  };
  return {webhook,privateRoutes};
}
