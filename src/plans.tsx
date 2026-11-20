// Tela de planos (DEMONSTRAÇÃO). Nenhuma cobrança é feita aqui:
// a escolha fica só no navegador até a integração de pagamento existir.
import React,{useState} from 'react';
import {ArrowRight,Check,ShieldCheck,Sparkles} from 'lucide-react';
import {BrandLogo} from './brand';
import {api} from './api';
import './plans.css';

export type PlanId='monthly'|'semiannual'|'annual';
export type Plan={id:PlanId,name:string,months:number,perMonth:number,total:number,saving:number,discount:number,note:string,featured?:boolean};

const BASE=200; // valor do plano mensal em R$
const make=(id:PlanId,name:string,months:number,discount:number,note:string,featured=false):Plan=>{
  const perMonth=Math.round(BASE*(1-discount));
  return {id,name,months,perMonth,total:perMonth*months,saving:BASE*months-perMonth*months,discount,note,featured};
};
export const PLANS:Plan[]=[
  make('monthly','Mensal',1,0,'Flexível, sem fidelidade.'),
  make('semiannual','Semestral',6,.05,'Cobrado a cada 6 meses.'),
  make('annual','Anual',12,.10,'Cobrado uma vez por ano.',true),
];
export const FEATURES=['Registro de ponto pelo app, QR Code e totem','Colaboradores, setores e convites ilimitados','Relatórios de ponto e documentos','Atendimento pelo WhatsApp com IA','Flora, a assistente de bem-estar','Suporte e atualizações incluídos'];

const brl=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0});
const KEY='olune:plan';
export const savedPlan=():PlanId|null=>{try{return localStorage.getItem(KEY) as PlanId|null;}catch{return null;}};

function PlanCards({selected,onSelect}:{selected:PlanId,onSelect:(id:PlanId)=>void}){
  return <div className="ol-plans-grid" role="radiogroup" aria-label="Planos do OLUNE">{PLANS.map(p=>
    <button type="button" role="radio" aria-checked={selected===p.id} key={p.id} className={'ol-plan'+(selected===p.id?' selected':'')+(p.featured?' featured':'')} onClick={()=>onSelect(p.id)}>
      <div className="ol-plan-head"><span className="pn-label">{p.name.toUpperCase()}</span>{p.featured?<span className="ol-plan-badge"><Sparkles size={11}/> Mais vantajoso</span>:p.discount?<span className="ol-plan-badge soft">-{Math.round(p.discount*100)}%</span>:null}</div>
      <div className="ol-plan-price"><small>R$</small><strong>{p.perMonth}</strong><span>/mês</span></div>
      <p className="ol-plan-total">{p.months===1?'Cobrança mensal de '+brl(p.total):brl(p.total)+' a cada '+p.months+' meses'}</p>
      <p className="ol-plan-note">{p.saving?<b>Economize {brl(p.saving)}</b>:<b>Sem desconto</b>} · {p.note}</p>
      <span className="ol-plan-check" aria-hidden="true">{selected===p.id&&<Check size={14}/>}</span>
    </button>)}</div>;
}

export function Plans({onDone,onSkip,embedded=false,notify}:{onDone?:(plan:Plan)=>void,onSkip?:()=>void,embedded?:boolean,notify?:(text:string)=>void}){
  const [selected,setSelected]=useState<PlanId>(savedPlan()||'annual'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const plan=PLANS.find(p=>p.id===selected)!;
  // Com o HubCash configurado, abre o pagamento (Mercado Pago). Sem ele, segue como demonstração.
  const confirm=async()=>{
    setBusy(true);setError('');
    try{const out=await api<{url:string}>('/billing/checkout',{planId:plan.id});try{localStorage.setItem(KEY,plan.id);}catch{}if(out?.url){location.href=out.url;return;}}
    catch(e){const message=(e as Error).message||'';if(!/não configurad/i.test(message)){setError(message);setBusy(false);return;}}
    try{localStorage.setItem(KEY,plan.id);}catch{}notify?.('Plano '+plan.name+' selecionado.');setBusy(false);onDone?.(plan);
  };
  const body=<>
    <div className="ol-plans-intro"><span className="pn-tag">PLANOS OLUNE</span><h1>Escolha o plano da sua empresa.</h1><p>Tudo do OLUNE em todos os planos. Quanto maior o período, menor o valor por mês.</p></div>
    <PlanCards selected={selected} onSelect={setSelected}/>
    <div className="ol-plans-bottom">
      <ul className="ol-plans-features">{FEATURES.map(f=><li key={f}><Check size={14}/>{f}</li>)}</ul>
      <div className="ol-plans-cta">
        <div><span className="pn-label">PLANO ESCOLHIDO</span><b>{plan.name} · {brl(plan.perMonth)}/mês</b><small>{plan.months===1?'Total: '+brl(plan.total)+' por mês':'Total: '+brl(plan.total)+' por '+plan.months+' meses'}</small></div>
        <button className="pn-button pn-full" onClick={confirm} disabled={busy}>{busy?'Abrindo pagamento…':embedded?'Selecionar plano':'Continuar com o plano '+plan.name}<ArrowRight size={17}/></button>
        {error&&<p className="ol-plans-error" role="alert">{error}</p>}
        {onSkip&&<button type="button" className="ol-plans-skip" onClick={onSkip}>Decidir depois</button>}
      </div>
    </div>
  </>;
  if(embedded)return <div className="ol-plans ol-plans-embedded">{body}</div>;
  return <div className="pn-auth ol-plans"><div className="pn-auth-top"><BrandLogo/><span>Ponto. Pessoas. Tudo junto.</span></div><div className="ol-plans-center">{body}</div><footer className="pn-auth-bottom"><span><ShieldCheck size={13}/> Pagamento seguro. Cancele quando quiser.</span></footer></div>;
}
