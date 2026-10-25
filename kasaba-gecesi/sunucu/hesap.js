'use strict';
// Hesap işleri (Plan 6): GoTrue "Send Email" kancası ve hesap birleştirme. Ağdan bağımsız parçalar burada; HTTP yolları server.js'te.
//   imzaDogrula({sirlar, headers, govde, simdiMs}) → {ok:true} | {ok:false, neden:'baslik'|'zaman'|'imza'}   (Standard Webhooks)
//   imzala({sir, id, ts, govde}) → headers   (testler ve araçlar için)
//   kancaYukunuCoz(yuk) → {tur:'giris'|'baglama'|null, alici, kod}
//   kancaIsle({yuk, eposta, sayac, sayfa}) → {durum, govde}   (sayfa: kodun yazılacağı adres, maile girer)
//   birlestir({eski,yeni}, {dogrula,url,serviceKey,fetch}) → {durum, govde}
//   maskele(eposta) → 'b***@gmail.com'   (günlük için; kod ve token asla yazılmaz)
const crypto=require('crypto');
const ZAMAN_PAYI_MS=5*60*1000;
function anahtarlar(sirlar){return String(sirlar||'').split('|').map(s=>s.trim()).filter(Boolean).map(s=>{const m=/^v1,whsec_(.+)$/.exec(s);return Buffer.from(m?m[1]:s.replace(/^whsec_/,''),'base64')})}
function imzaUret(anahtar,id,ts,govde){return crypto.createHmac('sha256',anahtar).update(id+'.'+ts+'.'+govde).digest('base64')}
function imzala({sir,id,ts,govde}){const [k]=anahtarlar(sir);return {'webhook-id':id,'webhook-timestamp':String(ts),'webhook-signature':'v1,'+imzaUret(k,id,ts,govde)}}
function imzaDogrula({sirlar,headers,govde,simdiMs}){
  const h=headers||{};const id=h['webhook-id'],ts=h['webhook-timestamp'],imza=h['webhook-signature'];
  if(typeof id!=='string'||typeof ts!=='string'||typeof imza!=='string'||!/^\d+$/.test(ts))return {ok:false,neden:'baslik'};
  if(Math.abs(Number(ts)*1000-(simdiMs??Date.now()))>ZAMAN_PAYI_MS)return {ok:false,neden:'zaman'};
  const verilenler=imza.split(' ').map(p=>p.trim()).filter(p=>p.startsWith('v1,')).map(p=>p.slice(3));
  for(const k of anahtarlar(sirlar)){const beklenen=Buffer.from(imzaUret(k,id,ts,govde),'base64');
    for(const v of verilenler){let b;try{b=Buffer.from(v,'base64')}catch(e){continue}if(b.length===beklenen.length&&crypto.timingSafeEqual(b,beklenen))return {ok:true}}}
  return {ok:false,neden:'imza'};
}
// Hangi tür hangi kodla kime: magiclink/signup → giriş kodu (signup: adres başkasınca önceden açılmış olsa da sahibi girebilsin);
// email_change → bağlama kodu yeni adrese (user.new_email). email_change'de kod alanı (token / token_new) kasaba-test'te doğrulanır.
const EMAIL_CHANGE_KOD='token';
function kancaYukunuCoz(yuk){
  const u=yuk&&yuk.user||{},d=yuk&&yuk.email_data||{};const tur=d.email_action_type;
  const kodDogru=k=>typeof k==='string'&&k.length>0;const adres=a=>typeof a==='string'&&a.includes('@')?a:null;
  if(tur==='magiclink'||tur==='signup'){const alici=adres(u.email);return alici&&kodDogru(d.token)?{tur:'giris',alici,kod:d.token}:{tur:null}}
  if(tur==='email_change'){const alici=adres(u.new_email)||adres(u.email_change);const kod=d[EMAIL_CHANGE_KOD];return alici&&kodDogru(kod)?{tur:'baglama',alici,kod}:{tur:null}}
  return {tur:null};
}
async function kancaIsle({yuk,eposta,sayac,sayfa}){
  const c=kancaYukunuCoz(yuk);
  if(!c.tur){if(sayac)sayac.atlanan=(sayac.atlanan||0)+1;return {durum:200,govde:{}}}
  const r=await eposta.sendTransactionalEmail({to:c.alici,...eposta.kodMaili({tur:c.tur,kod:c.kod,sayfa})});
  if(r&&r.ok){if(sayac)sayac.gonderilen=(sayac.gonderilen||0)+1;return {durum:200,govde:{}}}
  if(sayac)sayac.hata=(sayac.hata||0)+1;return {durum:500,govde:{error:{http_code:500,message:'e-posta gönderilemedi'}}};
}
// Birleştirme (tasarım §5.5): iki taze token → RPC hesap_birlestir (service_role) → eski anonim kullanıcı GoTrue admin API ile silinir.
//   birlestir({eski, yeni}, {dogrula, url, serviceKey, fetch}) → {durum, govde}
async function birlestir(govde,{dogrula,url,serviceKey,fetch:f,zamanAsimiMs=8000}){
  if(!govde||typeof govde!=='object'||typeof govde.eski!=='string'||typeof govde.yeni!=='string')return {durum:400,govde:{error:'gecersiz_govde'}};
  const e=dogrula(govde.eski);if(!e)return {durum:401,govde:{error:'eski_gecersiz'}};
  const y=dogrula(govde.yeni);if(!y)return {durum:401,govde:{error:'yeni_gecersiz'}};
  if(e.suresiDolmus)return {durum:401,govde:{error:'eski_suresi_dolmus'}};
  if(y.suresiDolmus)return {durum:401,govde:{error:'yeni_suresi_dolmus'}};
  if(!e.anonim)return {durum:400,govde:{error:'eski_anonim_degil'}};
  if(y.anonim&&!y.eposta)return {durum:400,govde:{error:'yeni_anonim'}};
  if(e.sub===y.sub)return {durum:400,govde:{error:'ayni_hesap'}};
  const kok=String(url||'').replace(/\/+$/,'');const bas={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
  const istek=async(yontem,yol,b)=>{try{const r=await f(kok+yol,{method:yontem,headers:bas,body:b===undefined?undefined:JSON.stringify(b),signal:AbortSignal.timeout(zamanAsimiMs)});return r.status>=200&&r.status<300}catch(x){return false}};
  if(!await istek('POST','/rest/v1/rpc/hesap_birlestir',{eski:e.sub,yeni:y.sub}))return {durum:502,govde:{error:'rpc'}};
  if(!await istek('DELETE','/auth/v1/admin/users/'+e.sub))return {durum:200,govde:{ok:true,uyari:'eski kullanıcı silinemedi'}};
  return {durum:200,govde:{ok:true}};
}
function maskele(e){const m=/^(.)[^@]*(@.+)$/.exec(String(e||''));return m?m[1]+'***'+m[2]:'***'}
module.exports={imzaDogrula,imzala,kancaYukunuCoz,kancaIsle,birlestir,maskele};
