// Teste grátis: faixa de contagem regressiva e regras de exibição.
// O servidor é quem decide (GET /bootstrap → access). Aqui só mostramos.
import React from 'react';
import {ArrowRight,Clock3,Lock} from 'lucide-react';
import './trial.css';

export type Access={status:'trialing'|'active'|'expired',trialDays:number,daysLeft?:number,trialEndsAt?:string|null,paidUntil?:string,enforced?:boolean,contact?:string|null};

export const isExpired=(a?:Access|null)=>!!a&&a.enforced!==false&&a.status==='expired';
export const isTrialing=(a?:Access|null)=>!!a&&a.status==='trialing';
export const daysLeft=(a?:Access|null)=>a?.daysLeft??a?.trialDays??0;
export const isLastDay=(a?:Access|null)=>isTrialing(a)&&daysLeft(a)<=1;
export const daysText=(n:number)=>n<=1?'hoje é o último dia':n===2?'faltam 2 dias':'faltam '+n+' dias';

export function TrialBanner({access,admin,onPlans}:{access?:Access|null,admin:boolean,onPlans:()=>void}){
  if(!access)return null;
  if(isExpired(access))return <div className="ol-trial expired" role="status">
    <Lock size={17}/>
    <span><b>{admin?'Seu teste grátis terminou.':'O acesso da empresa está pausado.'}</b> {admin?'Seus dados estão guardados. Para voltar a registrar ponto, documentos e mensagens, escolha um plano.':'Você ainda pode consultar seus dados. O RH precisa ativar o plano para voltar a registrar.'}</span>
    {admin&&<button className="pn-button" onClick={onPlans}>Escolher plano<ArrowRight size={15}/></button>}
  </div>;
  if(!isTrialing(access)||!admin)return null;
  const n=daysLeft(access),used=Math.min(1,Math.max(0,(access.trialDays-n)/access.trialDays)),urgent=n<=2;
  return <div className={'ol-trial'+(urgent?' urgent':'')} role="status">
    <Clock3 size={17}/>
    <span><b>Teste grátis: {daysText(n)}.</b> {urgent?'Escolha um plano para a equipe continuar registrando sem pausa.':'Tudo do OLUNE está liberado durante o teste.'}</span>
    <button className={urgent?'pn-button':'pn-button secondary'} onClick={onPlans}>Ver planos<ArrowRight size={15}/></button>
    <i className="ol-trial-progress" aria-hidden="true"><i style={{width:Math.round(used*100)+'%'}}/></i>
  </div>;
}
