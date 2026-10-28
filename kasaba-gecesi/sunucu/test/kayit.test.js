'use strict';
// kayit.js: profil upsert'i PostgREST'e (taklit HTTP sunucusu) gider; ayarsızken hiç istek yok; hata oyunu etkilemez.
const test=require('node:test');const assert=require('node:assert');const http=require('http');
const Kayit=require('../kayit.js');
const bekle=ms=>new Promise(r=>setTimeout(r,ms));
const kadar=async(f,ms=3000)=>{const t0=Date.now();while(!f()&&Date.now()-t0<ms)await bekle(25)}; // yerel fetch ilk bağlantıda ~400 ms sürebilir
function taklit(durum=201){const istekler=[];const s=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{istekler.push({yol:req.url,yontem:req.method,basliklar:req.headers,govde:b?JSON.parse(b):null});res.writeHead(durum);res.end()})});
  return new Promise(r=>s.listen(0,'127.0.0.1',()=>r({s,istekler,url:'http://127.0.0.1:'+s.address().port,kapat:()=>new Promise(x=>s.close(x))})))}

test('profil: tek upsert isteği, servis anahtarı ve merge-duplicates; aynı üye için art arda çağrılar tek istek (son değer)',async()=>{
  const t=await taklit();const k=Kayit.olustur({url:t.url,serviceKey:'srv-key',bekleMs:150,quiet:true});
  try{
    k.profil('u1',{ad:'Ece',renk:'#fff',sapka:'cap'});k.profil('u1',{ad:'Ece2',renk:'#000',sapka:'none'});
    await kadar(()=>k.sayac.profil+k.sayac.hata>=1);
    const pr=t.istekler.filter(x=>x.yol==='/rest/v1/profiller');assert.strictEqual(pr.length,1);const r=pr[0]; // açılış temizliği (PATCH oyunlar) ayrı
    assert.strictEqual(r.yol,'/rest/v1/profiller');assert.strictEqual(r.yontem,'POST');
    assert.strictEqual(r.basliklar.apikey,'srv-key');assert.strictEqual(r.basliklar.authorization,'Bearer srv-key');
    assert.match(r.basliklar.prefer,/resolution=merge-duplicates/);assert.match(r.basliklar['content-type'],/application\/json/);
    assert.deepStrictEqual({uye:r.govde.uye,ad:r.govde.ad,renk:r.govde.renk,sapka:r.govde.sapka},{uye:'u1',ad:'Ece2',renk:'#000',sapka:'none'});assert.ok(r.govde.guncellenme);
    assert.strictEqual(k.sayac.profil,1);assert.strictEqual(k.sayac.hata,0);
  }finally{k.kapat();await t.kapat()}
});
test('profil: sunucu hatası sayılır, fırlatmaz; ayarsızken istek yok; kapat bekleyeni iptal eder',async()=>{
  const t=await taklit(500);const k=Kayit.olustur({url:t.url,serviceKey:'srv-key',bekleMs:50,quiet:true});
  try{k.profil('u2',{ad:'X'});await kadar(()=>k.sayac.profil+k.sayac.hata>=1&&t.istekler.some(x=>x.yol==='/rest/v1/profiller'));assert.strictEqual(t.istekler.filter(x=>x.yol==='/rest/v1/profiller').length,1);assert.ok(k.sayac.hata>=1)}finally{k.kapat();await t.kapat()}
  const k2=Kayit.olustur({quiet:true});k2.profil('u3',{ad:'Y'});await bekle(100);assert.strictEqual(k2.sayac.profil,0);k2.kapat();
  const t2=await taklit();const k3=Kayit.olustur({url:t2.url,serviceKey:'s',bekleMs:200,quiet:true});k3.profil('u4',{ad:'Z'});k3.kapat();await bekle(800);assert.strictEqual(t2.istekler.filter(x=>x.yol==='/rest/v1/profiller').length,0,'kapat bekleyen upsert\'i iptal eder');await t2.kapat();
});

