// Licença do OLUNE: teste grátis de 7 dias, planos pagos pelo HubCash e bloqueio parcial quando vence.
// Sem HUBCASH_URL/HUBCASH_API_KEY o pagamento fica em modo demonstração (a licença continua valendo).
import crypto from 'node:crypto';
import {fail} from './security.js';

const DAY=86400e3;
export const TRIAL_DAYS=7,GRACE_DAYS=3,EARLY_DISCOUNT=0.05,NOTICE_DAYS=7;
export const PLANS={
  monthly:{id:'monthly',name:'Mensal',months:1,total:200},
  semiannual:{id:'semiannual',name:'Semestral',months:6,total:1140},
  annual:{id:'annual',name:'Anual',months:12,total:2160},
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
const maxIso=(...v)=>v.filter(Boolean).sort().at(-1)||null;

// Situação da licença num instante. Fases: trial, active, grace (venceu, ainda funciona), blocked.
export function licenseState(b,now=Date.now()){
  const expiresAt=maxIso(b?.paidUntil,b?.trialEndsAt);
  const paid=!!b?.paidUntil&&(!b?.trialEndsAt||b.paidUntil>=b.trialEndsAt);
  const t=expiresAt?Date.parse(expiresAt):0;
  const phase=!expiresAt?'blocked':now<t?(paid?'active':'trial'):now<t+GRACE_DAYS*DAY?'grace':'blocked';
  const daysLeft=expiresAt?Math.ceil((t-now)/DAY):0;
  const graceDaysLeft=phase==='grace'?Math.ceil((t+GRACE_DAYS*DAY-now)/DAY):0;
  const early=phase==='trial'||phase==='active';
  const auto=b?.autoRenew==='active';
  const notice=phase==='trial'?'trial':phase==='active'&&daysLeft<=NOTICE_DAYS&&!auto?'renew':phase==='grace'?'grace':phase==='blocked'?'blocked':null;
  return {phase,expiresAt,daysLeft,graceDaysLeft,notice,blocked:phase==='blocked',plan:b?.plan||null,planName:PLANS[b?.plan]?.name||null,
    trialEndsAt:b?.trialEndsAt||null,paidUntil:b?.paidUntil||null,activationSeen:!!b?.activationSeen,earlyDiscount:early?EARLY_DISCOUNT:0,
    prices:Object.values(PLANS).map(p=>({id:p.id,name:p.name,months:p.months,total:p.total,price:early?Math.round(p.total*(1-EARLY_DISCOUNT)*100)/100:p.total})),
    pending:b?.status==='pending'?{plan:b.plan,checkoutUrl:b.checkoutUrl,amount:b.amount,auto:!!b.pendingAuto}:null,
    autoRenew:b?.autoRenew||null,autoAmount:b?.autoAmount||null};
}

export function installBilling({route,store,env=process.env,fetchImpl=globalThis.fetch,publicAppUrl,resolveAccess,secret,now=()=>Date.now()}){
  const read=companyId=>store.get('billing',recordId(companyId),companyId);
  const write=(companyId,value)=>store.put('billing',companyId,value,recordId(companyId));

  // Primeiro acesso depois desta versão: começa o teste de 7 dias (vale também para empresas que já existiam).
  async function ensure(companyId){
    const b=await read(companyId);if(b?.trialEndsAt||b?.paidUntil)return b;
    const t=new Date(now()).toISOString();
    return write(companyId,{...(b||{}),trialStartedAt:t,trialEndsAt:new Date(now()+TRIAL_DAYS*DAY).toISOString(),activationSeen:false});
  }
  const license=async companyId=>licenseState(await ensure(companyId),now());

  async function hubcash(path,body,idempotencyKey){
    const cfg=hubcashConfig(env);if(!cfg)throw fail(503,'Pagamentos ainda não configurados.');
    const res=await fetchImpl(cfg.url+path,{method:'POST',headers:{authorization:'Bearer '+cfg.apiKey,'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>null);
    if(!res.ok)throw fail(502,'Não foi possível abrir o pagamento: '+(data?.error||res.status));
    return data;
  }

  // Webhook do HubCash (público, autenticado pela assinatura) e trava do totem. Registrar ANTES do login.
  const webhook=()=>{
    route('post','/billing/hubcash',async(req,res)=>{
      const event=verifyHubcash(req.rawBody,req.get('x-hubcash-signature'),hubcashConfig(env)?.webhookSecret);
      if(!event)return res.status(401).json({error:'Assinatura inválida.'});
      const charge=event.data||{},companyId=String(charge.externalReference||'');
      const current=companyId&&await read(companyId);
      const isSub=charge.object==='subscription';
      if(!current||(isSub?current.subscriptionId!==charge.id:current.chargeId!==charge.id))return res.json({ignored:true});
      const t=new Date(now()).toISOString(),next={...current,lastEvent:event.type,updatedAt:t};
      const paidIds=(charge.payments||[]).filter(p=>p.status==='paid').map(p=>String(p.id));
      if(event.type==='charge.paid'||event.type==='subscription.payment_succeeded'){
        // Cada pagamento conta uma vez só (a assinatura recebe um por mês).
        const key=charge.id+':'+(paidIds.at(-1)||'unico'),seen=current.paidKeys||[];
        if(seen.includes(key))return res.json({ok:true});
        const months=isSub?1:PLANS[current.plan].months;
        // O período pago começa depois do que ainda resta (teste ou licença atual), sem perder dias.
        next.status='active';next.plan=isSub?'monthly':current.plan;next.paidKeys=[...seen,key].slice(-36);next.paidUntil=addMonths(maxIso(t,current.paidUntil,current.trialEndsAt),months);
        if(isSub){next.autoRenew='active';next.pendingAuto=false;}
      }
      else if(event.type==='subscription.activated'){next.autoRenew='active';next.pendingAuto=false;if(next.status==='pending')next.status=current.paidUntil?'active':'pending';}
      else if(event.type==='subscription.canceled'){next.autoRenew='canceled';}
      else if(event.type==='subscription.payment_failed'){next.autoRenew='failed';}
      else if(event.type==='charge.failed')next.status='failed';
      await write(companyId,next);res.json({ok:true});
    });
    if(resolveAccess)route('post','/public/totem/punch',async(req,res,next)=>{
      const c=await resolveAccess(store,secret,req.body?.token,'totem');
      if((await license(c.id)).blocked)throw fail(403,'A licença desta empresa venceu. O registro de ponto está pausado. Procure o RH.');
      next();
    });
  };

  // Depois do login: com a licença bloqueada, só leitura (relatórios, consultas) e o próprio pagamento.
  const guard=async(req,res,next)=>{
    if(req.method==='GET'||/^\/(billing|auth|profile)(\/|$)/.test(req.path))return next();
    if((await license(req.user.companyId)).blocked)return res.status(403).json({error:req.user.role==='admin'?'A licença venceu. Renove para voltar a usar o ponto e as edições. Os relatórios continuam disponíveis.':'A licença da empresa venceu. O ponto está pausado. Procure o RH.',license:'blocked'});
    next();
  };

  const privateRoutes=({admin})=>{
    route('get','/billing/license',async(req,res)=>{const l=await license(req.user.companyId);res.json({...l,configured:!!hubcashConfig(env),...(req.user.role==='admin'?{}:{prices:undefined,pending:undefined})});});
    route('post','/billing/license/seen',admin,async(req,res)=>{const b=await ensure(req.user.companyId);await write(req.user.companyId,{...b,activationSeen:true});res.json({ok:true});});
    route('post','/billing/subscription/cancel',admin,async(req,res)=>{
      const b=await ensure(req.user.companyId);if(!b.subscriptionId||!['active','pending','failed'].includes(b.autoRenew))throw fail(400,'Não há assinatura automática ativa.');
      await hubcash(`/v1/subscriptions/${encodeURIComponent(b.subscriptionId)}/cancel`,{},`olune:cancel:${b.subscriptionId}`);
      await write(req.user.companyId,{...b,autoRenew:'canceled',pendingAuto:false});res.json(await license(req.user.companyId));
    });
    route('get','/billing/subscription',async(req,res)=>{const l=await license(req.user.companyId);res.json({configured:!!hubcashConfig(env),plan:l.plan,planName:l.planName,status:l.phase,paidUntil:l.paidUntil});});
    route('post','/billing/checkout',admin,async(req,res)=>{
      const plan=PLANS[req.body?.planId];if(!plan)throw fail(400,'Plano inválido.');
      const auto=req.body?.auto===true;if(auto&&plan.id!=='monthly')throw fail(400,'A assinatura automática é só para o plano mensal.');
      const l=await license(req.user.companyId),price=auto?Math.round(plan.total*(1-EARLY_DISCOUNT)*100)/100:l.prices.find(p=>p.id===plan.id).price;
      const company=await store.get('company',req.user.companyId,req.user.companyId);
      const base=String(publicAppUrl||env.PUBLIC_APP_URL||'').replace(/\/$/,'');
      const key=`olune:${req.user.companyId}:${plan.id}:${auto?'auto':price}:${new Date(now()).toISOString().slice(0,13)}`;
      const prev=await ensure(req.user.companyId);
      if(auto){
        if(prev.autoRenew==='active')throw fail(400,'A assinatura automática já está ativa.');
        const sub=await hubcash('/v1/subscriptions',{amount:price,description:'OLUNE · Assinatura mensal',intervalMonths:1,customer:{email:req.user.email,name:company?.name||req.user.name},externalReference:req.user.companyId,...(base?{returnUrl:base+'/?pagamento=ok'}:{})},key);
        await write(req.user.companyId,{...prev,subscriptionId:sub.id,autoAmount:price,pendingAuto:true,autoRenew:'pending',subscriptionUrl:sub.checkoutUrl,requestedBy:req.user.id,requestedAt:new Date(now()).toISOString()});
        return res.json({url:sub.checkoutUrl,subscriptionId:sub.id,amount:price,auto:true});
      }
      const charge=await hubcash('/v1/checkouts',{amount:price,description:`OLUNE · Plano ${plan.name}${price<plan.total?' (5% de desconto)':''}`,customer:{email:req.user.email,name:company?.name||req.user.name},externalReference:req.user.companyId,maxInstallments:12,...(base?{returnUrl:base+'/?pagamento=ok'}:{})},key);
      await write(req.user.companyId,{...prev,plan:plan.id,amount:price,chargeId:charge.id,checkoutUrl:charge.checkoutUrl,status:'pending',requestedBy:req.user.id,requestedAt:new Date(now()).toISOString()});
      res.json({url:charge.checkoutUrl,chargeId:charge.id,amount:price});
    });
  };
  return {webhook,guard,privateRoutes,license};
}
