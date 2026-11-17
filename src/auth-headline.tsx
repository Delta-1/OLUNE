import {useEffect,useState} from 'react';
import {Pause,Play} from 'lucide-react';
import './auth-headline.css';

const phrases=[
 ['Menos etapas.','Mais tempo.'],
 ['Seu ponto.','Sem complicar.'],
 ['Equipe unida.','Rotina leve.'],
 ['Tudo em ordem.','Mais clareza.'],
 ['Mais cuidado.','Todo dia.'],
];

export function AuthHeadline(){
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[visible,setVisible]=useState(!document.hidden),[reducedMotion,setReducedMotion]=useState(false);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion=()=>setReducedMotion(media.matches),visibility=()=>setVisible(!document.hidden);
  motion();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{
  if(paused||hovered||focused||!visible||reducedMotion)return;
  const timer=window.setTimeout(()=>setActive(value=>(value+1)%phrases.length),6000);
  return()=>window.clearTimeout(timer);
 },[active,paused,hovered,focused,visible,reducedMotion]);
 return <div className="ol-auth-story" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false);}}>
  <h1 className="ol-auth-headline" aria-live="off">{phrases.map(([first,second],index)=><span key={first} className={'ol-auth-slide'+(active===index?' is-active':'')} aria-hidden={active!==index}><span>{first}</span><em>{second}</em></span>)}</h1>
  <div className="ol-auth-controls" role="group" aria-label="Frases do OLUNE">
   {phrases.map(([first,second],index)=><button key={first} type="button" className="ol-auth-dot" aria-label={'Mostrar frase: '+first+' '+second} aria-current={active===index?'true':undefined} onClick={()=>setActive(index)}><span/></button>)}
   {!reducedMotion&&<button type="button" className="ol-auth-pause" aria-label={paused?'Retomar frases':'Pausar frases'} title={paused?'Retomar frases':'Pausar frases'} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={14}/>:<Pause size={14}/>}</button>}
  </div>
 </div>;
}