// ---------- Plan 4: maç ve olay yazımı ----------
const {taklitRest}=require('./taklit-rest.js');
const UUID=['aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000003'];
function oda(uyeler,hostPub='p0'){return {code:'odakodu12345',hostId:hostPub,members:new Map(Object.entries(uyeler).map(([p,u])=>[p,{uye:u,name:'Ad'+p}])),game:{P:{}}}}
const OYUN='11111111-2222-4333-8444-555555555555';
const olay=(sira,tur,veri,gun=1,faz='night',oyunId=OYUN)=>({sira,gun,faz,tur,veri,oyun:123,oyunId});
const baslangic=(oyunId=OYUN)=>olay(1,'baslangic',{ayarlar:{night:30,talk:120,vote:45},roller:[],oyuncular:[{id:'p0',ad:'Ece',renk:'#1',sapka:'cap'},{id:'p1',ad:'Can',renk:'#2',sapka:'bow'},{id:'p2',ad:'Mis',renk:'#3',sapka:'none'},{id:'p3',ad:'Mis2',renk:'#4',sapka:'none'},{id:'p4',ad:'Kaya',renk:'#5',sapka:'ears'}]},1,'night',oyunId);
const bitis=(oyunId=OYUN)=>olay(9,'bitis',{kazanan:'inn',kazanan_metin:'Masumlar kazandı!',kazananlar:['p1','p2','p3','p4'],oyuncular:[{id:'p0',rol_key:'hain',takim:'imp',deli_gibi:null,calinan_rol:null,sag:false,olum_gunu:1,olum_sekli:'asildi'},{id:'p1',rol_key:'doktor',takim:'inn',deli_gibi:null,calinan_rol:null,sag:true,olum_gunu:null,olum_sekli:null},{id:'p2',rol_key:'masum',takim:'inn',deli_gibi:null,calinan_rol:null,sag:true,olum_gunu:null,olum_sekli:null},{id:'p3',rol_key:'masum',takim:'inn',deli_gibi:null,calinan_rol:null,sag:true,olum_gunu:null,olum_sekli:null},{id:'p4',rol_key:'deli',takim:'inn',deli_gibi:'polis',calinan_rol:null,sag:true,olum_gunu:null,olum_sekli:null}]},1,'vote',oyunId);

