// Pedidos de exclusão feitos no LINKY (tabela linky_data_deletions).
// Se a pessoa for a única da empresa, a empresa inteira é apagada.
// Se houver outras pessoas, a empresa fica e só os dados dela saem.
export function createDeletionWorker({db,store,clientId,log=console}){
 let appId=null;
 async function application(){
  if(appId)return appId;
  const {data,error}=await db.from('linky_applications').select('id').eq('slug','olune').eq('login_client_id',clientId).maybeSingle();
  if(error)throw Error('linky_applications indisponível');
  appId=data?.id||null;return appId;
 }
 async function findUser(request){
  if(request.external_user_id){const user=await store.get('user',request.external_user_id);if(user)return user;}
  const users=await store.list('user');
  const email=String(request.email||'').trim().toLowerCase();
  return users.find(u=>u.linkySub&&u.linkySub===request.central_user_id)||(email?users.find(u=>String(u.email||'').trim().toLowerCase()===email):null)||null;
 }
 async function erase(user){
  const tenant=user.companyId;
  const others=(await store.list('user',tenant)).filter(u=>u.id!==user.id);
  if(!others.length){const removed=await store.removeTenant(tenant);return `empresa apagada (${removed} registros)`;}
  const removed=await store.removeOwned(tenant,user.id);
  await store.remove('user',user.id,tenant);
  return `dados da pessoa apagados (${removed+1} registros); empresa mantida`;
 }
 async function tick(){
  const id=await application();if(!id)return 0;
  const {data,error}=await db.from('linky_data_deletions').select('id,central_user_id,external_user_id,email').eq('application_id',id).eq('status','pending').order('requested_at').limit(20);
  if(error)throw Error('linky_data_deletions indisponível');
  for(const request of data||[]){
   let status='done',detail;
   try{const user=await findUser(request);detail=user?await erase(user):'nenhum dado no OLUNE';await db.from('linky_account_links').delete().eq('application_id',id).eq('central_user_id',request.central_user_id);}
   catch{status='failed';detail='erro ao apagar; tente de novo';}
   await db.from('linky_data_deletions').update({status,detail,processed_at:new Date().toISOString()}).eq('id',request.id);
   log.log(`OLUNE: pedido de exclusão ${request.id}: ${status}.`);
  }
  return (data||[]).length;
 }
 return {tick,start(ms=60000){const run=()=>tick().catch(()=>log.error('OLUNE: fila de exclusões indisponível.'));run();const timer=setInterval(run,ms);timer.unref?.();return timer;}};
}
