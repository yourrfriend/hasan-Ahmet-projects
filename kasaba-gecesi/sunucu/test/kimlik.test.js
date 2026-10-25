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

// ES256 / RS256 (Supabase self-hosted JWKS ile imzalar); kid eşleşir, imza doğrulanır
const ec=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=(pair,kid,alg)=>({...pair.publicKey.export({format:'jwk'}),kid,alg,use:'sig'});
const JWKS={keys:[jwk(ec,'kid-ec','ES256'),jwk(rsa,'kid-rsa','RS256')]};
const yapAsim=(payload,kid,alg,priv)=>{const h=b64({alg,typ:'JWT',kid}),p=b64(payload);const data=h+'.'+p;
  const sig=alg==='ES256'?crypto.sign('sha256',Buffer.from(data),{key:priv,dsaEncoding:'ieee-p1363'}):crypto.sign('sha256',Buffer.from(data),priv);
  return data+'.'+sig.toString('base64url')};
test('ES256 token JWKS ile doğrulanır; yanlış anahtar/kid/alg reddedilir; HS256 yine secret ile',()=>{
  const t=yapAsim({sub:SUB,exp:simdi+60,is_anonymous:true},'kid-ec','ES256',ec.privateKey);
  assert.deepStrictEqual(K.dogrula(t,{jwks:JWKS}),{sub:SUB,exp:simdi+60,suresiDolmus:false,anonim:true});
  assert.strictEqual(K.dogrula(t,{secret:GIZLI}),null,'jwks yoksa ES256 doğrulanamaz');
  const baska=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  assert.strictEqual(K.dogrula(yapAsim({sub:SUB,exp:simdi+60},'kid-ec','ES256',baska.privateKey),{jwks:JWKS}),null,'başka anahtarla imza');
  assert.strictEqual(K.dogrula(yapAsim({sub:SUB,exp:simdi+60},'kid-yok','ES256',ec.privateKey),{jwks:JWKS}),null,'bilinmeyen kid');
  assert.strictEqual(K.dogrula(yapAsim({sub:SUB,exp:simdi+60},'kid-ec','RS256',ec.privateKey).replace(/^[^.]+/,b64({alg:'RS256',typ:'JWT',kid:'kid-ec'})),{jwks:JWKS}),null,'alg ile anahtar türü uyuşmaz');
  const r=yapAsim({sub:SUB,exp:simdi+60},'kid-rsa','RS256',rsa.privateKey);assert.strictEqual(K.dogrula(r,{jwks:JWKS}).sub,SUB);
  const hs=yap({sub:SUB,exp:simdi+60},GIZLI);assert.strictEqual(K.dogrula(hs,{secret:GIZLI,jwks:JWKS}).sub,SUB);assert.strictEqual(K.dogrula(hs,{jwks:JWKS}),null,'secret yoksa HS256 doğrulanamaz');
  assert.strictEqual(K.dogrula(hs,GIZLI).sub,SUB,'eski çağrı biçimi (string secret) çalışır');
});