test('kayıt: kayıtlı ev sahibi → kasaba kurulur, üyeler, oyun, oyuncular; olaylar toplu; bitişte güncellemeler; ikinci maçta kasaba yeniden kurulmaz',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true,deneme:[20,20,20]});
  const r=oda({p0:UUID[0],p1:UUID[1],p2:null,p3:null,p4:UUID[2]});
  try{
    k.kuyrukla(r,[baslangic()]);await kadar(()=>t.T.olaylar.length===1,5000);
    const sira=t.istekler.filter(x=>x.tablo!=='olaylar'&&!(x.tablo==='oyunlar'&&x.yontem==='PATCH')).map(x=>x.yontem+' '+x.tablo);
    assert.deepStrictEqual(sira.slice(-5),['GET kasabalar','POST kasabalar','POST kasaba_uyeleri','POST oyunlar','POST oyun_oyunculari'],sira.join(' | '));
    assert.deepStrictEqual(t.T.kasabalar.map(x=>({ad:x.ad,sahip:x.sahip})),[{ad:"Ece'nin Kasabası",sahip:UUID[0]}]);
    assert.deepStrictEqual(t.T.kasaba_uyeleri.map(x=>[x.uye,x.rol]).sort(),[[UUID[0],'sahip'],[UUID[1],'uye'],[UUID[2],'uye']]);
    const o=t.T.oyunlar[0];assert.deepStrictEqual({id:o.id,kasaba_id:o.kasaba_id,kurulum:o.kurulum,oda_kodu:o.oda_kodu,sonuc:o.sonuc,oyuncu_sayisi:o.oyuncu_sayisi},{id:OYUN,kasaba_id:'kasaba-1',kurulum:'kasaba-test',oda_kodu:'odakodu12345',sonuc:'devam',oyuncu_sayisi:5});assert.ok(o.baslama&&o.ayarlar.night===30);
    assert.deepStrictEqual(t.T.oyun_oyunculari.map(x=>[x.pub_id,x.uye,x.ad]).sort(),[['p0',UUID[0],'Ece'],['p1',UUID[1],'Can'],['p2',null,'Mis'],['p3',null,'Mis2'],['p4',UUID[2],'Kaya']]);
    assert.strictEqual(t.T.olaylar.length,1,'baslangic olayı da olaylar tablosuna');
    k.kuyrukla(r,[olay(2,'gece_hamle',{kim:'p0',tur:'kill',hedef:'p2'}),olay(3,'gece_sonuc',{olenler:[]})]);await kadar(()=>t.T.olaylar.length===3,5000);
    assert.deepStrictEqual(t.T.olaylar.map(x=>[x.oyun_id,x.sira,x.tur,x.gun,x.faz]),[[OYUN,1,'baslangic',1,'night'],[OYUN,2,'gece_hamle',1,'night'],[OYUN,3,'gece_sonuc',1,'night']]);
    assert.deepStrictEqual(t.T.olaylar[1].veri,{kim:'p0',tur:'kill',hedef:'p2'});
    k.kuyrukla(r,[bitis()]);await kadar(()=>t.T.oyunlar[0].sonuc==='bitti'&&t.T.oyun_oyunculari.every(x=>x.rol_key),5000);
    assert.deepStrictEqual({sonuc:o.sonuc,kazanan_takim:o.kazanan_takim,kazanan_metin:o.kazanan_metin,bitisVar:!!o.bitis},{sonuc:'bitti',kazanan_takim:'inn',kazanan_metin:'Masumlar kazandı!',bitisVar:true});
    const p4=t.T.oyun_oyunculari.find(x=>x.pub_id==='p4');assert.deepStrictEqual([p4.rol_key,p4.takim,p4.deli_gibi,p4.sonunda_sag,p4.olum_gunu],['deli','inn','polis',true,null]);
    const p0=t.T.oyun_oyunculari.find(x=>x.pub_id==='p0');assert.deepStrictEqual([p0.sonunda_sag,p0.olum_gunu,p0.olum_sekli],[false,1,'asildi']);
    // ikinci maç: kasaba var → POST kasabalar yok; aynı kasaba_id
    const n=t.istekler.length;const OYUN2='22222222-2222-4333-8444-555555555555';k.kuyrukla(r,[baslangic(OYUN2)]);await kadar(()=>t.T.oyunlar.length===2,5000);
    assert.ok(!t.istekler.slice(n).some(x=>x.yontem==='POST'&&x.tablo==='kasabalar'));assert.strictEqual(t.T.oyunlar[1].kasaba_id,'kasaba-1');
    assert.strictEqual(k.sayac.hata,0);assert.ok(k.sayac.yazilan>0);
  }finally{k.kapat();await t.kapat()}
});

test('kayıt: misafir ev sahibi → o maç için hiçbir istek yok; iptal → sonuc iptal',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'t',quiet:true,deneme:[20]});
  try{
    await kadar(()=>t.istekler.length>=1);const n0=t.istekler.length; // açılış temizliği geçsin
    const r=oda({p0:null,p1:UUID[1],p2:null,p3:null,p4:null});
    k.kuyrukla(r,[baslangic()]);k.kuyrukla(r,[olay(2,'gece_sonuc',{olenler:[]})]);await bekle(600);
    assert.strictEqual(t.istekler.length,n0,'misafir ev sahibi: istek yok');assert.strictEqual(k.sayac.atlanan,1,'atlanan maç sayısı');
    const r2=oda({p0:UUID[0],p1:null,p2:null,p3:null,p4:null});const OYUN3='33333333-2222-4333-8444-555555555555';
    k.kuyrukla(r2,[baslangic(OYUN3),olay(2,'iptal',{gun:1,faz:'talk'},1,'talk',OYUN3)]);await kadar(()=>t.T.oyunlar.length===1&&t.T.oyunlar[0].sonuc==='iptal',5000);
    assert.ok(t.T.oyunlar[0].bitis);assert.ok(t.T.oyun_oyunculari.every(x=>x.rol_key==null),'iptalde rol alanları null kalır');
  }finally{k.kapat();await t.kapat()}
});

