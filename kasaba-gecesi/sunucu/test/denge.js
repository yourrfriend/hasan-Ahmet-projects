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
for(const k of ['hain','saldirgan','pasif','deli']){const e=process.env['DAGILIM_'+k.toUpperCase()];if(e)G.DAGILIM[k]=new Function('n','return ('+e+')')}
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

function play(n){
  const R=G.createGame({night:15,talk:15,vote:15});G.startGame(R,lobby(n));
  let steps=0,firstNightDeaths=null,oluAdlar=[];
  while(R.P.phase!=='end'&&steps++<60){
    const alive=G.alivePlayers(R).map(p=>p.id);
    if(R.P.phase==='night'){for(const id of alive)G.act(R,id,nightMove(R,id,alive));const before=alive;G.advance(R);
      const sonra=G.alivePlayers(R).map(p=>p.id);oluAdlar=before.filter(x=>!sonra.includes(x)).map(x=>R.P.players.find(p=>p.id===x).name);
      if(firstNightDeaths===null)firstNightDeaths=oluAdlar.length}
    else if(R.P.phase==='talk')G.advance(R);
    else if(R.P.phase==='vote'){const day=R.P.day;for(const id of alive){if(R.P.phase!=='vote'||R.P.day!==day)break;G.vote(R,id,dayVote(R,id,alive,oluAdlar))}if(R.P.phase==='vote')G.advance(R)}
  }
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
