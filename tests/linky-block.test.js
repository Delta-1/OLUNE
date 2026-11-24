import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIdentity} from '../server/identity.js';

const env={LINKY_NATIVE_AUTH:'true',LINKY_SUPABASE_URL:'https://x.supabase.co',SUPABASE_URL:'https://x.supabase.co',LINKY_SUPABASE_PUBLISHABLE_KEY:'k'};
const user={linkySub:'sub-1',email:'a@x.test'};
const db=blocked=>({auth:{admin:{getUserById:async()=>({data:{user:{id:'sub-1',email:'a@x.test'}},error:null})}},rpc:async(name,args)=>{assert.equal(name,'linky_is_blocked');assert.deepEqual(args,{p_slug:'olune',p_user:'sub-1'});return blocked==='error'?{data:null,error:{message:'x'}}:{data:blocked,error:null};}});

test('libera quem não está bloqueado no OLUNE', async()=>{
 await createIdentity({env,db:db(false)}).assertUser(user);
});
test('recusa quem está bloqueado no OLUNE', async()=>{
 await assert.rejects(createIdentity({env,db:db(true)}).assertUser(user),e=>e.status===403);
});
test('não libera quando a checagem falha', async()=>{
 await assert.rejects(createIdentity({env,db:db('error')}).assertUser(user),e=>e.status===503);
});
