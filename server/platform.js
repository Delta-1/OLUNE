// Shared provider credentials are read on the server only. Never serialized.
export function createPlatformAI(env=process.env){
 // New installations use OLUNE; existing deployments retain their old aliases.
 const setting=name=>env['OLUNE_AI_'+name]??env['OLUNI_AI_'+name];
 const provider=setting('PROVIDER')==='openai'?'openai':'gemini';
 const apiKey=setting('API_KEY')||(provider==='openai'?env.OPENAI_API_KEY:env.GEMINI_API_KEY)||'';
 const model=setting('MODEL')||(provider==='openai'?'gpt-5-mini':'gemini-2.5-flash');
 const available=!!apiKey&&setting('ENABLED')!=='false';
 return {
  resolve(value={}){if(value?.apiKey&&value.source!=='platform')return {...value,source:'company'};return {...value,provider,model,apiKey:available?apiKey:undefined,enabled:available&&value?.enabled!==false,source:available?'platform':'unavailable'};},
  safe(){return {available,provider,model,source:available?'platform':'unavailable',billing:{mode:'pilot',monthlyFee:0,botIncluded:true}};}
 };
}