test('kayıt: 5xx yeniden denenir ve sıra korunur; 4xx düşer ve kuyruk ilerler; açılışta eski devam oyunları iptal; kapat durdurur',async()=>{
  const t=await taklitRest();t.T.oyunlar.push({id:'eski',kurulum:'t',sonuc:'devam',baslama:'2000-01-01T00:00:00.000Z'},{id:'yeni',kurulum:'t',sonuc:'devam',baslama:new Date().toISOString()},{id:'baska',kurulum:'canli',sonuc:'devam',baslama:'2000-01-01T00:00:00.000Z'});
  let sayilan=0;t.hataAyarla(x=>{if(x.tablo==='olaylar'&&x.yontem==='POST'&&sayilan++<2)return 503;if(x.tablo==='olaylar'&&x.govde&&x.govde.some(o=>o.sira===4))return 400;return null});
  const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'t',quiet:true,deneme:[30,30,30]});
  try{
    await kadar(()=>t.istekler.some(x=>x.tablo==='oyunlar'&&x.yontem==='PATCH'),5000);
    assert.strictEqual(t.T.oyunlar[0].sonuc,'iptal','3 saatten eski devam iptal');assert.strictEqual(t.T.oyunlar[1].sonuc,'devam','yeni devam kalır');assert.strictEqual(t.T.oyunlar[2].sonuc,'devam','başka kurulumun oyununa dokunulmaz');
    const r=oda({p0:UUID[0]});k.kuyrukla(r,[baslangic()]);k.kuyrukla(r,[olay(2,'a',{}),olay(3,'b',{})]);k.kuyrukla(r,[olay(4,'c',{})]);k.kuyrukla(r,[olay(5,'d',{})]);
    await kadar(()=>t.T.olaylar.some(o=>o.sira===5),8000);
    assert.deepStrictEqual(t.T.olaylar.map(o=>o.sira),[1,2,3,5],'2-3 yeniden denendikten sonra sırada; 4 (400) düştü; 5 geçti');
    assert.ok(k.sayac.hata>=2);assert.strictEqual(k.sayac.dusen,1);
    k.kapat();const n=t.istekler.length;k.kuyrukla(r,[olay(6,'e',{})]);await bekle(300);assert.strictEqual(t.istekler.length,n,'kapat sonrası istek yok');
  }finally{k.kapat();await t.kapat()}
});

test('kayıt: kuyruk 10 000 olayı aşınca en eski düşer',async()=>{
  const k=Kayit.olustur({url:'http://127.0.0.1:1',serviceKey:'srv',kurulum:'t',quiet:true,deneme:[60000],kuyrukSinir:50});
  try{const r=oda({p0:UUID[0]});k.kuyrukla(r,[baslangic()]);for(let i=2;i<=60;i++)k.kuyrukla(r,[olay(i,'x',{})]);
    assert.ok(k.sayac.kuyruk<=50,'kuyruk sınırı: '+k.sayac.kuyruk);assert.ok(k.sayac.dusen>=10)}finally{k.kapat()}
});

