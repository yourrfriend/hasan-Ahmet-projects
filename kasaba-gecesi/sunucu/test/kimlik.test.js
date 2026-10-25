'use strict';
// kimlik.js: Supabase (GoTrue) HS256 token'ını yerelde doğrular; ağ yok.
const test=require('node:test');const assert=require('node:assert');const crypto=require('crypto');
const K=require('../kimlik.js');
const SUB='8f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b',GIZLI='cok-gizli-anahtar';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const yap=(payload,secret,alg='HS256')=>{const h=b64({alg,typ:'JWT'}),p=b64(payload);const sig=crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64url');return h+'.'+p+'.'+sig};
const simdi=Math.floor(Date.now()/1000);

test('doğru imza: sub, exp, süre bilgisi; anonim bayrağı',()=>{
  const t=yap({sub:SUB,exp:simdi+3600,role:'authenticated',is_anonymous:true},GIZLI);
  assert.deepStrictEqual(K.dogrula(t,GIZLI),{sub:SUB,exp:simdi+3600,suresiDolmus:false,anonim:true});
  const t2=yap({sub:SUB,exp:simdi+3600,role:'authenticated'},GIZLI);assert.strictEqual(K.dogrula(t2,GIZLI).anonim,false);
});
test('süresi dolmuş ama imzası doğru: sub döner, suresiDolmus true',()=>{
  const t=yap({sub:SUB,exp:simdi-10},GIZLI);const d=K.dogrula(t,GIZLI);assert.strictEqual(d.sub,SUB);assert.strictEqual(d.suresiDolmus,true);
});
test('yanlış anahtar, alg none, sub uuid değil, bozuk biçim → null (fırlatmaz)',()=>{
  assert.strictEqual(K.dogrula(yap({sub:SUB,exp:simdi+10},'baska'),GIZLI),null);
  assert.strictEqual(K.dogrula(yap({sub:SUB,exp:simdi+10},GIZLI,'none'),GIZLI),null);
  assert.strictEqual(K.dogrula(yap({sub:SUB,exp:simdi+10},GIZLI,'HS512'),GIZLI),null);
  assert.strictEqual(K.dogrula(yap({sub:'admin',exp:simdi+10},GIZLI),GIZLI),null);
  const t=yap({sub:SUB,exp:simdi+10},GIZLI);
  for(const x of ['',null,undefined,42,'a.b','a.b.c','%%%.%%%.%%%',t.slice(0,-3),t+'x',t.replace(/^[^.]+/, b64({alg:'HS256',typ:'JWT'})+'x')])assert.strictEqual(K.dogrula(x,GIZLI),null,'null olmalı: '+String(x).slice(0,20));
  assert.strictEqual(K.dogrula(t,''),null,'gizli anahtar yoksa doğrulanmaz');
});
test('imzala (test yardımcısı) ile dogrula uyumlu',()=>{
  const t=K.imzala({sub:SUB,exp:simdi+5},GIZLI);assert.strictEqual(K.dogrula(t,GIZLI).sub,SUB);
});
