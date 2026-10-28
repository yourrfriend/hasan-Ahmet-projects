'use strict';
// Denge ölçümü: her oyuncu sayısı için çok sayıda oyun oynatır, kazanma oranlarını ve süreyi yazar.
//   node test/denge.js [oyun=2000] [n=4-12]        (npm run denge)
// Test değildir; dağılımları (autoSetup) birbiriyle karşılaştırmak içindir. Oyuncular basit bir stratejiyle
// oynar (gerçek oyuncuyu temsil etmez): hainler masum/tarafsız öldürür, yetenekli roller rastgele hedef seçer,
// gündüz hainler masuma, masumlar "şüpheli"ye (notlarında ölen evin ziyaretçisi geçiyorsa) yoksa rastgele oy verir.
// Bant (%45–55 masum) rapor eşiğidir; bant dışı satırlar "!" ile işaretlenir, eşik kararı kullanıcınındır.
const G=require('../game.js');
const OYUN=+process.argv[2]||2000;
// Eşik denemesi (kalibrasyon): DAGILIM_HAIN='n<=7?1:n<=11?2:3' gibi ifadelerle eşikleri geçici değiştir.
const AYAR={};for(const k of ['hain','saldirgan','pasif','deli','masum']){const e=process.env['DAGILIM_'+k.toUpperCase()];if(e)AYAR[k]=new Function('n','return ('+e+')')} // DAGILIM donmuş: üst yazım startGame'e {dagilim:AYAR} ile geçer
if(process.env.DAGILIM_TEKHAINSURUMP)AYAR.tekHainSurumP=+process.env.DAGILIM_TEKHAINSURUMP; // 0 / 0.5 / 1 (botlar hain yeteneği kullanmaz: tabloya etkisi yok)
const ESYA_MODU=!!process.env.DAGILIM_ESYA; // eşya v2: botlar gece eşyasını %30 (hedefli: rastgele hedef), kum/fiş %30, paketi %50 kapmayı dener
const ESYA_SAY={}; // key → {tasinan,kullanilan}
let PAKET_N=0,PAKET_ALINAN=0;
function esyaSec(R,id){const l=(G.privFor(R,id).esya||[]).filter(e=>!e.kullanildi&&G.ESYA[e.key].faz==='night');return l.length?l[0].key:null}
const ARALIK=(process.argv[3]||'4-12').split('-').map(Number);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const SALDIRGAN=['serikatil','bombaci','hirsiz','buyucu'];

function lobby(n){return Array.from({length:n},(_,i)=>({id:'u'+i,name:'O'+i,color:G.COLORS[i],hat:'none'}))}
function roleOf(R,id){return R.g.roles[id]}
function isImp(R,id){return roleOf(R,id).team==='imp'}

// gece hamlesi: rolün sandığı (deli için sahte) role göre; hainler öldürür
function nightMove(R,id,alive){
  const r=roleOf(R,id);const k=r.mad||r.key;const others=alive.filter(x=>x!==id);
  if(r.team==='imp'){
    // TEK_OLDURME=1: kural varyantı denemesi — hain ekibi gecede tek kurban (yalnız ilk hain öldürür, diğerleri yeteneğini kullanır)
    if(process.env.TEK_OLDURME&&alive.filter(x=>isImp(R,x))[0]!==id){return k!=='hain'&&G.ROLES[k].act==='other'?{ab:pick(others)}:{}}
    const t=others.filter(x=>!isImp(R,x));return{kill:pick(t.length?t:others)}}
  if(k==='hayatta')return R.P.day<=3?{ab:'self'}:{};
  if(k==='bombaci')return{ab:pick(others),det:R.P.day>=3};
  if(k==='buyucu')return{ab:pick(others),guess:pick(Object.keys(G.ROLES))};
  if(k==='masum')return{};
  return{ab:pick(others)};
}
// gündüz oyu: hain → masum/tarafsız; diğerleri → şüpheli ya da rastgele.
// Şüpheli: oyuncunun kendi notlarına göre (İzci: "X gece Y evine gitti" ve Y o gece öldüyse X; Tuzakçı: "X tuzağına
// yakalandı" → X). Gözcü notu ad vermez. oluAdlar: o sabah ölü bulunanların adları.
function dayVote(R,id,alive,oluAdlar){
  const others=alive.filter(x=>x!==id);
  if(isImp(R,id)){const t=others.filter(x=>!isImp(R,x));return pick(t.length?t:others)}
  const notes=G.privFor(R,id).notes||[];const adId={};for(const x of others)adId[R.P.players.find(p=>p.id===x).name]=x;
  const suspects=[];
  for(const n of notes.slice(-3)){
    let m=n.match(/: (\S+) gece (\S+) evine gitti/);if(m&&adId[m[1]]&&oluAdlar.includes(m[2]))suspects.push(adId[m[1]]);
    m=n.match(/: (\S+) tuzağına yakalandı/);if(m&&adId[m[1]])suspects.push(adId[m[1]]);
  }
  return suspects.length&&Math.random()<.8?pick(suspects):pick(others);
}