test('inceleme: başlangıç 4xx ile düşerse maç atlanır (sonraki olaylar için istek yok); 4xx tek olayı düşürür, demetin kalanı yazılır; 401 yeniden denenir',async()=>{
  const t=await taklitRest();let durum={};t.hataAyarla(x=>durum[x.yontem+' '+x.tablo+' '+(x.govde&&x.govde[0]?x.govde[0].sira:'')]||durum[x.yontem+' '+x.tablo]||null);
  const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'t',quiet:true,deneme:[30,30,30]});
  try{
    await kadar(()=>t.istekler.length>=1);
    // (a) başlangıçta oyunlar POST 409 → maç atlanır; sonraki olaylar hiç istek üretmez
    durum={'POST oyunlar':409};const r=oda({p0:UUID[0]});k.kuyrukla(r,[baslangic()]);await kadar(()=>k.sayac.dusen>=1);
    const n=t.istekler.length;k.kuyrukla(r,[olay(2,'gece_sonuc',{olenler:[]}),bitis()]);await bekle(400);
    assert.strictEqual(t.istekler.length,n,'atlanan maç için istek yok');assert.strictEqual(k.sayac.atlanan,1);
    // (b) aynı demette: sira 2 → 400 (düşer), sira 3 yazılır
    durum={'POST olaylar 2':400};const OY='66666666-2222-4333-8444-555555555555';const r2=oda({p0:UUID[1]});
    k.kuyrukla(r2,[baslangic(OY),olay(2,'a',{},1,'night',OY),olay(3,'b',{},1,'night',OY)]);await kadar(()=>t.T.olaylar.some(o=>o.oyun_id===OY&&o.sira===3));
    assert.deepStrictEqual(t.T.olaylar.filter(o=>o.oyun_id===OY).map(o=>o.sira),[1,3]);assert.strictEqual(k.sayac.dusen,2);
    // (c) 401: kalıcı değil, yeniden denenir ve sonunda yazılır
    let sayi=0;t.hataAyarla(x=>x.yontem==='POST'&&x.tablo==='olaylar'&&x.govde[0].sira===4&&sayi++<2?401:null);
    k.kuyrukla(r2,[olay(4,'c',{},1,'night',OY)]);await kadar(()=>t.T.olaylar.some(o=>o.oyun_id===OY&&o.sira===4),5000);
    assert.strictEqual(k.sayac.dusen,2,'401 düşürmez');assert.ok(sayi>=2);
    // (d) baslama maçın gerçek başlangıcı (gameId = ms), bitis olay zamanı
    const oy=t.T.oyunlar.find(o=>o.id===OY);assert.strictEqual(oy.baslama,new Date(123).toISOString());
  }finally{k.kapat();await t.kapat()}
});

// ---------- Geri bildirim paketi: rol geçmişi tohumu (sonRoller) ----------
test('sonRoller: bu kurulumdaki son 5 bitmiş maç, en yeni önde; Hırsız başlangıç rolü; devam/başka kurulum dışarıda',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true});
  try{
    const roller=['doktor','polis','gozcu','izci','hain','dedektif','masum'];
    for(let i=0;i<7;i++){t.T.oyunlar.push({id:'g'+i,kurulum:'kasaba-test',sonuc:'bitti',bitis:'2026-10-25T10:0'+i+':00Z'});
      t.T.oyun_oyunculari.push({oyun_id:'g'+i,pub_id:'p',uye:'u1',rol_key:i===6?'polis':roller[i],takim:roller[i]==='hain'?'imp':'inn',calinan_rol:i===6?'polis':null})}
    t.T.oyunlar.push({id:'devam',kurulum:'kasaba-test',sonuc:'devam',bitis:null});t.T.oyun_oyunculari.push({oyun_id:'devam',pub_id:'p',uye:'u1',rol_key:null,takim:null});
    t.T.oyunlar.push({id:'baska',kurulum:'kasaba',sonuc:'bitti',bitis:'2026-10-25T12:00:00Z'});t.T.oyun_oyunculari.push({oyun_id:'baska',pub_id:'p',uye:'u1',rol_key:'deli',takim:'inn'});
    const h=await k.sonRoller('u1');
    assert.deepStrictEqual(h,[{key:'hirsiz',team:'neu'},{key:'dedektif',team:'inn'},{key:'hain',team:'imp'},{key:'izci',team:'inn'},{key:'gozcu',team:'inn'}],'Hırsız başlangıç rolü ve takımı (neu)');
    const r=t.istekler.find(x=>x.tablo==='oyun_oyunculari'&&x.yontem==='GET');assert.ok(r,'GET isteği');
    assert.match(r.yol,/uye=eq\.u1/);assert.match(r.yol,/oyunlar\.kurulum=eq\.kasaba-test/);assert.match(r.yol,/oyunlar\.sonuc=eq\.bitti/);assert.match(r.yol,/limit=5/);
    assert.strictEqual(k.sayac.gecmisOkunan,1);assert.strictEqual(k.sayac.gecmisHata,0);
    assert.deepStrictEqual(await k.sonRoller('kimse'),[],'geçmişi olmayan → boş liste');
  }finally{k.kapat();await t.kapat()}
});
test('sonRoller: sunucu hatası, zaman aşımı ve ayarsız kurulum → null, sayaç',async()=>{
  const t=await taklitRest();
  try{
    t.hataAyarla(()=>500);const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true});
    assert.strictEqual(await k.sonRoller('u1'),null);assert.strictEqual(k.sayac.gecmisHata,1);k.kapat();
    t.hataAyarla(()=>null);t.gecikmeAyarla(300);const k2=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true,zamanAsimiMs:100});
    assert.strictEqual(await k2.sonRoller('u1'),null,'zaman aşımı');assert.strictEqual(k2.sayac.gecmisHata,1);k2.kapat();t.gecikmeAyarla(0);
    await kadar(()=>t.istekler.filter(x=>x.tablo==='oyun_oyunculari').length>=2); // gecikmeli istek taklitte yanıt anında kaydedilir
    const k3=Kayit.olustur({quiet:true});assert.strictEqual(await k3.sonRoller('u1'),null);await bekle(50);assert.strictEqual(t.istekler.filter(x=>x.tablo==='oyun_oyunculari').length,2,'ayarsızken istek yok');k3.kapat();
  }finally{await t.kapat()}
});

