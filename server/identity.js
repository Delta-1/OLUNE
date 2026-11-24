// The Olune form authenticates against the same Supabase Auth used by Linky.
// Administrative credentials stay on the server; local records contain company permissions only.
import {createClient} from '@supabase/supabase-js';
import {fail} from './security.js';
const invalid=()=>fail(401,'E-mail ou senha incorretos. Use a mesma senha da sua conta LINKY.');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const identity=u=>({sub:u.id,email:String(u.email||'').trim().toLowerCase(),emailVerified:!!u.email_confirmed_at,name:u.user_metadata?.display_name||u.user_metadata?.full_name||''});
export function createIdentity({env=process.env,db}={}){
 if(env.LINKY_NATIVE_AUTH!=='true')return null;
 const url=env.LINKY_SUPABASE_URL,key=env.LINKY_SUPABASE_PUBLISHABLE_KEY;
 // The existing shared database credential is used only when both project URLs match.
 if(!url||!key||url.replace(/\/$/,'')!==String(env.SUPABASE_URL||'').replace(/\/$/,''))throw Error('Configure a identidade LINKY no mesmo projeto compartilhado do OLUNE.');
 const fresh=()=>createClient(url,key,opts);
 const admin=db||createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,opts);
 const check=error=>{if(!error)return;if(error.status>=500||error.name==='AuthRetryableFetchError')throw fail(503,'Não foi possível conectar sua conta. Tente novamente.');if(error.code==='email_not_confirmed')throw fail(403,'Confirme seu e-mail para entrar.');throw invalid();};
 // Bloqueio feito no LINKY só para o OLUNE (linky_app_blocks). Na dúvida, não libera.
 async function notBlocked(sub){const {data,error}=await admin.rpc('linky_is_blocked',{p_slug:'olune',p_user:sub});if(error)throw fail(503,'Não foi possível conectar sua conta. Tente novamente.');if(data===true)throw fail(403,'Seu acesso ao OLUNE está bloqueado. Fale com o responsável pela sua empresa.');}
 async function signIn(email,password){const {data,error}=await fresh().auth.signInWithPassword({email,password});check(error);if(!data.user?.email_confirmed_at)throw fail(403,'Confirme seu e-mail para entrar.');await notBlocked(data.user.id);return identity(data.user);}
 return {
  signIn,
  async register(email,password,name){
   try{return await signIn(email,password);}catch(e){if(e.status!==401)throw e;}
   const {data,error}=await fresh().auth.signUp({email,password,options:{data:{display_name:name}}});
   if(error){if(['user_already_exists','email_exists'].includes(error.code))throw invalid();throw fail(error.status>=500?503:400,'Não foi possível criar a conta. Confira o e-mail e use uma senha mais forte.');}
   if(!data.user||data.user.identities?.length===0)throw invalid();
   return identity(data.user);
  },
  async migrate(email,password,name){
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:name}});
   // Never replace a pre-existing Linky password with an old application password.
   if(error){if(['email_exists','user_already_exists'].includes(error.code))throw invalid();throw fail(503,'Não foi possível unificar sua conta. Tente novamente.');}
   return identity(data.user);
  },
  async changePassword(user,currentPassword,password){const who=await signIn(user.email,currentPassword);if(who.sub!==user.linkySub)throw invalid();const {error}=await admin.auth.admin.updateUserById(who.sub,{password});if(error)throw fail(400,'Não foi possível atualizar a senha da conta.');},
  async requestReset(email){const {error}=await fresh().auth.resetPasswordForEmail(email,{redirectTo:(env.LINKY_SITE_URL||'https://linky.uwy.app')+'/auth/callback?next=%2Fredefinir-senha'});if(error)throw fail(503,'Não foi possível enviar a recuperação. Tente novamente.');},
  async assertUser(user){if(!user.linkySub)throw fail(401,'Entre novamente para unificar sua conta.');const {data,error}=await admin.auth.admin.getUserById(user.linkySub);if(error||!data.user||data.user.email!==user.email||Date.parse(data.user.banned_until||'')>Date.now())throw fail(401,'Sua conta não está disponível. Entre novamente.');await notBlocked(user.linkySub);},
 };
}
export function assertIdentity(user,who){
 if(!who?.sub||!who.emailVerified||who.email!==user.email)throw fail(401,'Não foi possível confirmar sua conta.');
 if(user.linkySub&&user.linkySub!==who.sub)throw fail(403,'Esta conta está ligada a outra identidade. Procure a administração.');
}
