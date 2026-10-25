'use strict';
// Kod isteği tavanları ve Turnstile doğrulaması (Plan 7; tasarım …eposta-kotuye-kullanim-design.md §5.2, §5.5). Saf: ağ yalnız verilen fetch ile.
//   tavanlar({simdi, ipOn, ipSaat, adresSaat, adresGun, saat, gun, anonSaat}) → {kontrol, isaretle, anonimKontrol, temizle, boyut, sayac}
//     kontrol({ip,adres}, say=true) → {ok:true} | {ok:false, neden:'ip'|'adres'|'kota', sureSn}   (sıra: ip → adres → kota; say=false sayaçlara yazmaz)
//     isaretle({ip,adres})  — Turnstile geçtikten sonra çağrılır (kayıt düşer)
//     anonimKontrol(ip) → {ok:true} | {ok:false, sureSn}   (kontrol + kayıt birlikte)
//   turnstileDogrula({secret, response, remoteip, action, hostnames, fetch, zamanAsimiMs}) → {ok:true,hostname} | {ok:false, neden, kodlar?}
const ON_DK=10*60*1000,SAAT=3600*1000,GUN=24*SAAT;
function tavanlar(a={}){
  const simdi=a.simdi||(()=>Date.now());
  const S={ipOn:a.ipOn??3,ipSaat:a.ipSaat??6,adresSaat:a.adresSaat??3,adresGun:a.adresGun??6,saat:a.saat??30,gun:a.gun??80,anonSaat:a.anonSaat??10};
  const sayac={istek:0,ip_sinir:0,adres_sinir:0,kota:0,anon:0,anon_sinir:0};
  const M=new Map(); // anahtar → zaman damgaları (artan)
  const liste=k=>{let l=M.get(k);if(!l){l=[];M.set(k,l)}return l};
  const kirp=(l,pencere,t)=>{while(l.length&&t-l[0]>=pencere)l.shift();return l};
  // pencere içindeki kayıt sayısı sınırı aşıyorsa en eski kaydın düşmesine kalan saniye, yoksa 0
  const asim=(k,pencere,sinir,t)=>{const l=M.get(k);if(!l)return 0;const ic=l.filter(x=>t-x<pencere);if(ic.length<sinir)return 0;return Math.max(1,Math.ceil((ic[ic.length-sinir]+pencere-t)/1000))};
  // say=false: ön denetim (Turnstile'dan önce), sayaçlara yazmaz; karar Turnstile sonrası ikinci denetimde sayılır
  function kontrol({ip,adres},say=true){
    const t=simdi();const ad=String(adres||'').trim().toLowerCase();
    let s=asim('ip:'+ip,ON_DK,S.ipOn,t)||asim('ip:'+ip,SAAT,S.ipSaat,t);if(s){if(say)sayac.ip_sinir++;return {ok:false,neden:'ip',sureSn:s}}
    s=asim('adres:'+ad,SAAT,S.adresSaat,t)||asim('adres:'+ad,GUN,S.adresGun,t);if(s){if(say)sayac.adres_sinir++;return {ok:false,neden:'adres',sureSn:s}}
    s=asim('kurulum',SAAT,S.saat,t)||asim('kurulum',GUN,S.gun,t);if(s){if(say)sayac.kota++;return {ok:false,neden:'kota',sureSn:s}}
    return {ok:true};
  }
  function isaretle({ip,adres}){const t=simdi();const ad=String(adres||'').trim().toLowerCase();sayac.istek++;for(const k of ['ip:'+ip,'adres:'+ad,'kurulum'])kirp(liste(k),GUN,t).push(t)}
  function anonimKontrol(ip){const t=simdi();const s=asim('anon:'+ip,SAAT,S.anonSaat,t);if(s){sayac.anon_sinir++;return {ok:false,sureSn:s}}sayac.anon++;kirp(liste('anon:'+ip),SAAT,t).push(t);return {ok:true}}
  function temizle(){const t=simdi();for(const [k,l] of M){kirp(l,GUN,t);if(!l.length)M.delete(k)}}
  return {kontrol,isaretle,anonimKontrol,temizle,boyut:()=>M.size,sayac};
}
const SITEVERIFY='https://challenges.cloudflare.com/turnstile/v0/siteverify';
async function turnstileDogrula({secret,response,remoteip,action,hostnames,fetch:f,zamanAsimiMs=10000}){
  if(!secret)return {ok:false,neden:'ayarsiz'};
  if(typeof response!=='string'||!response)return {ok:false,neden:'belirtec'};
  if(response.length>2048)return {ok:false,neden:'uzun'};
  const govde=new URLSearchParams({secret,response,...(remoteip?{remoteip}:{})}).toString();
  let j;try{const r=await (f||globalThis.fetch)(SITEVERIFY,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:govde,signal:AbortSignal.timeout(zamanAsimiMs)});j=await r.json()}catch(e){return {ok:false,neden:'ag'}}
  if(!j||j.success!==true)return {ok:false,neden:'basarisiz',kodlar:(j&&j['error-codes'])||[]};
  if(action&&j.action!==action)return {ok:false,neden:'action'};
  const h=Array.isArray(hostnames)?hostnames.filter(Boolean):[];if(h.length&&!h.includes(j.hostname))return {ok:false,neden:'hostname'};
  return {ok:true,hostname:j.hostname};
}
module.exports={tavanlar,turnstileDogrula};