// ---------- Ertelenen küçükler 1 / Task 4 ----------
const G=require('../game.js');
test('profil: aynı {ad,renk,sapka} yeniden yazılmaz; değişince yazılır',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',bekleMs:30,quiet:true});
  try{
    k.profil('u1',{ad:'Ece',renk:'#fff',sapka:'cap'});await kadar(()=>k.sayac.profil===1);
    k.profil('u1',{ad:'Ece',renk:'#fff',sapka:'cap'});await bekle(120);assert.strictEqual(t.istekler.filter(x=>x.tablo==='profiller').length,1,'aynı profil tekrar yazılmaz');
    k.profil('u1',{ad:'Ece2',renk:'#fff',sapka:'cap'});await kadar(()=>k.sayac.profil===2);assert.strictEqual(t.istekler.filter(x=>x.tablo==='profiller').length,2);
  }finally{k.kapat();await t.kapat()}
});
test('yazilan sayacı gerçek yazma isteklerini sayar; kapat() süren işi bekler; sonRoller limit TEKRAR.gecmisUz',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true,deneme:[20,20,20]});
  const r=oda({p0:UUID[0],p1:UUID[1],p2:null,p3:null,p4:UUID[2]});
  try{
    k.kuyrukla(r,[baslangic()]);await kadar(()=>t.T.olaylar.length===1,5000);
    const yazma=()=>t.istekler.filter(x=>x.yontem!=='GET'&&!(x.tablo==='oyunlar'&&x.yontem==='PATCH'&&/sonuc=eq\.devam/.test(x.yol))).length;
    assert.strictEqual(k.sayac.yazilan,yazma(),'başlangıç: kasaba, üyeler, oyun, oyuncular, olay = 5');assert.strictEqual(yazma(),5);
    k.kuyrukla(r,[bitis()]);await kadar(()=>t.T.oyunlar[0].sonuc==='bitti'&&t.T.oyun_oyunculari.every(x=>x.rol_key),5000);
    assert.strictEqual(k.sayac.yazilan,yazma(),'bitiş: olay + oyun + 5 oyuncu');
    const eski=G.TEKRAR.gecmisUz;G.TEKRAR.gecmisUz=3;try{await k.sonRoller(UUID[0]);const g=t.istekler.filter(x=>x.tablo==='oyun_oyunculari'&&x.yontem==='GET').pop();assert.match(g.yol,/limit=3/,'limit TEKRAR.gecmisUz')}finally{G.TEKRAR.gecmisUz=eski}
  }finally{await k.kapat();await t.kapat()}
  // kapat: süren iş tamamlanır
  const t2=await taklitRest();t2.gecikmeAyarla(250);const k2=Kayit.olustur({url:t2.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true,deneme:[20,20,20]});
  try{
    k2.kuyrukla(oda({p0:UUID[0]}),[baslangic()]);await bekle(50);
    const sonuc=k2.kapat();assert.ok(sonuc&&typeof sonuc.then==='function','kapat promise döner');await sonuc;
    assert.ok(t2.istekler.some(x=>x.tablo==='oyunlar'&&x.yontem==='POST'),'kapat süren maç başlangıcını bekledi');
  }finally{t2.gecikmeAyarla(0);await t2.kapat()}
});

