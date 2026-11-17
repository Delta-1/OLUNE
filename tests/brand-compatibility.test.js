import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformAI} from '../server/platform.js';

test('OLUNE credentials work without exposing secrets and old deployment variables still resolve',()=>{
 for(const prefix of ['OLUNE','OLUNI']){
  const platform=createPlatformAI({[prefix+'_AI_API_KEY']:'private-key',[prefix+'_AI_PROVIDER']:'openai',[prefix+'_AI_MODEL']:'configured-model'});
  assert.equal(platform.resolve().apiKey,'private-key');assert.equal(platform.resolve().provider,'openai');assert.equal(platform.resolve().model,'configured-model');
  assert.equal(platform.safe().available,true);assert.equal(JSON.stringify(platform.safe()).includes('private-key'),false);
 }
});

test('OLUNE settings take precedence and an explicit disable does not fall back to an older key',()=>{
 const platform=createPlatformAI({OLUNE_AI_API_KEY:'new-key',OLUNI_AI_API_KEY:'old-key',OLUNE_AI_PROVIDER:'openai',OLUNI_AI_PROVIDER:'gemini',OLUNE_AI_ENABLED:'false',OLUNI_AI_ENABLED:'true'});
 assert.equal(platform.safe().available,false);assert.equal(platform.safe().provider,'openai');assert.equal(platform.resolve().apiKey,undefined);assert.equal(platform.resolve().enabled,false);
 const active=createPlatformAI({OLUNE_AI_API_KEY:'new-key',OLUNI_AI_API_KEY:'old-key'});
 assert.equal(active.resolve().apiKey,'new-key');assert.equal(active.resolve({apiKey:'company-key',source:'company'}).apiKey,'company-key');
});
