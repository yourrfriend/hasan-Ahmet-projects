'use strict';
// Kimlik: Supabase (GoTrue) erişim token'ını yerelde doğrular — HS256, ağ çağrısı yok, bağımlılık yok.
// dogrula(token, gizli) → {sub, exp, suresiDolmus, anonim} ya da null (biçim bozuk, alg HS256 değil, imza yanlış, sub uuid değil).
// Süresi dolmuş ama imzası doğru token da döner (suresiDolmus:true): oyun için kimlik kabul edilir (tasarım §5.2);
// süreyi önemseyen yerler (hesap birleştirme) bayrağa bakar.
const crypto=require('crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64url=s=>Buffer.from(s).toString('base64url');
function parcala(token){
  if(typeof token!=='string')return null;const p=token.split('.');if(p.length!==3||!p.every(x=>/^[A-Za-z0-9_-]+$/.test(x)))return null;
  let h,b;try{h=JSON.parse(Buffer.from(p[0],'base64url').toString('utf8'));b=JSON.parse(Buffer.from(p[1],'base64url').toString('utf8'))}catch(e){return null}
  if(!h||typeof h!=='object'||!b||typeof b!=='object')return null;
  return {h,b,imza:p[2],govde:p[0]+'.'+p[1]};
}
function dogrula(token,gizli){
  if(!gizli||typeof gizli!=='string')return null;
  const t=parcala(token);if(!t||t.h.alg!=='HS256')return null;
  const beklenen=Buffer.from(crypto.createHmac('sha256',gizli).update(t.govde).digest('base64url'));
  const gelen=Buffer.from(t.imza);
  if(beklenen.length!==gelen.length||!crypto.timingSafeEqual(beklenen,gelen))return null;
  const sub=t.b.sub;if(typeof sub!=='string'||!UUID.test(sub))return null;
  const exp=Number(t.b.exp)||0;
  return {sub:sub.toLowerCase(),exp,suresiDolmus:exp<=Math.floor(Date.now()/1000),anonim:t.b.is_anonymous===true};
}
// Testler ve araçlar için: aynı biçimde token üretir (sunucu bunu üretmez; token GoTrue'dan gelir).
function imzala(payload,gizli){const h=b64url(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b64url(JSON.stringify(payload));return h+'.'+p+'.'+crypto.createHmac('sha256',gizli).update(h+'.'+p).digest('base64url')}
module.exports={dogrula,imzala};