// ---------- taze inceleme düzeltmeleri (kucukler-1) ----------
test('profil: A→B→A sırasında bekleyen B iptal edilir; yalnız A yazılır',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',bekleMs:150,quiet:true});
  try{
    const A={ad:'Ece',renk:'#fff',sapka:'cap'},B={ad:'Ece',renk:'#000',sapka:'cap'};
    k.profil('u1',A);await kadar(()=>k.sayac.profil===1);
    k.profil('u1',B);k.profil('u1',A);await bekle(400);
    const pr=t.istekler.filter(x=>x.tablo==='profiller');assert.strictEqual(pr.length,1,'B yazılmamalı: '+JSON.stringify(pr.map(x=>x.govde.renk)));
  }finally{await k.kapat();await t.kapat()}
});
test('kapat(): kuyruktaki kalan olaylar (bitiş dahil) 3 sn içinde yazılır; yeni iş kabul edilmez',async()=>{
  const t=await taklitRest();t.gecikmeAyarla(60);const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true,deneme:[20,20,20]});
  const r=oda({p0:UUID[0],p1:UUID[1],p2:null,p3:null,p4:UUID[2]});
  try{
    k.kuyrukla(r,[baslangic()]);await kadar(()=>t.T.olaylar.length===1,5000);
    k.kuyrukla(r,[olay(2,'gece_sonuc',{olenler:[]}),bitis()]);await bekle(30);
    const p=k.kapat();k.kuyrukla(r,[olay(10,'hazir',{kim:'p0',v:true})]);await p; // kapanırken gelen iş alınmaz
    assert.strictEqual(t.T.oyunlar[0].sonuc,'bitti','bitiş kapanmadan önce yazıldı');assert.strictEqual(t.T.olaylar.length,3,'kalan olaylar yazıldı, kapanış sonrası iş alınmadı');
  }finally{t.gecikmeAyarla(0);await t.kapat()}
});

test('karışık demet: biten maçın bitişi + yeni maçın başlangıcı aynı demette; yeni maç 409 ile atlanır, bitiş yazılır',async()=>{
  const t=await taklitRest();let durum={};t.hataAyarla(x=>durum[x.yontem+' '+x.tablo+' '+(x.govde&&x.govde.id||'')]||null);
  const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'t',quiet:true,deneme:[30,30,30]});const r=oda({p0:UUID[0],p1:UUID[1]});
  try{
    k.kuyrukla(r,[baslangic()]);await kadar(()=>t.T.oyunlar.length===1,5000);
    const OYUN2='77777777-2222-4333-8444-555555555555';durum={['POST oyunlar '+OYUN2]:409};
    k.kuyrukla(r,[bitis(),baslangic(OYUN2),olay(2,'gece_hamle',{kim:'p0'},1,'night',OYUN2)]);
    await kadar(()=>t.T.oyunlar[0].sonuc==='bitti'&&k.sayac.atlanan===1,5000);
    assert.strictEqual(t.T.oyunlar[0].sonuc,'bitti','ilk maçın bitişi yazıldı');assert.strictEqual(t.T.oyunlar.length,1,'ikinci maç yazılmadı');
    await bekle(200);assert.ok(!t.T.olaylar.some(o=>o.oyun_id===OYUN2),'atlanan maçın olayı yok');assert.strictEqual(k.sayac.dusen,1,'yalnız baslangic düştü; atlanan maçın olayı istek üretmez');
  }finally{await k.kapat();await t.kapat()}
});