// yıldız ekonomisi: kasa veren (en az bir oylamalı) maçlarda oyuncu başına döküm
const YILDIZ={oyuncuMac:0,kaynak:{}};
// kademeli başarılar: kasa veren maçlarda oyuncu başına artış (mudavim her oyuncu-maç 1); eşik ayarı için "10 maç/hafta → altın kaç hafta"
const BASARI={};
function play(n){
  // DAGILIM_ESYA=1: eşya modu (botlar eşyasını her gece/oylamada %30 kullanır)
  const R=G.createGame({night:15,talk:15,vote:15,esyaModu:ESYA_MODU});G.startGame(R,lobby(n),{dagilim:AYAR});
  let steps=0,firstNightDeaths=null,oluAdlar=[];
  while(R.P.phase!=='end'&&steps++<60){
    const alive=G.alivePlayers(R).map(p=>p.id);
    if(R.P.phase==='night'){for(const id of alive){const key=ESYA_MODU&&Math.random()<0.3?esyaSec(R,id):null;const hedef=key&&G.ESYA[key].hedef?pick(alive.filter(x=>x!==id)):null;G.act(R,id,{...nightMove(R,id,alive),esya:key,esyaHedef:hedef})}const before=alive;G.advance(R);
      const sonra=G.alivePlayers(R).map(p=>p.id);oluAdlar=before.filter(x=>!sonra.includes(x)).map(x=>R.P.players.find(p=>p.id===x).name);
      if(firstNightDeaths===null)firstNightDeaths=oluAdlar.length}
    else if(R.P.phase==='talk'){if(ESYA_MODU){for(const id of alive)if(Math.random()<0.3)G.esyaKullan(R,id,'kum');
        if(R.g.paket){R.g.paket.zaman=0;G.tick(R);if(R.P.paket){PAKET_N++;for(const id of [...alive].sort(()=>Math.random()-.5))if(Math.random()<0.5&&R.g.paket)G.kap(R,id,R.P.day,R.P.gameId)}}}
      G.advance(R)}
    else if(R.P.phase==='vote'){const day=R.P.day;for(const id of alive){if(R.P.phase!=='vote'||R.P.day!==day)break;G.vote(R,id,dayVote(R,id,alive,oluAdlar),null,null,ESYA_MODU&&Math.random()<0.3)}if(R.P.phase==='vote')G.advance(R)}
  }
  if(ESYA_MODU){for(const l of Object.values(R.g.esya||{}))for(const e of l){const s=ESYA_SAY[e.key]=ESYA_SAY[e.key]||{tasinan:0,kullanilan:0};s.tasinan++;if(e.kullanildi)s.kullanilan++} // e.key dönüşmüş zarın gerçek eşyası
    for(const e of R.gameLog)if(e.tur==='paket')PAKET_ALINAN+=e.veri.alan}
  if(R.P.phase==='end'&&R.gameLog.some(e=>e.tur==='gunduz_sonuc'))for(const p of R.P.players){YILDIZ.oyuncuMac++;for(const x of G.yildizDokumu(R,p.id)){const k=G.YILDIZ_KAYNAK[x.key]?x.key:'rol_basari';YILDIZ.kaynak[k]=(YILDIZ.kaynak[k]||0)+x.adet}
    BASARI.mudavim=(BASARI.mudavim||0)+1;for(const [k,v] of Object.entries(G.basariArtislari(R,p.id)))BASARI[k]=(BASARI[k]||0)+v}
  return{bitti:R.P.phase==='end',kazanan:R.P.winner?R.P.winner.team:null,gun:R.P.day,ilkGece:firstNightDeaths||0};
}

