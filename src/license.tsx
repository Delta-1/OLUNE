// Licença do OLUNE na tela: ativação do teste, aviso de dias, selo de teste, pagamento e bloqueio.
import React,{useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import {Check,X,Sparkles,ShieldCheck,Lock,ArrowRight,ExternalLink,Copy,FileText} from 'lucide-react';
import {BrandLogo} from './brand';
import {api} from './api';
import './license.css';

export type License={phase:'trial'|'active'|'grace'|'blocked',expiresAt:string|null,daysLeft:number,graceDaysLeft:number,notice:null|'trial'|'renew'|'grace'|'blocked',blocked:boolean,plan:string|null,planName:string|null,trialEndsAt:string|null,paidUntil:string|null,activationSeen:boolean,earlyDiscount:number,configured:boolean,prices?:{id:string,name:string,months:number,total:number,price:number}[],pending?:{plan:string,checkoutUrl:string,amount:number}|null};

const brl=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dm=(iso?:string|null)=>iso?new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'';
const days=(n:number)=>n<=0?'hoje':n===1?'1 dia':n+' dias';

// Tela de "instalação" na primeira entrada do admin, ao estilo do primeiro boot de um sistema.
export function LicenseActivation({license,onDone}:{license:License,onDone:()=>void}){
  const steps=['Preparando o seu espaço…','Ativando a sua licença de teste…','Liberando ponto, equipe e WhatsApp…','Tudo pronto.'];
  const [i,setI]=useState(0);
  useEffect(()=>{if(i>=steps.length-1)return;const t=setTimeout(()=>setI(i+1),1100);return()=>clearTimeout(t);},[i]);
  const finish=()=>{api('/billing/license/seen',{}).catch(()=>{});onDone();};
  const done=i>=steps.length-1;
  return <div className="pn ol-boot" role="dialog" aria-live="polite" aria-label="Ativando licença de teste">
    <div className="ol-boot-inner">
      <BrandLogo loading={!done}/>
      <h1>{done?<>7 dias grátis <span>ativados.</span></>:'Ativando sua licença de teste de 7 dias grátis'}</h1>
      <p className="ol-boot-step">{steps[i]}</p>
      <div className="ol-boot-bar" aria-hidden="true"><i style={{width:((i+1)/steps.length*100)+'%'}}/></div>
      {done&&<><p className="ol-boot-copy">Use tudo do OLUNE até <b>{dm(license.trialEndsAt)}</b>. Aproveite para conhecer a plataforma com a sua equipe.</p>
        <button className="pn-button" onClick={finish} autoFocus>Começar <ArrowRight size={17}/></button></>}
    </div>
  </div>;
}

// Selo discreto no topo (só admin, durante o teste).
export function TrialBadge({license,onClick}:{license:License,onClick:()=>void}){
  if(license.phase!=='trial')return null;
  return <button className="ol-trial-badge" onClick={onClick} title="Ver planos"><Sparkles size={13}/> Teste grátis · {days(license.daysLeft)}</button>;
}

// Aviso no canto superior direito. Fecha, mas volta a cada vez que o app é aberto.
export function LicenseNotice({license,onPay}:{license:License,onPay:()=>void}){
  const [closed,setClosed]=useState(false);
  if(closed||!license.notice||license.notice==='blocked')return null;
  const off=license.earlyDiscount?Math.round(license.earlyDiscount*100):0;
  const n=license.notice==='trial'?{tone:'trial',title:`Teste grátis: faltam ${days(license.daysLeft)}`,text:`Seu teste vai até ${dm(license.expiresAt)}. Assine antes e ganhe ${off}% de desconto.`,cta:'Ver planos'}
    :license.notice==='renew'?{tone:license.daysLeft<=2?'urgent':'renew',title:`Sua licença vence em ${days(license.daysLeft)}`,text:`Vence em ${dm(license.expiresAt)}. Pague agora com ${off}% de desconto e não pare o ponto da equipe.`,cta:'Pagar agora'}
    :{tone:'urgent',title:'Sua licença venceu',text:`Venceu em ${dm(license.expiresAt)}. Pague em até ${days(license.graceDaysLeft)} para não bloquear o ponto.`,cta:'Pagar agora'};
  return <aside className={'ol-notice '+n.tone} role="status">
    <button className="ol-notice-x" aria-label="Fechar aviso" onClick={()=>setClosed(true)}><X size={15}/></button>
    <b>{n.title}</b><p>{n.text}</p>
    <button className="pn-button" onClick={()=>{setClosed(true);onPay();}}>{n.cta}<ArrowRight size={15}/></button>
  </aside>;
}

// Faixa para todos quando a licença está bloqueada.
export function BlockedBanner({admin,onPay}:{admin:boolean,onPay:()=>void}){
  return <div className="ol-blocked-banner" role="alert"><Lock size={16}/><span>{admin?'Licença vencida: o ponto e as edições estão pausados. Os relatórios continuam disponíveis.':'A licença da empresa venceu. O registro de ponto está pausado. Procure o RH.'}</span>{admin&&<button className="pn-button" onClick={onPay}>Renovar agora</button>}</div>;
}

// Escolha do plano e pagamento por Pix/cartão (QR Code na tela), acompanhando até ativar.
export function PayLicense({license,onPaid,compact=false}:{license:License,onPaid:(l:License)=>void,compact?:boolean}){
  const prices=license.prices||[];
  const [plan,setPlan]=useState(license.plan||'annual'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pay,setPay]=useState<{url:string,amount:number,qr:string}|null>(null),[done,setDone]=useState<License|null>(null);
  const before=useRef(license.paidUntil);
  useEffect(()=>{if(!pay)return;const t=setInterval(async()=>{try{const l=await api<License>('/billing/license');if(l.paidUntil&&l.paidUntil!==before.current&&(l.phase==='active')){clearInterval(t);setDone(l);onPaid(l);}}catch{}},5000);return()=>clearInterval(t);},[pay]);
  const start=async()=>{setBusy(true);setError('');try{const out=await api<{url:string,amount:number}>('/billing/checkout',{planId:plan});setPay({...out,qr:await QRCode.toDataURL(out.url,{margin:1,width:480})});}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const sel=prices.find(p=>p.id===plan);
  if(done)return <div className="ol-pay-done"><span><Check size={34}/></span><h2>Licença ativa</h2><p>Plano {done.planName} pago. Tudo liberado até <b>{new Date(done.paidUntil!).toLocaleDateString('pt-BR')}</b>.</p></div>;
  if(pay)return <div className="ol-pay-qr">
    <p className="pn-label">PLANO {sel?.name.toUpperCase()}</p><b className="ol-pay-amount">{brl(pay.amount)}</b>
    <img src={pay.qr} alt="QR Code para pagar"/>
    <p className="ol-pay-hint">Aponte a câmera do celular e pague com <b>Pix</b>, ou abra o link para pagar com cartão.</p>
    <p className="ol-pay-wait"><i/>Aguardando o pagamento. A licença ativa sozinha.</p>
    <div className="ol-pay-actions"><a className="pn-button" href={pay.url} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Abrir pagamento</a><button className="pn-button secondary" onClick={()=>navigator.clipboard.writeText(pay.url).catch(()=>{})}><Copy size={15}/> Copiar link</button></div>
    <button className="ol-pay-back" onClick={()=>setPay(null)}>Escolher outro plano</button>
  </div>;
  return <div className={'ol-pay'+(compact?' compact':'')}>
    <div className="ol-pay-plans" role="radiogroup" aria-label="Planos">{prices.map(p=><button key={p.id} role="radio" aria-checked={plan===p.id} className={'ol-pay-plan'+(plan===p.id?' on':'')} onClick={()=>setPlan(p.id)}>
      <span className="pn-label">{p.name.toUpperCase()}</span>
      <b>{brl(p.price)}</b>{p.price<p.total&&<s>{brl(p.total)}</s>}
      <small>{p.months===1?'por 1 mês':`${p.months} meses · ${brl(p.price/p.months)}/mês`}</small>
    </button>)}</div>
    {license.earlyDiscount>0&&<p className="ol-pay-off"><Sparkles size={14}/> {Math.round(license.earlyDiscount*100)}% de desconto por pagar antes de vencer.</p>}
    {!license.configured&&<p className="ol-pay-note">Pagamentos em configuração. Fale com a UWY para ativar.</p>}
    {error&&<p className="ol-pay-error" role="alert">{error}</p>}
    <button className="pn-button pn-full" disabled={busy||!license.configured} onClick={start}>{busy?'Gerando pagamento…':'Pagar com Pix ou cartão'}<ArrowRight size={17}/></button>
    <p className="ol-pay-secure"><ShieldCheck size={13}/> Pagamento pelo Mercado Pago. Pix, cartão de crédito (até 12x) ou débito.</p>
  </div>;
}

// Tela cheia para o admin quando bloqueou. Pode seguir só com os relatórios.
export function LicenseBlocked({license,onPaid,onReadOnly}:{license:License,onPaid:(l:License)=>void,onReadOnly:()=>void}){
  return <div className="pn ol-locked"><div className="ol-locked-inner">
    <BrandLogo/>
    <span className="ol-locked-icon"><Lock size={26}/></span>
    <h1>Sua licença do OLUNE venceu</h1>
    <p>Venceu em {license.expiresAt?new Date(license.expiresAt).toLocaleDateString('pt-BR'):'—'}. O registro de ponto e as edições estão pausados. Sua conta e seus dados continuam guardados.</p>
    <PayLicense license={license} onPaid={onPaid}/>
    <button className="ol-locked-ro" onClick={onReadOnly}><FileText size={15}/> Continuar só com os relatórios</button>
  </div></div>;
}

// Página "Planos" dentro do app.
export function LicensePage({license,onPaid}:{license:License,onPaid:(l:License)=>void}){
  const status=license.phase==='trial'?`Teste grátis até ${dm(license.expiresAt)} (${days(license.daysLeft)})`:license.phase==='active'?`Plano ${license.planName||''} ativo até ${license.paidUntil?new Date(license.paidUntil).toLocaleDateString('pt-BR'):''}`:license.phase==='grace'?`Venceu em ${dm(license.expiresAt)}. Bloqueia em ${days(license.graceDaysLeft)}.`:'Licença vencida. Ponto e edições pausados.';
  return <><div className="pn-page-title"><div><span className="pn-label">SUA LICENÇA</span><h1>Planos</h1><p>{status}</p></div></div>
    <section className="pn-panel ol-license-panel"><PayLicense license={license} onPaid={onPaid}/></section></>;
}
