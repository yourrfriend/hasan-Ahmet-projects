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
// Taklit PostgREST: tablo başına bellek; GET ?sahip=eq., POST (representation), PATCH ?id=eq.; t.hata(req) → durum kodu ile hata üretir
function taklitRest(){const T={kasabalar:[],kasaba_uyeleri:[],oyunlar:[],oyun_oyunculari:[],olaylar:[],profiller:[]};const istekler=[];let hata=()=>null;let sayac=0;
  const s=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
    const u=new URL(req.url,'http://x');const tablo=u.pathname.replace('/rest/v1/','');const govde=b?JSON.parse(b):null;
    const kayit={yol:req.url,tablo,yontem:req.method,prefer:req.headers.prefer||'',govde};istekler.push(kayit);
    const h=hata(kayit);if(h){res.writeHead(h);return res.end(JSON.stringify({message:'taklit hata '+h}))}
    const yaz=(d,kod=200)=>{res.writeHead(kod,{'Content-Type':'application/json'});res.end(JSON.stringify(d))};
    if(!T[tablo]){res.writeHead(404);return res.end()}
    if(req.method==='GET'){let rows=T[tablo];for(const [k,v] of u.searchParams)if(k!=='select'&&k!=='limit'&&v.startsWith('eq.'))rows=rows.filter(r=>String(r[k])===v.slice(3));return yaz(rows)}
    if(req.method==='POST'){const rows=Array.isArray(govde)?govde:[govde];const eklenen=[];for(const r of rows){const row={...r};if(tablo==='kasabalar'&&!row.id)row.id='kasaba-'+(++sayac);
        const anahtar=tablo==='oyunlar'?x=>x.id:tablo==='olaylar'?x=>x.oyun_id+'/'+x.sira:tablo==='oyun_oyunculari'?x=>x.oyun_id+'/'+x.pub_id:tablo==='kasaba_uyeleri'?x=>x.kasaba_id+'/'+x.uye:null;
        if(anahtar&&T[tablo].some(x=>anahtar(x)===anahtar(row))){if(/ignore-duplicates|merge-duplicates/.test(kayit.prefer))continue;res.writeHead(409);return res.end('{"message":"duplicate"}')}
        T[tablo].push(row);eklenen.push(row)}
      return yaz(/return=representation/.test(kayit.prefer)?eklenen:[],201)}
    if(req.method==='PATCH'){let n=0;for(const r of T[tablo]){let es=true;for(const [k,v] of u.searchParams)if(v.startsWith('eq.')&&String(r[k])!==v.slice(3))es=false;else if(v.startsWith('lt.')&&!(String(r[k])<v.slice(3)))es=false;if(es){Object.assign(r,govde);n++}}return yaz([],204)}
    res.writeHead(405);res.end()})});
  return new Promise(r=>s.listen(0,'127.0.0.1',()=>r({T,istekler,url:'http://127.0.0.1:'+s.address().port,hataAyarla:f=>{hata=f},kapat:()=>new Promise(x=>s.close(x))})))}
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
  const t=await taklitRest();t.T.oyunlar.push({id:'eski',sonuc:'devam',baslama:'2000-01-01T00:00:00.000Z'},{id:'yeni',sonuc:'devam',baslama:new Date().toISOString()});
  let sayilan=0;t.hataAyarla(x=>{if(x.tablo==='olaylar'&&x.yontem==='POST'&&sayilan++<2)return 503;if(x.tablo==='olaylar'&&x.govde&&x.govde.some(o=>o.sira===4))return 400;return null});
  const k=Kayit.olustur({url:t.url,serviceKey:'srv',kurulum:'t',quiet:true,deneme:[30,30,30]});
  try{
    await kadar(()=>t.istekler.some(x=>x.tablo==='oyunlar'&&x.yontem==='PATCH'),5000);
    assert.strictEqual(t.T.oyunlar[0].sonuc,'iptal','3 saatten eski devam iptal');assert.strictEqual(t.T.oyunlar[1].sonuc,'devam','yeni devam kalır');
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
