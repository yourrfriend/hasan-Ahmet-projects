'use strict';
// hesap.js: GoTrue "Send Email" kancası (Standard Webhooks imzası, yük çözme, gönderim) — saf, ağ yok.
const test=require('node:test');const assert=require('node:assert');
const H=require('../hesap.js');

const SIR='v1,whsec_'+Buffer.from('gizli-anahtar-1').toString('base64');
const SIR2='v1,whsec_'+Buffer.from('gizli-anahtar-2').toString('base64');
const govde=JSON.stringify({user:{id:'u1',email:'a@b.c'},email_data:{token:'123456',email_action_type:'magiclink'}});
const simdi=1700000000000;

test('imzaDogrula: doğru imza geçer; gövde değişince, zaman aşımında, başlık eksikken düşer; ikinci sır da geçer',()=>{
  const h=H.imzala({sir:SIR,id:'msg_1',ts:Math.floor(simdi/1000),govde});
  assert.deepStrictEqual(H.imzaDogrula({sirlar:SIR,headers:h,govde,simdiMs:simdi}),{ok:true});
  assert.strictEqual(H.imzaDogrula({sirlar:SIR,headers:h,govde:govde+' ',simdiMs:simdi}).neden,'imza');
  assert.strictEqual(H.imzaDogrula({sirlar:SIR2,headers:h,govde,simdiMs:simdi}).neden,'imza');
  const eski=H.imzala({sir:SIR,id:'msg_2',ts:Math.floor(simdi/1000)-360,govde});
  assert.strictEqual(H.imzaDogrula({sirlar:SIR,headers:eski,govde,simdiMs:simdi}).neden,'zaman');
  assert.strictEqual(H.imzaDogrula({sirlar:SIR,headers:{'webhook-id':'x'},govde,simdiMs:simdi}).neden,'baslik');
  const h2=H.imzala({sir:SIR2,id:'msg_3',ts:Math.floor(simdi/1000),govde});
  assert.deepStrictEqual(H.imzaDogrula({sirlar:SIR+'|'+SIR2,headers:h2,govde,simdiMs:simdi}),{ok:true});
  // webhook-signature birden çok imza taşıyabilir (boşlukla ayrılmış); biri eşleşince geçer
  const coklu={...h,'webhook-signature':'v1,AAAA '+h['webhook-signature']};
  assert.deepStrictEqual(H.imzaDogrula({sirlar:SIR,headers:coklu,govde,simdiMs:simdi}),{ok:true});
});
test('kancaYukunuCoz: magiclink/signup → giriş kodu; email_change → bağlama kodu yeni adrese; diğerleri null',()=>{
  const u={id:'u1',email:'a@b.c',is_anonymous:false};
  assert.deepStrictEqual(H.kancaYukunuCoz({user:u,email_data:{token:'111111',email_action_type:'magiclink'}}),{tur:'giris',alici:'a@b.c',kod:'111111'});
  assert.deepStrictEqual(H.kancaYukunuCoz({user:u,email_data:{token:'222222',email_action_type:'signup'}}),{tur:'giris',alici:'a@b.c',kod:'222222'});
  assert.deepStrictEqual(H.kancaYukunuCoz({user:{id:'u2',email:'',new_email:'yeni@b.c',is_anonymous:true},email_data:{token:'333333',token_new:'444444',email_action_type:'email_change'}}),{tur:'baglama',alici:'yeni@b.c',kod:'333333'});
  assert.deepStrictEqual(H.kancaYukunuCoz({user:{id:'u2',email:'',email_change:'yeni2@b.c'},email_data:{token:'333333',email_action_type:'email_change'}}),{tur:'baglama',alici:'yeni2@b.c',kod:'333333'});
  assert.strictEqual(H.kancaYukunuCoz({user:u,email_data:{token:'555555',email_action_type:'recovery'}}).tur,null);
  assert.strictEqual(H.kancaYukunuCoz({user:{id:'u3'},email_data:{token:'555555',email_action_type:'magiclink'}}).tur,null,'alıcı yoksa null');
  assert.strictEqual(H.kancaYukunuCoz(null).tur,null);
});
test('kancaIsle: mail gider → 200 {}; sağlayıcı hatası → 500; bilinmeyen tür → 200 ve atlanan',async()=>{
  const cagrilar=[];const eposta={kodMaili:require('../eposta.js').kodMaili,sendTransactionalEmail:async m=>{cagrilar.push(m);return {ok:true,id:'e'}}};
  const sayac={gonderilen:0,hata:0,atlanan:0};
  const r=await H.kancaIsle({yuk:{user:{id:'u1',email:'a@b.c'},email_data:{token:'123456',email_action_type:'magiclink'}},eposta,sayac});
  assert.deepStrictEqual(r,{durum:200,govde:{}});assert.strictEqual(cagrilar.length,1);assert.strictEqual(cagrilar[0].to,'a@b.c');assert.match(cagrilar[0].subject,/giriş kodun: 123456/);
  const r2=await H.kancaIsle({yuk:{user:{id:'u1',email:'a@b.c'},email_data:{token:'1',email_action_type:'recovery'}},eposta,sayac});
  assert.deepStrictEqual(r2,{durum:200,govde:{}});assert.strictEqual(cagrilar.length,1);assert.strictEqual(sayac.atlanan,1);
  const kotu={kodMaili:eposta.kodMaili,sendTransactionalEmail:async()=>({ok:false,neden:'saglayici',durum:500})};
  const r3=await H.kancaIsle({yuk:{user:{id:'u1',email:'a@b.c'},email_data:{token:'1',email_action_type:'magiclink'}},eposta:kotu,sayac});
  assert.strictEqual(r3.durum,500);assert.strictEqual(r3.govde.error.http_code,500);assert.match(r3.govde.error.message,/gönderilemedi/);
  assert.strictEqual(sayac.gonderilen,1);assert.strictEqual(sayac.hata,1);
});
test('maskele: alıcı günlük için maskelenir',()=>{
  assert.strictEqual(H.maskele('baris@gmail.com'),'b***@gmail.com');assert.strictEqual(H.maskele('x'),'***');
});
