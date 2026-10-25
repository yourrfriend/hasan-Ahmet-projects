'use strict';
// Kimlik: Supabase (GoTrue) erişim token'ını yerelde doğrular — ağ çağrısı yok, bağımlılık yok.
//   dogrula(token, {secret, jwks}) → {sub, exp, suresiDolmus, anonim, eposta} ya da null
//   HS256: secret (JWT_SECRET) ile; ES256/RS256: jwks ({keys:[JWK]}) içinde header.kid ile eşleşen açık anahtarla
//   (self-hosted Supabase v0.8+ token'ları ES256 ile imzalar ve /auth/v1/.well-known/jwks.json'da yayınlar).
// null: biçim bozuk, alg desteklenmiyor, anahtar yok, imza yanlış, sub uuid değil.
// Süresi dolmuş ama imzası doğru token da döner (suresiDolmus:true): oyun için kimlik kabul edilir (tasarım §5.2);
// süreyi önemseyen yerler (hesap birleştirme) bayrağa bakar.
const crypto=require('crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64url=s=>Buffer.from(s).toString('base64url');
function parcala(token){
  if(typeof token!=='string')return null;const p=token.split('.');if(p.length!==3||!p.every(x=>/^[A-Za-z0-9_-]+$/.test(x)))return null;
  let h,b;try{h=JSON.parse(Buffer.from(p[0],'base64url').toString('utf8'));b=JSON.parse(Buffer.from(p[1],'base64url').toString('utf8'))}catch(e){return null}
  if(!h||typeof h!=='object'||!b||typeof b!=='object')return null;
  return {h,b,imza:Buffer.from(p[2],'base64url'),govde:p[0]+'.'+p[1]};
}
function anahtarBul(jwks,kid,kty){
  const keys=jwks&&Array.isArray(jwks.keys)?jwks.keys:[];
  const k=keys.find(j=>j&&j.kid===kid&&j.kty===kty)||(keys.length===1&&!kid&&keys[0].kty===kty?keys[0]:null);
  if(!k)return null;try{return crypto.createPublicKey({key:k,format:'jwk'})}catch(e){return null}
}
function imzaDogru(t,ayar){
  const data=Buffer.from(t.govde);
  try{
    if(t.h.alg==='HS256'){if(!ayar.secret||typeof ayar.secret!=='string')return false;
      const beklenen=crypto.createHmac('sha256',ayar.secret).update(data).digest();
      return beklenen.length===t.imza.length&&crypto.timingSafeEqual(beklenen,t.imza)}
    if(t.h.alg==='ES256'){const k=anahtarBul(ayar.jwks,t.h.kid,'EC');return !!k&&crypto.verify('sha256',data,{key:k,dsaEncoding:'ieee-p1363'},t.imza)}
    if(t.h.alg==='RS256'){const k=anahtarBul(ayar.jwks,t.h.kid,'RSA');return !!k&&crypto.verify('sha256',data,k,t.imza)}
  }catch(e){return false}
  return false;
}
function dogrula(token,ayar){
  if(typeof ayar==='string')ayar={secret:ayar};if(!ayar||typeof ayar!=='object')return null;
  const t=parcala(token);if(!t||!imzaDogru(t,ayar))return null;
  const sub=t.b.sub;if(typeof sub!=='string'||!UUID.test(sub))return null;
  const exp=Number(t.b.exp)||0;
  return {sub:sub.toLowerCase(),exp,suresiDolmus:exp<=Math.floor(Date.now()/1000),anonim:t.b.is_anonymous===true,eposta:typeof t.b.email==='string'&&t.b.email?t.b.email:null};
}
// JWKS'i ayardan çöz: JSON metni ya da base64'ü (systemd env dosyasında tırnak sorunu olmasın diye)
function jwksCoz(metin){if(!metin||typeof metin!=='string')return null;let s=metin.trim();try{if(!s.startsWith('{'))s=Buffer.from(s,'base64').toString('utf8');const j=JSON.parse(s);return j&&Array.isArray(j.keys)?j:null}catch(e){return null}}
// Testler ve araçlar için: HS256 token üretir (sunucu bunu üretmez; token GoTrue'dan gelir).
function imzala(payload,gizli){const h=b64url(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b64url(JSON.stringify(payload));return h+'.'+p+'.'+crypto.createHmac('sha256',gizli).update(h+'.'+p).digest('base64url')}
module.exports={dogrula,imzala,jwksCoz};
