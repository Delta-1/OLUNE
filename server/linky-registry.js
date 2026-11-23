import {fail} from './security.js';
// Reuses Linky's existing application, account-link and subscription records.
// No new schema and no rights derived from user-editable identity metadata.
export function createLinkyRegistry({db,store,clientId}){
 let appId;
 async function application(){const {data,error}=await db.from('linky_applications').select('id,enabled,login_enabled').eq('slug','olune').eq('login_client_id',clientId).maybeSingle();if(error||!data)throw fail(503,'Não foi possível consultar o OLUNE no LINKY.');if(!data.enabled||!data.login_enabled)throw fail(403,'O acesso ao OLUNE está pausado pela administração.');appId=data.id;return data;}
 async function owner(companyId){const users=await store.list('user',companyId);return users.find(u=>u.role==='admin'&&u.active&&u.linkySub);}
 const baseline=b=>({plan_name:b.paidUntil?'OLUNE · '+(b.plan||'Cortesia'):'OLUNE · Teste',status:b.paidUntil?'active':'trial',amount_cents:Math.round((b.amount||0)*100),billing_cycle:b.plan==='annual'?'yearly':'monthly',next_due_at:[b.paidUntil,b.trialEndsAt].filter(Boolean).sort().at(-1)});
 return {
  async link(user){const app=await application();const {data,error:readError}=await db.from('linky_account_links').select('central_user_id').eq('application_id',app.id).eq('external_user_id',user.id).maybeSingle();if(readError)throw fail(503,'Não foi possível consultar o vínculo da conta.');if(data&&data.central_user_id!==user.linkySub)throw fail(403,'Este acesso está ligado a outra conta.');const {error}=await db.from('linky_account_links').upsert({application_id:app.id,central_user_id:user.linkySub,external_user_id:user.id,last_seen_at:new Date().toISOString()},{onConflict:'application_id,central_user_id'});if(error)throw fail(503,'Não foi possível vincular sua conta ao OLUNE.');},
  async license(companyId,local){await application();const admin=await owner(companyId);if(!admin)return local;const app=appId;
   let {data,error}=await db.from('linky_subscriptions').select('status,plan_name,next_due_at').eq('application_id',app).eq('user_id',admin.linkySub).maybeSingle();if(error)throw fail(503,'Não foi possível consultar a licença no LINKY.');
   if(!data){const {error:insertError}=await db.from('linky_subscriptions').upsert({application_id:app,user_id:admin.linkySub,...baseline(local)},{onConflict:'application_id,user_id',ignoreDuplicates:true});if(insertError)throw fail(503,'Não foi possível registrar a licença.');const result=await db.from('linky_subscriptions').select('status,plan_name,next_due_at').eq('application_id',app).eq('user_id',admin.linkySub).single();if(result.error)throw fail(503,'Não foi possível consultar a licença.');data=result.data;}
   if(['canceled','past_due'].includes(data.status))return {...local,paidUntil:null,trialEndsAt:new Date(0).toISOString(),centralBlocked:true};
   // An active subscription with no expiry is a manual unlimited licence.
   const until=data.next_due_at||(data.status==='active'?'9999-12-31T00:00:00.000Z':new Date(0).toISOString());
   return {...local,paidUntil:data.status==='active'?until:null,trialEndsAt:data.status==='trial'?until:null,centralPlanName:data.plan_name};
  },
  async syncBilling(companyId,value){const admin=await owner(companyId);if(!admin)return;await application();const {error}=await db.from('linky_subscriptions').upsert({application_id:appId,user_id:admin.linkySub,...baseline(value)},{onConflict:'application_id,user_id'});if(error)throw fail(503,'Não foi possível atualizar a licença no LINKY.');},
 };
}
