'use strict';
// E-posta gönderimi (Plan 6): tüm mailler tek fonksiyondan çıkar — sendTransactionalEmail({to,subject,text,html}).
// Sağlayıcı değiştirilebilir (saglayicilar haritası); bugün Resend HTTP API. Bağımlılık yok (fetch).
// Kanca yolunda yeniden deneme yok: GoTrue kancayı kendisi 3 kez dener; biz 4 sn içinde cevap veririz.
// Anahtar, kod ve alıcı günlüğe yazılmaz; sayaçlar /saglik'e gider.
//   olustur({apiKey, gonderen, saglayici, fetch, zamanAsimiMs}) → {sendTransactionalEmail, kodMaili, sayac}
//   kodMaili({tur:'baglama'|'giris', kod, sureDk=15}) → {subject, text, html}   (saf)
const GONDEREN='Kasaba Gecesi <oyun@munupixi.com>';
// sayfa: kodun yazılacağı adres (kurulumun kendi adresi, ör. https://kasaba.munupixi.com/); verilirse mailde tek link olarak geçer
const kacis=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kodMaili({tur,kod,sureDk=15,sayfa}){
  const ne=tur==='giris'?'giriş kodun':'doğrulama kodun';
  const amac=tur==='giris'?"Kasaba Gecesi'ne hesabınla giriş yapmak için":"Kasaba Gecesi'nde e-postanı bağlamak için";
  const subject='Kasaba Gecesi '+ne+': '+kod;
  const nereye=sayfa?' Sayfa kapandıysa: '+sayfa+(tur==='giris'?' → "Hesabınla gir".':' → "E-postanı bağla".'):'';
  const text='Merhaba! '+amac+' kodun: '+kod+' — '+sureDk+' dakika geçerli. Kodu oyun sayfasındaki kutuya yaz.'+nereye+' Kodu kimseyle paylaşma; biz asla sormayız. Sen istemediysen bu maili yok say.';
  const html='<p>Merhaba! '+amac+' kodun:</p><p style="font-size:28px;letter-spacing:4px"><b>'+kod+'</b></p><p>'+sureDk+' dakika geçerli. Kodu oyun sayfasındaki kutuya yaz.'+(sayfa?' Sayfa kapandıysa: <a href="'+kacis(sayfa)+'">'+kacis(sayfa)+'</a> → '+(tur==='giris'?'"Hesabınla gir"':'"E-postanı bağla"')+'.':'')+'</p><p>Kodu kimseyle paylaşma; biz asla sormayız.</p><p style="color:#777">Sen istemediysen bu maili yok say.</p>';
  return {subject,text,html};
}
const saglayicilar={
  // Resend: POST https://api.resend.com/emails — 2xx → {id}
  resend:async({apiKey,gonderen,fetch:f,signal,mesaj})=>{
    const r=await f('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from:gonderen,to:[mesaj.to],subject:mesaj.subject,text:mesaj.text,html:mesaj.html}),signal});
    if(r.status>=200&&r.status<300){let j=null;try{j=await r.json()}catch(e){}return {ok:true,id:j&&j.id||null}}
    return {ok:false,neden:'saglayici',durum:r.status};
  }
};
function olustur(ayar={}){
  const saglayici=ayar.saglayici||'resend';if(!saglayicilar[saglayici])throw new Error('bilinmeyen e-posta sağlayıcı: '+saglayici);
  const apiKey=ayar.apiKey||'',gonderen=ayar.gonderen||GONDEREN,f=ayar.fetch||globalThis.fetch,zamanAsimiMs=ayar.zamanAsimiMs||4000;
  const sayac={gonderilen:0,hata:0};
  async function sendTransactionalEmail(mesaj){
    if(!apiKey||!f){sayac.hata++;return {ok:false,neden:'ayarsiz'}}
    const ac=new AbortController();const t=setTimeout(()=>ac.abort(),zamanAsimiMs);
    try{const r=await saglayicilar[saglayici]({apiKey,gonderen,fetch:f,signal:ac.signal,mesaj});if(r.ok)sayac.gonderilen++;else sayac.hata++;return r}
    catch(e){sayac.hata++;return {ok:false,neden:ac.signal.aborted||(e&&e.name==='AbortError')?'zaman_asimi':'ag'}}
    finally{clearTimeout(t)}
  }
  return {sendTransactionalEmail,kodMaili,sayac};
}
module.exports={olustur,kodMaili,varsayilan:olustur({apiKey:process.env.RESEND_API_KEY,gonderen:process.env.EPOSTA_GONDEREN,saglayici:process.env.EPOSTA_SAGLAYICI})};