// ---------- İlerleme (Task 4): RPC çağrıları ----------
test('ilerleme RPC: envanterOku, macSonu, kozmetikAl doğru gövde ve anahtarla; hata ve ayarsız → null',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true});
  try{
    t.rpcAyarla('envanter_oku',g=>({yildiz:7,esyalar:{iksir:2},kozmetikler:['sapka:tac'],_uye:g.p_uye}));
    const e=await k.envanterOku(UUID[0]);assert.deepStrictEqual(e,{yildiz:7,esyalar:{iksir:2},kozmetikler:['sapka:tac'],_uye:UUID[0]});
    const m=await k.macSonu(UUID[0],'oyun-1',{odul:{tur:'esya',key:'fener',adet:1},rozetler:['kurtarici'],harcanan:'iksir',bonus:2,gunluk:5});
    assert.strictEqual(m.odul.key,'fener');assert.deepStrictEqual(m.yeni_rozetler,['kurtarici']);
    const r=t.istekler.find(x=>x.tablo==='rpc/mac_sonu');assert.deepStrictEqual(r.govde,{p_uye:UUID[0],p_oyun:'oyun-1',p_odul:{tur:'esya',key:'fener',adet:1},p_rozetler:['kurtarici'],p_harcanan:'iksir',p_bonus:2,p_gunluk:5,p_basari:null,p_seri_artis:0,p_seri_tavan:0,p_gorev:null,p_gorev_bonus:0});
    assert.deepStrictEqual(await k.kozmetikAl(UUID[0],'bayrak:mavi',12),{ok:true,yildiz:0});
    assert.deepStrictEqual(t.istekler.find(x=>x.tablo==='rpc/kozmetik_al').govde,{p_uye:UUID[0],p_key:'bayrak:mavi',p_fiyat:12});
    assert.strictEqual(k.sayac.kasa,1);assert.strictEqual(k.sayac.yazilan,0,'RPC yazilan sayacına girmez');
    t.hataAyarla(()=>500);assert.strictEqual(await k.envanterOku(UUID[0]),null);assert.strictEqual(await k.macSonu(UUID[0],'o2',{}),null);assert.strictEqual(k.sayac.ilerlemeHata,2);
  }finally{await k.kapat();await t.kapat()}
  const k2=Kayit.olustur({quiet:true});assert.strictEqual(await k2.envanterOku(UUID[0]),null);assert.strictEqual(await k2.macSonu(UUID[0],'o',{}),null);assert.strictEqual(await k2.kozmetikAl(UUID[0],'x',1),null);await k2.kapat();
});
test('ilerleme RPC: baglaOdulu gövdesi; ayarsız ve uyesiz → null',async()=>{
  const t=await taklitRest();const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'kasaba-test',quiet:true});
  try{t.rpcAyarla('bagla_odulu',g=>({ok:true,yildiz:25,_uye:g.p_uye}));
    assert.deepStrictEqual(await k.baglaOdulu(UUID[0]),{ok:true,yildiz:25,_uye:UUID[0]});assert.deepStrictEqual(t.istekler.find(x=>x.tablo==='rpc/bagla_odulu').govde,{p_uye:UUID[0]});
    assert.strictEqual(await k.baglaOdulu(null),null);
  }finally{await k.kapat();await t.kapat()}
  const k2=Kayit.olustur({quiet:true});assert.strictEqual(await k2.baglaOdulu(UUID[0]),null);await k2.kapat();
});
