'use strict';
// Kasaba Gecesi — oyun mantığı (eskiden ev sahibinin tarayıcısında çalışırdı).
// Ağdan bağımsızdır: her fonksiyon bir oda-oyun nesnesi R={P,g,settings} alır ve onu günceller.
//   R.P  herkese açık durum (istemciye aynen gider)
//   R.g  gizli durum (roller, gece hamleleri, oylar, notlar) — asla istemciye gitmez
// Kişiye özel paket privFor(R,id) ile üretilir.
// Aynı dosya tarayıcıda da yüklenir (index.html <script src="sunucu/game.js">): sabitler tek yerde durur.
//   Node: module.exports   ·   tarayıcı: window.KG_GAME
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KG_GAME=api})(typeof globalThis!=='undefined'?globalThis:this,function(){

// ---------- Rol tanımları ----------
// act: 'other' = bir ev seçer, 'self' = kendine, yok = yetenek yok. pos: gece gittiği evde nerede durur.
const ROLES={
  masum:{n:'Masum',team:'inn',ico:'🏠',desc:'Özel bir yeteneğin yok. Gündüz tartış, oylamayla hainleri bul.'},
  doktor:{n:'Doktor',team:'inn',ico:'💉',desc:'Gece birini seç. O gece saldırıya uğrarsa kurtulur.',act:'other',pos:'door'},
  deli:{n:'Deli',team:'inn',ico:'🌀',desc:'Masum bir rol olduğunu sanırsın ama yaptıkların hiçbir şey değiştirmez.'},
  polis:{n:'Polis',team:'inn',ico:'👮',desc:'Seçtiğin kişi o gece evden çıkamaz; rolünü kullanamaz. Seri Katil\'i tutamazsın.',act:'other',dual:true,pos:'door'},
  gozcu:{n:'Gözcü',team:'inn',ico:'🔭',desc:'Seçtiğin evi gözetlersin; o gece kaç kişinin geldiğini öğrenirsin.',act:'other',dual:true,pos:'bush'},
  izci:{n:'İzci',team:'inn',ico:'👣',desc:'Seçtiğin kişiyi izlersin; gece hangi eve gittiğini öğrenirsin.',act:'other',dual:true,pos:'bush'},
  dedektif:{n:'Dedektif',team:'inn',ico:'🔍',desc:'Seçtiğin kişinin evini ararsın; olabileceği rolleri öğrenirsin.',act:'other',dual:true,pos:'window'},
  tuzakci:{n:'Tuzakçı',team:'inn',ico:'🪤',desc:'Seçtiğin evin önüne tuzak kurarsın; o eve gelen herkes yakalanır ve rolünü kullanamaz.',act:'other',dual:true,pos:'door'},
  ispiyoncu:{n:'İspiyoncu',team:'inn',ico:'📣',desc:'Bir kez: seçtiğin kişinin rolünü sabah meydanda herkese açıklarsın.',act:'other',once:true,dual:true,pos:'window'},
  provokator:{n:'Provokatör',team:'inn',ico:'🔥',desc:'Bir kez: seçtiğin kişi ertesi günkü oylamaya 2 oyla başlar.',act:'other',once:true,dual:true,pos:'door'},
  hain:{n:'Hain',team:'imp',ico:'🗡️',desc:'Her gece birinin evine girip onu öldürürsün. Hainler birbirini tanır ama gece birbirini göremez.'},
  temizlikci:{n:'Temizlikçi',team:'imp',ico:'🧹',desc:'Gece ya öldürürsün ya temizlersin: seçtiğin kişi o gece ölürse rolü sabah gizli kalır.',act:'other',pos:'door'},
  suclayici:{n:'Suçlayıcı',team:'imp',ico:'🫵',desc:'Gece ya öldürürsün ya suçlarsın: seçtiğin kişi o gece ölür ya da ertesi gün asılırsa rolü Hain görünür.',act:'other',pos:'door'},
  hayatta:{n:'Hayatta Kalan',team:'neu',ico:'🦺',desc:'Sona kadar yaşa. 3 kez yelek giyebilirsin; yelekliyken ölmezsin. Kazanan tarafla kazanırsın.',act:'self'},
  serikatil:{n:'Seri Katil',team:'neu',ico:'🔪',desc:'Her gece birinin evine girip onu öldürürsün. Polis seni tutamaz. Tek başına kalınca kazanırsın.',act:'other',pos:'enter'},
  bombaci:{n:'Bombacı',team:'neu',ico:'🧨',desc:'Her gece bir eve dinamit koyarsın. İstediğin gece hepsini patlatırsın. Herkes ölünce kazanırsın.',act:'other',pos:'door'},
  hirsiz:{n:'Hırsız',team:'neu',ico:'🎭',desc:'Seçtiğin kişinin evine girip onu öldürür ve rolünü çalarsın; artık o rolle o tarafta oynarsın.',act:'other',pos:'enter'},
  buyucu:{n:'Büyücü',team:'neu',ico:'⚡',desc:'Evinden çıkmadan birini seçip rolünü tahmin edersin. Doğruysa yıldırımla ölür, Doktor kurtaramaz. Yanlışsa sen ölürsün. Tek başına kazanırsın.',act:'other',guess:true,pos:'home'},
  hortlak:{n:'Hortlak',team:'neu',ico:'🕯️',desc:'Gece bir evin önüne mum koyarsın. Ertesi gün asılırsan o gece hayalet olarak gelir, mum koyduğun kişiyi öldürürsün. Asılınca kazanırsın.',act:'other',pos:'door'}
};
const MADPOOL=['doktor','polis','gozcu','izci','dedektif','tuzakci','ispiyoncu','provokator'];
const INVGROUPS=[['doktor','serikatil','hirsiz'],['polis','hain','hayatta'],['gozcu','dedektif','bombaci'],['tuzakci','ispiyoncu','temizlikci'],['provokator','suclayici','masum'],['izci','buyucu','hortlak']];
const DUAL=['polis','gozcu','izci','dedektif','tuzakci','ispiyoncu','provokator'];
const SETUP=[
  ...['masum','doktor','deli','polis','gozcu','izci','dedektif','tuzakci','ispiyoncu','provokator'].map(k=>({id:k,key:k,team:'inn'})),
  {id:'hain',key:'hain',team:'imp'},{id:'temizlikci',key:'temizlikci',team:'imp'},{id:'suclayici',key:'suclayici',team:'imp'},
  ...DUAL.map(k=>({id:k+'_h',key:k,team:'imp'})),
  ...['hayatta','serikatil','bombaci','hirsiz','buyucu','hortlak'].map(k=>({id:k,key:k,team:'neu'}))
];
const COLORS=['#3b7bff','#ff6fae','#2fb55a','#ffd23f','#8e4bff','#2fd3c8','#ff7a2f','#f4f1e8','#6b3f2a','#e23b3b','#9bd84a','#ff9ad5'];
const HATS=['none','beanie','cap','ears','bow','glasses','hood'];
const DEFAULT_SETTINGS={night:30,talk:120,vote:45};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

function roleLabel(r){const b=ROLES[r.key];return b.n+((r.team==='imp'&&b.team!=='imp')?' (Hain)':'')}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function autoSetup(n){
  const c={};const add=id=>{c[id]=(c[id]||0)+1};
  const imp=n<=5?1:n<=8?2:3;add('hain');if(imp>=2)add(shuffle(['temizlikci','suclayici','polis_h','gozcu_h','dedektif_h','tuzakci_h','izci_h'])[0]);if(imp>=3)add(shuffle(['hain','ispiyoncu_h','provokator_h','temizlikci'])[0]);
  let used=imp;if(n>=7){add(shuffle(['serikatil','serikatil','bombaci','hirsiz','buyucu','hortlak'])[0]);used++}if(n>=10){add('hayatta');used++}
  const inn=['doktor','polis',...shuffle(['gozcu','dedektif','tuzakci','deli','ispiyoncu','provokator','izci'])];
  for(let i=0;used<n;i++,used++)add(inn[i]||'masum');
  return c;
}
function cleanSettings(s){
  const o={...DEFAULT_SETTINGS};
  for(const k of Object.keys(DEFAULT_SETTINGS))if(s&&Number.isFinite(+s[k]))o[k]=Math.max(15,Math.min(600,Math.round(+s[k])));
  return o;
}

let clock=()=>Date.now();
function setClock(f){clock=f||(()=>Date.now())}

function lobbyState(){return{phase:'lobby',chat:[],dead:[],players:[]}}
function createGame(settings){return{P:lobbyState(),g:null,settings:cleanSettings(settings),seq:0}}

function pl(R,id){return (R.P.players||[]).find(p=>p.id===id)}
function alivePlayers(R){return (R.P.players||[]).filter(p=>p.alive)}
function nameOf(R,id){const p=pl(R,id);return p?p.name:'?'}
function effKey(R,id){const r=R.g.roles[id];return r.mad?null:r.key}
function shownRole(R,id){const r=R.g.roles[id];return r.mad?{key:r.mad,team:'inn'}:{key:r.key,team:r.team}}
function note(R,id,t){if(R.g.notes[id])R.g.notes[id].push('Gece '+R.P.day+': '+t)}
// her sohbet satırı artan bir sıra numarası (s) taşır; sunucu istemciye yalnız yeni satırları yollar
function pushChat(R,m){m.s=R.seq=(R.seq||0)+1;R.P.chat.push(m);if(R.P.chat.length>150)R.P.chat.shift()}
function sysChat(R,t){pushChat(R,{sys:true,t})}

// ---------- Oyun akışı ----------
// lobby: [{id,name,color,hat}] (oda sırasıyla). En az 4, en çok 12 kişi.
function startGame(R,lobby){
  const players=lobby.slice();if(players.length<4||players.length>12)return false;
  const counts=autoSetup(players.length);
  const bag=[];for(const e of SETUP)for(let i=0;i<(counts[e.id]||0);i++)bag.push({key:e.key,team:e.team});shuffle(bag);
  const roles={};players.forEach((p,i)=>{const r=bag[i];roles[p.id]={key:r.key,team:r.team,mad:r.key==='deli'?MADPOOL[Math.floor(Math.random()*MADPOOL.length)]:null,uses:{},vest:3,planted:[]}});
  R.g={roles,acts:{},notes:{},dchat:[],votes:{},provoke:null,blame:null,clean:null,candle:{},haunt:null,hauntWins:[]};
  players.forEach(p=>R.g.notes[p.id]=[]);
  const settings={...R.settings};
  R.P={phase:'night',day:1,ends:clock()+settings.night*1000+6000,chat:[],dead:[],voted:[],settings,gameId:clock(),morning:null,evening:null,provoked:null,
     players:players.map(p=>({id:p.id,name:p.name,alive:true,color:p.color,hat:p.hat})),
     roleList:bag.map(r=>({n:roleLabel(r),team:r.team})).sort((a,b)=>a.team.localeCompare(b.team))};
  return true;
}
function setPhase(R,ph){
  const P=R.P,g=R.g;
  P.phase=ph;g.votes={};P.voted=[];P.provoked=null;P.waited=false;P.waiting=null;
  // sabah/akşam sahnelerine animasyon payı eklenir
  const extra=ph==='talk'?7:ph==='night'?6:0;
  const secs=ph==='night'?P.settings.night:ph==='talk'?P.settings.talk:P.settings.vote;
  P.ends=clock()+(secs+extra)*1000;
  if(ph==='night'){P.day++;g.acts={}}
  if(ph==='vote'){if(g.provoke&&g.provoke.day===P.day)P.provoked=g.provoke.t}
  if(ph!=='talk')P.morning=null;if(ph!=='night')P.evening=null;
}
function inGame(R){return !!R.g&&['night','talk','vote'].includes(R.P.phase)}
function advance(R){
  if(!inGame(R))return false;
  if(R.P.phase==='night')resolveNight(R);
  else if(R.P.phase==='talk')setPhase(R,'vote');
  else if(R.P.phase==='vote')resolveVote(R);
  return true;
}
// Süre dolduysa fazı ilerletir. Değişiklik olduysa true.
// Gece bitiminde bağlantısı kopuk (offline: açık kimlik kümesi) yaşayan oyuncu varsa faz bir kez, en çok WAIT_MS bekler;
// kopuk olanların adı P.waiting ile herkese gösterilir. Hamlesi olup olmadığına bakılmaz: bakılsa rolü ele verirdi.
const WAIT_MS=30000;
function tick(R,offline){
  if(!inGame(R)||!R.P.ends||clock()<R.P.ends)return false;
  if(R.P.phase==='night'&&offline&&!R.P.waited){
    const w=alivePlayers(R).filter(p=>offline.has(p.id)).map(p=>p.id);
    if(w.length){R.P.waited=true;R.P.waiting=w;R.P.ends=clock()+WAIT_MS;return true}
  }
  return advance(R);
}

function resolveNight(R){
  const P=R.P,g=R.g,acts={...g.acts};
  const nm=id=>nameOf(R,id),nt=(id,t)=>note(R,id,t),eff=id=>effKey(R,id);
  const al=alivePlayers(R).map(p=>p.id);const alive=id=>pl(R,id)&&pl(R,id).alive;
  const blocked=new Set(),traps={},visits={},attacks=[],heals=new Set(),vested=new Set(),went={};
  al.forEach(id=>visits[id]=[]);
  // hainde öldürme ile yetenek aynı gece olmaz: öldürme seçildiyse yetenek düşer
  for(const id of al){const r=g.roles[id];if(r.team==='imp'&&acts[id]&&acts[id].kill)acts[id]={...acts[id],ab:null}}
  const A=id=>acts[id]||{};
  const tgt=(id,f)=>{const t=A(id)[f];return(t&&alive(t)&&t!==id)?t:null};
  const M={deaths:[],saved:[],snitch:[],lightning:[],exploded:[],haunted:[],news:[]};
  // 1–2) tuzak ve polis birbirini etkiler, o yüzden birlikte ve sıradan bağımsız çözülür:
  //   · Polisin tuttuğu polis kimseyi tutamaz; iki polis birbirini seçerse ikisi de evde kalır.
  //   · Polisin tuttuğu tuzakçı tuzak kuramaz; tuzağa yakalanan polis kimseyi tutamaz.
  const cops=al.filter(id=>eff(id)==='polis'&&tgt(id,'ab'));
  const trappers=al.filter(id=>eff(id)==='tuzakci'&&tgt(id,'ab'));
  const heldCop=new Set(cops.filter(c=>cops.some(q=>q!==c&&tgt(q,'ab')===c)));
  let heldTrapper=new Set();
  const placeTraps=()=>{for(const k of Object.keys(traps))delete traps[k];for(const t of trappers)if(!heldTrapper.has(t))traps[tgt(t,'ab')]=t};
  const trappedAt=(c,t)=>!!traps[t]&&traps[t]!==c;
  for(let i=0;i<4;i++){placeTraps();
    const free=cops.filter(c=>!heldCop.has(c)&&!trappedAt(c,tgt(c,'ab')));
    const next=new Set(trappers.filter(t=>free.some(c=>tgt(c,'ab')===t)));
    if(next.size===heldTrapper.size&&[...next].every(t=>heldTrapper.has(t)))break;
    heldTrapper=next}
  placeTraps();
  for(const t of trappers){if(heldTrapper.has(t)){blocked.add(t);nt(t,'Polis seni evde tuttu, tuzak kuramadın.')}else went[t]=tgt(t,'ab')}
  // polis seri katili tutamaz
  for(const c of cops){const t=tgt(c,'ab');
    if(heldCop.has(c)){blocked.add(c);nt(c,'Polis seni evde tuttu, kimseyi tutamadın.');continue}
    visits[t].push(c);went[c]=t;
    if(trappedAt(c,t)){blocked.add(c);nt(c,'Tuzağa yakalandın, kimseyi tutamadın.');nt(traps[t],nm(c)+' tuzağına yakalandı.')}
    else if(eff(t)==='serikatil'){nt(c,nm(t)+' evde durmadı; onu tutamadın.')}
    else{blocked.add(t);nt(c,nm(t)+' bu gece evden çıkamadı.');if(!heldCop.has(t)&&!heldTrapper.has(t))nt(t,'Polis seni evde tuttu, rolünü kullanamadın.')}}
  // 3) ziyaretler ve tuzak yakalamaları (büyücü evinden çıkmaz; polis ve tuzakçının yetenek hedefi yukarıda, öldürme hedefi burada)
  for(const id of al){const k=eff(id);const r=g.roles[id];const targets=new Set();
    if(r.team==='imp'&&tgt(id,'kill'))targets.add(tgt(id,'kill'));
    if(k&&ROLES[k].act==='other'&&!['buyucu','polis','tuzakci'].includes(k)&&tgt(id,'ab'))targets.add(tgt(id,'ab'));
    if(r.mad&&tgt(id,'ab'))targets.add(tgt(id,'ab'));
    if(blocked.has(id))continue;
    for(const t of targets){visits[t].push(id);went[id]=t;if(traps[t]&&traps[t]!==id){blocked.add(id);nt(id,nm(t)+' evinde tuzağa yakalandın, rolünü kullanamadın.');nt(traps[t],nm(id)+' tuzağına yakalandı.')}}
  }
  const ok=id=>!blocked.has(id);
  // 4) koruma
  for(const id of al){const k=eff(id);if(k==='doktor'&&ok(id)&&tgt(id,'ab'))heals.add(tgt(id,'ab'));
    if(k==='hayatta'&&ok(id)&&A(id).ab==='self'&&g.roles[id].vest>0){g.roles[id].vest--;vested.add(id);nt(id,'Yelek giydin (kalan '+g.roles[id].vest+').')}}
  // 5) saldırılar: her hain kendi başına
  for(const id of al){const k=eff(id);const r=g.roles[id];if(!ok(id))continue;
    if(r.team==='imp'&&tgt(id,'kill'))attacks.push({v:tgt(id,'kill'),by:'Hain',ids:[id],cause:'stab'});
    if(k==='serikatil'&&tgt(id,'ab'))attacks.push({v:tgt(id,'ab'),by:'Seri Katil',ids:[id],cause:'stab'});
    if(k==='hirsiz'&&tgt(id,'ab'))attacks.push({v:tgt(id,'ab'),by:'Hırsız',ids:[id],thief:id,cause:'stab'});
    if(k==='bombaci'){if(tgt(id,'ab')){r.planted.push(tgt(id,'ab'));nt(id,nm(tgt(id,'ab'))+' evine dinamit koydun.')}
      if(A(id).det){const hs=[...new Set(r.planted)].filter(alive);hs.forEach(v=>{attacks.push({v,by:'Bombacı',ids:[id],cause:'bomb'});M.exploded.push(v)});r.planted=[];nt(id,hs.length?'Dinamitleri patlattın!':'Patlatacak dinamit yoktu.')}}
    if(k==='buyucu'&&tgt(id,'ab')&&A(id).guess&&has(ROLES,A(id).guess)){const t=tgt(id,'ab');const real=g.roles[t].key;
      if(A(id).guess===real){attacks.push({v:t,by:'Büyücü',ids:[id],cause:'bolt',sure:true});M.lightning.push(t);nt(id,'Tahminin doğruydu: '+nm(t)+' = '+ROLES[real].n+'. Yıldırım gönderdin.')}
      else{attacks.push({v:id,by:'Büyü',ids:[],cause:'bolt',sure:true});M.lightning.push(id);nt(id,'Tahminin yanlıştı ('+nm(t)+' '+ROLES[A(id).guess].n+' değil). Yıldırım sana döndü.')}}
  }
  // hortlak intikamı
  if(g.haunt&&g.haunt.night===P.day&&alive(g.haunt.t)){attacks.push({v:g.haunt.t,by:'Hortlak',ids:[],cause:'ghost',sure:true});M.haunted.push(g.haunt.t)}
  g.haunt=null;
  const died=[],causes={};
  for(const at of attacks){if(!alive(at.v)||died.includes(at.v)){at.ids.forEach(i=>nt(i,nm(at.v)+' zaten ölmüştü.'));continue}
    if(!at.sure&&heals.has(at.v)){nt(at.v,'Saldırıya uğradın ama Doktor seni kurtardı!');for(const id of al)if(eff(id)==='doktor'&&tgt(id,'ab')===at.v)nt(id,nm(at.v)+' saldırıya uğradı, onu kurtardın!');at.ids.forEach(i=>nt(i,nm(at.v)+' saldırınızdan kurtuldu.'));if(!M.saved.includes(at.v))M.saved.push(at.v);continue}
    if(!at.sure&&vested.has(at.v)){nt(at.v,'Saldırıya uğradın, yelek seni kurtardı.');at.ids.forEach(i=>nt(i,nm(at.v)+' saldırınızdan kurtuldu.'));continue}
    died.push(at.v);causes[at.v]=at.cause;at.ids.forEach(i=>nt(i,nm(at.v)+' öldürüldü.'));
    if(at.thief){const vr=g.roles[at.v];const nr=vr.mad?{key:'masum',team:'inn'}:{key:vr.key,team:vr.team};g.roles[at.thief].orig='hirsiz';g.roles[at.thief].key=nr.key;g.roles[at.thief].team=nr.team;g.roles[at.thief].uses={};nt(at.thief,nm(at.v)+' rolünü çaldın: artık '+roleLabel(nr)+' olarak oynuyorsun.');causes[at.v]='vanish'}
  }
  // 6) bilgi rolleri
  // deli de dahil: tutulan ya da tuzağa yakalanan bilgi alamaz (yoksa deli olduğunu anlar)
  for(const id of al){const r=g.roles[id];const k=eff(id);const t=tgt(id,'ab');const bk=r.mad||k;if(!t||!bk||!ok(id))continue;
    if(bk==='polis'&&r.mad)nt(id,nm(t)+' bu gece evden çıkamadı.');
    if(bk==='gozcu'){const n=r.mad?Math.floor(Math.random()*3):visits[t].length;nt(id,nm(t)+' evine bu gece '+n+' kişi geldi.')}
    if(bk==='izci'){let w;if(r.mad){const o=al.filter(x=>x!==t&&x!==id);w=Math.random()<.4?null:o[Math.floor(Math.random()*o.length)]}else w=went[t]||null;nt(id,w?nm(t)+' gece '+nm(w)+' evine gitti.':nm(t)+' gece evinden çıkmadı.')}
    if(bk==='dedektif'){const sk=r.mad?INVGROUPS[Math.floor(Math.random()*INVGROUPS.length)]:INVGROUPS.find(gp=>gp.includes(shownRole(R,t).key))||INVGROUPS[4];nt(id,nm(t)+' şunlardan biri: '+sk.map(x=>ROLES[x].n).join(' / '))}
    if(bk==='ispiyoncu'&&!r.uses.ispiyoncu&&!died.includes(id)){r.uses.ispiyoncu=true;const sr=r.mad?{key:MADPOOL[Math.floor(Math.random()*MADPOOL.length)],team:'inn'}:shownRole(R,t);M.snitch.push({by:id,t,role:roleLabel(sr)});nt(id,nm(t)+' rolünü sabah meydanda açıkladın.')}
    if(bk==='provokator'&&!r.uses.provokator){r.uses.provokator=true;if(r.mad)r.fakeProvoked={t,day:P.day};else g.provoke={t,day:P.day};nt(id,nm(t)+' yarınki oylamaya 2 oyla başlayacak.')}
    if(k==='temizlikci'&&died.includes(t))g.clean=t;
    if(k==='suclayici')g.blame={t,day:P.day};
    if(k==='hortlak'){g.candle[id]=t;nt(id,nm(t)+' kapısına mum koydun.')}
  }
  // 7) ölümler
  for(const v of died){pl(R,v).alive=false;let shown=roleLabel(shownRole(R,v));if(g.clean===v)shown='? (rolü gizlendi)';else if(g.blame&&g.blame.t===v)shown='Hain';P.dead.push({id:v,role:shown});M.deaths.push({id:v,role:shown,cause:causes[v]});M.news.push(causes[v]==='vanish'?'🎭 '+nm(v)+' kayboldu. Rolü: '+shown:'💀 '+nm(v)+' gece öldü. Rolü: '+shown)}
  M.saved=M.saved.filter(v=>!died.includes(v));M.saved.forEach(v=>M.news.push('🛡️ '+nm(v)+' saldırıya uğradı, Doktor kurtardı.'));
  M.snitch.forEach(s=>M.news.push('📣 '+nm(s.by)+' (İspiyoncu) açıkladı: '+nm(s.t)+' = '+s.role));
  if(!died.length&&!M.saved.length)M.news.push('🌅 Sakin bir gece. Kimse ölmedi.');
  g.clean=null;
  sysChat(R,'— Gündüz '+P.day+' —');M.news.forEach(n=>sysChat(R,n));
  P.morning=M;
  if(checkWin(R))return;setPhase(R,'talk');
}
function resolveVote(R){
  const P=R.P,g=R.g,tally={};const al=alivePlayers(R);const nm=id=>nameOf(R,id);
  let skip=0;for(const p of al){const t=g.votes[p.id];if(t==='skip'||!t)skip++;else tally[t]=(tally[t]||0)+1}
  if(g.provoke&&g.provoke.day===P.day&&pl(R,g.provoke.t)&&pl(R,g.provoke.t).alive)tally[g.provoke.t]=(tally[g.provoke.t]||0)+2;
  const sorted=Object.keys(tally).sort((a,b)=>tally[b]-tally[a]);
  let out=null;if(sorted.length&&(sorted.length===1||tally[sorted[0]]>tally[sorted[1]])&&tally[sorted[0]]>=2)out=sorted[0];
  const E={out:null,summary:''};
  if(out){pl(R,out).alive=false;let shown=roleLabel(shownRole(R,out));if(g.blame&&g.blame.day===P.day&&g.blame.t===out)shown='Hain';P.dead.push({id:out,role:shown});E.out={id:out,role:shown};sysChat(R,'⚖️ Kasaba '+nm(out)+' kişisini gönderdi. Rolü: '+shown);
    if(g.roles[out].key==='hortlak'){g.hauntWins.push(out);const t=g.candle[out];if(t&&pl(R,t)&&pl(R,t).alive){g.haunt={t,night:P.day+1};note(R,out,'Asıldın! Bu gece '+nm(t)+' evine hayalet olarak gideceksin.')}else note(R,out,'Asıldın, kazandın! Mum koyduğun bir ev yoktu.')}}
  else sysChat(R,'⚖️ Oylar yetersiz, kimse gönderilmedi.');
  E.summary=Object.keys(tally).sort((a,b)=>tally[b]-tally[a]).map(id=>nm(id)+' '+tally[id]).concat(skip?['çekimser '+skip]:[]).join(', ');
  if(E.summary)sysChat(R,'🗳️ Oylar: '+E.summary);
  g.provoke=null;g.blame=null;P.evening=E;
  if(checkWin(R))return;setPhase(R,'night');
}
function checkWin(R){
  const P=R.P,g=R.g;const al=alivePlayers(R).map(p=>p.id);
  const team=id=>g.roles[id].team,key=id=>g.roles[id].key;
  const imp=al.filter(id=>team(id)==='imp');const hostile=al.filter(id=>['serikatil','bombaci','hirsiz','buyucu'].includes(key(id)));
  const passive=al.filter(id=>['hayatta','hortlak'].includes(key(id)));const others=al.filter(id=>!imp.includes(id)&&!passive.includes(id)&&!hostile.includes(id));
  let w=null;
  if(!al.length)w={t:'Kimse kazanamadı',team:null};
  else if(!imp.length&&!hostile.length)w={t:'Masumlar kazandı!',team:'inn'};
  else if(!hostile.length&&imp.length&&imp.length>=others.length)w={t:'Hainler kazandı!',team:'imp'};
  else if(hostile.length===1&&!imp.length&&!others.length)w={t:ROLES[key(hostile[0])].n+' tek başına kazandı!',team:'neu',who:hostile[0]};
  if(!w)return false;
  P.phase='end';P.ends=null;
  P.winner={...w,survivors:al.filter(id=>key(id)==='hayatta').map(id=>nameOf(R,id)),haunters:g.hauntWins.map(id=>nameOf(R,id))};
  P.reveal=P.players.map(p=>({id:p.id,name:p.name,role:roleLabel(shownRole(R,p.id))+(g.roles[p.id].mad?' (aslında Deli)':g.roles[p.id].orig?' (Hırsız çaldı)':''),team:g.roles[p.id].mad?'inn':g.roles[p.id].team,alive:p.alive}));
  return true;
}
function endToLobby(R){R.g=null;R.P=lobbyState()}

// ---------- Oyuncu eylemleri (sunucu doğrular) ----------
const sid=v=>typeof v==='string'&&v.length<=24?v:null;
// gece hamlesi: {kill, ab, guess, det, d?}
function act(R,id,m){
  const P=R.P;if(!R.g||P.phase!=='night')return false;const me=pl(R,id);if(!me||!me.alive)return false;
  if(m.d!=null&&m.d!==P.day)return false;
  const target=v=>{v=sid(v);return v&&pl(R,v)?v:null};
  R.g.acts[id]={kill:target(m.kill),ab:m.ab==='self'?'self':target(m.ab),guess:typeof m.guess==='string'&&has(ROLES,m.guess)?m.guess:null,det:!!m.det};
  return true;
}
// oy: 'skip' ya da yaşayan bir oyuncu. Herkes oy verince faz kendiliğinden geçer.
function vote(R,id,v,d){
  const P=R.P;if(!R.g||P.phase!=='vote')return false;const me=pl(R,id);if(!me||!me.alive)return false;
  if(d!=null&&d!==P.day)return false;
  v=sid(v);if(v!=='skip'){const t=v&&pl(R,v);if(!t||!t.alive)return false}
  R.g.votes[id]=v;P.voted=Object.keys(R.g.votes);
  if(alivePlayers(R).every(p=>R.g.votes[p.id]!==undefined))advance(R);
  return true;
}
function chat(R,id,x){
  const P=R.P;if(!R.g)return false;const me=pl(R,id);if(!me||!me.alive||(P.phase!=='talk'&&P.phase!=='vote'))return false;
  const t=String(x==null?'':x).slice(0,240);if(!t.trim())return false;
  pushChat(R,{id,t,d:P.day,ts:clock()});return true;
}
function deadChat(R,id,x){
  if(!R.g)return false;const me=pl(R,id);if(!me||me.alive)return false;
  const t=String(x==null?'':x).slice(0,240);if(!t.trim())return false;
  R.g.dchat.push({id,t});if(R.g.dchat.length>80)R.g.dchat.shift();return true;
}

// Kişiye özel paket (yalnız o oyuncuya gider). Oyunda değilse boş paket.
const EMPTY_PRIV={role:null,notes:[],mates:[],dchat:[]};
function privFor(R,id){
  const g=R.g;if(!g||!g.roles[id])return EMPTY_PRIV;const P=R.P;const r=g.roles[id];const sr=r.mad?{key:r.mad,team:'inn'}:{key:r.key,team:r.team};
  const me=pl(R,id);
  return{role:{key:sr.key,team:sr.team,label:roleLabel(sr),desc:ROLES[sr.key].desc,ico:ROLES[sr.key].ico},
    mates:r.team==='imp'?Object.keys(g.roles).filter(x=>g.roles[x].team==='imp'&&x!==id):[],
    notes:g.notes[id]||[],dchat:me&&!me.alive?g.dchat:[],
    fakeProvoked:r.fakeProvoked&&r.fakeProvoked.day===P.day&&P.phase==='vote'?r.fakeProvoked.t:null,
    uses:r.uses,vest:r.vest,planted:r.planted.length,candle:g.candle[id]||null};
}

return{ROLES,SETUP,COLORS,HATS,DEFAULT_SETTINGS,roleLabel,autoSetup,cleanSettings,setClock,
  lobbyState,createGame,startGame,setPhase,advance,tick,resolveNight,resolveVote,checkWin,endToLobby,
  act,vote,chat,deadChat,privFor,pl,alivePlayers,inGame};
});
