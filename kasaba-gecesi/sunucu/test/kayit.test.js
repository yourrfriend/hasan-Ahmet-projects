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
    assert.strictEqual(t.istekler.length,1);const r=t.istekler[0];
    assert.strictEqual(r.yol,'/rest/v1/profiller');assert.strictEqual(r.yontem,'POST');
    assert.strictEqual(r.basliklar.apikey,'srv-key');assert.strictEqual(r.basliklar.authorization,'Bearer srv-key');
    assert.match(r.basliklar.prefer,/resolution=merge-duplicates/);assert.match(r.basliklar['content-type'],/application\/json/);
    assert.deepStrictEqual({uye:r.govde.uye,ad:r.govde.ad,renk:r.govde.renk,sapka:r.govde.sapka},{uye:'u1',ad:'Ece2',renk:'#000',sapka:'none'});assert.ok(r.govde.guncellenme);
    assert.strictEqual(k.sayac.profil,1);assert.strictEqual(k.sayac.hata,0);
  }finally{k.kapat();await t.kapat()}
});
test('profil: sunucu hatası sayılır, fırlatmaz; ayarsızken istek yok; kapat bekleyeni iptal eder',async()=>{
  const t=await taklit(500);const k=Kayit.olustur({url:t.url,serviceKey:'srv-key',bekleMs:50,quiet:true});
  try{k.profil('u2',{ad:'X'});await kadar(()=>k.sayac.hata>=1);assert.strictEqual(t.istekler.length,1);assert.strictEqual(k.sayac.hata,1)}finally{k.kapat();await t.kapat()}
  const k2=Kayit.olustur({quiet:true});k2.profil('u3',{ad:'Y'});await bekle(100);assert.strictEqual(k2.sayac.profil,0);k2.kapat();
  const t2=await taklit();const k3=Kayit.olustur({url:t2.url,serviceKey:'s',bekleMs:200,quiet:true});k3.profil('u4',{ad:'Z'});k3.kapat();await bekle(800);assert.strictEqual(t2.istekler.length,0,'kapat bekleyen upsert\'i iptal eder');await t2.kapat();
});
