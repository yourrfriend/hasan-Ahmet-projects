'use strict';
// Gerçek deneme botu (test değil, elle çalıştırılır): bir odaya sahte oyuncular katar ve basit kuralla oynatır.
//   WS_URL=wss://kasaba-test.munupixi.com/ws node test/bot.js ODA [SAYI=7]
//   WS_URL yoksa yerel sunucu (ws://127.0.0.1:${PORT||8787}/ws). Canlıya bağlamak için adresi açıkça ver.
// Davranış (CLAUDE.md "kasaba-test'te gerçek deneme" bunu anlatır; değiştirirsen orayı da güncelle):
//   · gece: hain yaşayan hain olmayan birini öldürür; eşya modunda gece eşyasını ~%50 kullanır (hedefli eşyada rastgele hedef).
//     Öldürme ve eşya TEK act mesajında gider (sunucu her act'te geceyi baştan yazar).
//   · tartışma: ilk tartışmada rol iddia eder (masum taraf kendi rolünü, hain/tarafsız rastgele bir masum rolünü) → gazete iddia kartı;
//     kum saatini ~%50 çevirir; meydan paketi görünce ~%50 kapmayı dener.
//   · oylama: çekimser. · maç sonu: "hazır" (rövanş). · Bağlantı koparsa 3 sn sonra döner; oda yoksa durur.
const WebSocket=require('ws');
const [oda,sayi]=[process.argv[2],+process.argv[3]||7];
if(!oda){console.error('kullanım: node test/bot.js ODA [SAYI]');process.exit(2)}
const URL=process.env.WS_URL||'ws://127.0.0.1:'+(process.env.PORT||8787)+'/ws';
const RENK=['#ff6fae','#2fb55a','#ffd23f','#8e4bff','#2fd3c8','#ff7a2f','#f4f1e8','#6b3f2a','#e23b3b','#9bd84a','#ff9ad5'];
const SAPKA=['beanie','cap','ears','bow','glasses','hood','none'];
const MASUM_ROLLER=['doktor','polis','gozcu','izci','dedektif','tuzakci','masum'];
const sec=a=>a[Math.floor(Math.random()*a.length)];
for(let i=0;i<sayi;i++)setTimeout(()=>bot(i),i*400);
function bot(i){
  const uid='bot-'+oda+'-'+i,ad='Bot'+(i+1);let P=null,priv={},me=null,son='',sonPaket=null,iddia=null;
  const ws=new WebSocket(URL);const yolla=m=>ws.readyState===1&&ws.send(JSON.stringify(m));
  ws.on('open',()=>{yolla({t:'join',room:oda,uid,name:ad,color:RENK[i%RENK.length],hat:SAPKA[i%SAPKA.length]});console.log(ad,'bağlandı')});
  ws.on('message',d=>{const m=JSON.parse(d);
    if(m.t==='you')me=m.id;else if(m.t==='priv')priv=m.d||{};
    else if(m.t==='err'){console.log(ad,'hata',m.m);if(m.code==='noroom'){ws.removeAllListeners('close');ws.close();console.log(ad,'oda yok, duruyor')}}
    else if(m.t==='state'){P=m.P;const ben=(P.players||[]).find(p=>p.id===me);const diri=(P.players||[]).filter(p=>p.alive&&p.id!==me);
      if(P.paket&&P.paket.ends!==sonPaket){sonPaket=P.paket.ends;if(ben&&ben.alive&&Math.random()<0.5)setTimeout(()=>{yolla({t:'kap',d:P.day,g:P.gameId});console.log(ad,'paket kapmayı dener')},300+Math.random()*1500)}
      const k=P.phase+'/'+P.day+'/'+P.gameId;if(k===son)return;son=k;
      setTimeout(()=>{
        if(P.phase==='night'&&ben&&ben.alive){const act={d:P.day,g:P.gameId};
          if(priv.role&&priv.role.team==='imp'){const ark=new Set(priv.mates||[]);const h=diri.filter(p=>!ark.has(p.id));if(h.length)act.kill=sec(h).id}
          const e=(priv.esya||[]).find(x=>!x.kullanildi&&!x.pasif&&x.key!=='fis'&&x.key!=='kum');
          if(e&&Math.random()<0.5){act.esya=e.key;if(e.hedefli&&diri.length)act.esyaHedef=sec(diri).id;console.log(ad,'eşya',e.key,act.esyaHedef||'')}
          if(act.kill||act.esya)yolla({t:'act',...act})}
        if(P.phase==='talk'&&ben&&ben.alive){
          if(iddia!==P.gameId&&priv.role){iddia=P.gameId;const rol=priv.role.team==='inn'?priv.role.key:sec(MASUM_ROLLER);yolla({t:'hizli',k:'rol',rol,d:P.day,n:'bot'});console.log(ad,'iddia',rol)}
          if((priv.esya||[]).some(x=>x.key==='kum'&&!x.kullanildi)&&Math.random()<0.5)yolla({t:'esya',k:'kum',d:P.day,g:P.gameId})}
        if(P.phase==='vote'&&ben&&ben.alive)yolla({t:'vote',v:'skip',d:P.day,g:P.gameId});
        if(P.phase==='end'&&ben)yolla({t:'hazir',v:true});
      },3000+Math.random()*3000)}});
  ws.on('close',()=>{console.log(ad,'koptu; 3 sn sonra yeniden');setTimeout(()=>bot(i),3000)});
  ws.on('error',e=>console.log(ad,'ws hata',e.message));
}
