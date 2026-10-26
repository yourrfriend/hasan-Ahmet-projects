'use strict';
// Geçmiş sayfalarının ortak yardımcıları (Plan 5): ayar, paylaşılan Supabase oturumu, sorgu, biçimlendirme.
// Sayfalar yalnız anon anahtar + kullanıcının oturumuyla okur (RLS); servis anahtarı buraya gelmez.
window.KG_SAYFA=(function(){
  const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
  const ayar=fetch('/ayar.json',{cache:'no-cache'}).then(r=>r.json()).catch(()=>null);
  function yukle(src){return new Promise((res,rej)=>{const e=document.createElement('script');e.src=src;e.onload=res;e.onerror=()=>rej(new Error(src));document.head.append(e)})}
  // oturum: aynı origin'deki oyun sayfasının açtığı anonim oturum localStorage'dan gelir; en çok 2 sn beklenir
  async function oturum(){
    const a=await ayar;if(!a||!a.kayit||!a.url||!a.anonKey)return {ayar:a,sb:null,session:null,neden:'kayit-kapali'};
    try{
      if(!window.supabase)await yukle('/sayfa/supabase.js');
      const sb=window.supabase.createClient(a.url,a.anonKey,{auth:{persistSession:true,autoRefreshToken:true}});
      const r=await Promise.race([sb.auth.getSession(),new Promise(res=>setTimeout(()=>res({data:{session:null}}),2000))]);
      const session=r&&r.data&&r.data.session||null;return {ayar:a,sb,session,neden:session?null:'oturum-yok'};
    }catch(e){return {ayar:a,sb:null,session:null,neden:'hata'}}
  }
  const ROLES=()=>(window.KG_GAME&&window.KG_GAME.ROLES)||{};
  // rol etiketi: oyun sonundaki anahtar + takım; Deli ve Hırsız notları
  function rolAdi(p){const G=window.KG_GAME;return G&&G.rolEtiketi?G.rolEtiketi(p):'?'} // etiket tek kaynaktan (game.js rolEtiketi)
  const tarih=iso=>{if(!iso)return '';const d=new Date(iso);return d.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})+' '+d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})};
  const kimlik=()=>{const m=location.pathname.match(/\/(oyun|kasaba)\/([0-9a-f-]{36})$/);return m?{tur:m[1],id:m[2]}:null};
  function not(metin,tur){const n=el('p','not '+(tur||''),metin);const h=document.querySelector('main')||document.body;h.prepend(n);return n}
  return {el,ayar,oturum,rolAdi,tarih,kimlik,not,ROLES};
})();