const satirlar=[];
for(let n=ARALIK[0];n<=(ARALIK[1]||ARALIK[0]);n++){
  const s={inn:0,imp:0,neu:0,none:0,gun:0,ilk:0,bitmeyen:0};
  for(let i=0;i<OYUN;i++){const r=play(n);if(!r.bitti){s.bitmeyen++;continue}s[r.kazanan||'none']++;s.gun+=r.gun;s.ilk+=r.ilkGece}
  const b=OYUN-s.bitmeyen||1;const pct=v=>Math.round(100*v/b);const P=v=>String(pct(v)).padStart(3);
  const masum=pct(s.inn);const bant=masum<45||masum>55?'!':' ';
  satirlar.push(`${String(n).padStart(2)} | ${P(s.inn)}% | ${P(s.imp)}% | ${P(s.neu)}% | ${P(s.none)}% | ${(s.gun/b).toFixed(1).padStart(4)} | ${(s.ilk/b).toFixed(2).padStart(5)} | ${String(s.bitmeyen).padStart(3)} ${bant}`);
}
console.log(`${OYUN} oyun/n · strateji basit (rapor eşiği %45–55 masum; "!" bant dışı; beraberlik = herkes öldü; bitmeyen = 60 fazda sonuç yok, ör. Polis–Bombacı kilidi)`);
console.log(' n | masum | hain | taraf | berab | gün  | 1.gece | bitmeyen');
console.log(satirlar.join('\n'));
if(ESYA_MODU){console.log('\neşya | taşınan | kullanılan');for(const [k,s] of Object.entries(ESYA_SAY).sort((a,b)=>b[1].tasinan-a[1].tasinan))console.log(`${k.padEnd(8)} | ${String(s.tasinan).padStart(7)} | ${String(Math.round(100*s.kullanilan/s.tasinan)).padStart(3)}%`);console.log(`paket: ${PAKET_N} açıldı, ${PAKET_ALINAN} eşya kapıldı (${PAKET_N?Math.round(100*PAKET_ALINAN/PAKET_N):0}% / paket; tek kişilik paket 1, iki kişilik 2 sayılır)`)}
{const m=YILDIZ.oyuncuMac||1;const kasa=G.KASA.yildiz/100*8;const dokum=Object.values(YILDIZ.kaynak).reduce((a,v)=>a+v,0)/m;
  console.log('\nyıldız / maç (kasa veren maçlar, oyuncu başı) | '+Object.entries(YILDIZ.kaynak).map(([k,v])=>k+' '+(v/m).toFixed(2)).join(' · ')+' · kasa ~'+kasa.toFixed(2)+' → '+(dokum+kasa).toFixed(2));
  const efs=G.NADIRLIK.efsanevi.fiyat;console.log('hafta senaryosu (günün ilki +'+G.YILDIZ_KAYNAK.gunun_ilki.adet+'/gün, kopya dönüşümü yok) | maç/hafta | gün | ⭐/hafta | efsanevi ('+efs+') hafta');
  for(const [mac,gun] of [[3,2],[10,4],[30,7]]){const h=mac*(dokum+kasa)+gun*G.YILDIZ_KAYNAK.gunun_ilki.adet;console.log(`  ${String(mac).padStart(2)} | ${gun} | ${h.toFixed(1).padStart(5)} | ${(efs/h).toFixed(1)}`)}}
{const m=YILDIZ.oyuncuMac||1;console.log('\nbaşarı (kasa veren maçlar, oyuncu başı) | artış/maç | altın eşiği | 10 maç/hafta → hafta');
  for(const [k,b] of Object.entries(G.BASARILAR)){const a=(BASARI[k]||0)/m;console.log(`  ${k.padEnd(13)} | ${a.toFixed(3).padStart(9)} | ${String(b.esik[2]).padStart(11)} | ${a>0?(b.esik[2]/(a*10)).toFixed(1):'∞'}`)}}
