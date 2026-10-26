'use strict';
// kod.js: kod isteği tavanları (IP/adres/kurulum/anonim; zaman pencereleri) ve Turnstile siteverify — saf, sahte saat ve sahte fetch.
const test=require('node:test');const assert=require('node:assert');
const K=require('../kod.js');
const DK=60000,SA=3600000;

test('tavanlar: IP 10 dk\'da 3, saatte 6; süre pencerenin en eski kaydına göre; 10 dk sonra açılır',()=>{
  let t=1000*SA;const T=K.tavanlar({simdi:()=>t});
  for(let i=0;i<3;i++){assert.deepStrictEqual(T.kontrol({ip:'1.1.1.1',adres:'a'+i+'@x.y'}),{ok:true});T.isaretle({ip:'1.1.1.1',adres:'a'+i+'@x.y'})}
  const r=T.kontrol({ip:'1.1.1.1',adres:'b@x.y'});assert.strictEqual(r.ok,false);assert.strictEqual(r.neden,'ip');assert.strictEqual(r.sureSn,600);
  t+=5*DK;assert.strictEqual(T.kontrol({ip:'1.1.1.1',adres:'b@x.y'}).sureSn,300);
  t+=5*DK+1;assert.deepStrictEqual(T.kontrol({ip:'1.1.1.1',adres:'b@x.y'}),{ok:true});
  // saatte 6: 10 dk aralıklarla 3 istek daha → 7. istek saatlik sınıra takılır
  for(let i=0;i<3;i++){T.isaretle({ip:'1.1.1.1',adres:'c'+i+'@x.y'});t+=10*DK+1}
  const s=T.kontrol({ip:'1.1.1.1',adres:'d@x.y'});assert.strictEqual(s.neden,'ip');assert.ok(s.sureSn>0&&s.sureSn<=3600);
  assert.strictEqual(T.sayac.ip_sinir,3);assert.strictEqual(T.sayac.istek,6);
});
test('tavanlar: adres saatte 3, günde 6 (küçük harf); kurulum saatte 30, günde 80; anonim IP saatte 10',()=>{
  let t=2000*SA;const T=K.tavanlar({simdi:()=>t,saat:30,gun:80});
  for(let i=0;i<3;i++)T.isaretle({ip:'9.9.9.'+i,adres:'Ayni@X.y'});
  const r=T.kontrol({ip:'9.9.9.9',adres:'ayni@x.y'});assert.strictEqual(r.neden,'adres');assert.ok(r.sureSn>0);
  t+=SA+1;for(let i=0;i<3;i++)T.isaretle({ip:'9.9.8.'+i,adres:'ayni@x.y'});
  t+=SA+1;assert.strictEqual(T.kontrol({ip:'9.9.7.1',adres:'ayni@x.y'}).neden,'adres','günde 6 doldu');
  const T2=K.tavanlar({simdi:()=>t,saat:30,gun:80});
  for(let i=0;i<30;i++)T2.isaretle({ip:'10.0.'+Math.floor(i/200)+'.'+i,adres:'k'+i+'@x.y'});
  const k=T2.kontrol({ip:'10.9.9.9',adres:'z@x.y'});assert.strictEqual(k.neden,'kota');assert.ok(k.sureSn>0);
  const T3=K.tavanlar({simdi:()=>t,saat:1000,gun:80});
  for(let i=0;i<80;i++){T3.isaretle({ip:'11.0.0.'+(i%250),adres:'g'+i+'@x.y'});t+=DK}
  assert.strictEqual(T3.kontrol({ip:'11.9.9.9',adres:'zz@x.y'}).neden,'kota','günde 80');
  const T4=K.tavanlar({simdi:()=>t});
  for(let i=0;i<10;i++)assert.deepStrictEqual(T4.anonimKontrol('5.5.5.5'),{ok:true});
  const a=T4.anonimKontrol('5.5.5.5');assert.strictEqual(a.ok,false);assert.ok(a.sureSn>0);assert.strictEqual(T4.sayac.anon_sinir,1);assert.strictEqual(T4.sayac.anon,10);
  assert.deepStrictEqual(T4.anonimKontrol('5.5.5.6'),{ok:true});
});
test('tavanlar: temizle eski kayıtları ve boş anahtarları düşürür',()=>{
  let t=3000*SA;const T=K.tavanlar({simdi:()=>t});T.isaretle({ip:'1.2.3.4',adres:'a@x.y'});T.anonimKontrol('1.2.3.4');
  assert.ok(T.boyut()>0);t+=25*SA;T.temizle();assert.strictEqual(T.boyut(),0);
});
test('turnstileDogrula: form kodlu istek, success+action+hostname; hata nedenleri',async()=>{
  const sahte=(cevap,kaydet)=>async(url,o)=>{kaydet&&kaydet.push({url,o});return {ok:true,status:200,json:async()=>cevap}};
  const k=[];const ok=await K.turnstileDogrula({secret:'s',response:'t',remoteip:'1.2.3.4',action:'kod_bagla',hostnames:['kasaba-test.munupixi.com'],fetch:sahte({success:true,action:'kod_bagla',hostname:'kasaba-test.munupixi.com'},k)});
  assert.deepStrictEqual(ok,{ok:true,hostname:'kasaba-test.munupixi.com'});assert.strictEqual(k[0].url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.strictEqual(k[0].o.method,'POST');
  assert.match(k[0].o.headers['Content-Type'],/application\/x-www-form-urlencoded/);assert.strictEqual(String(k[0].o.body),'secret=s&response=t&remoteip=1.2.3.4');
  const b=await K.turnstileDogrula({secret:'s',response:'t',remoteip:'1.2.3.4',action:'kod_bagla',hostnames:['h'],fetch:sahte({success:false,'error-codes':['invalid-input-response']})});
  assert.strictEqual(b.ok,false);assert.strictEqual(b.neden,'basarisiz');assert.deepStrictEqual(b.kodlar,['invalid-input-response']);
  assert.strictEqual((await K.turnstileDogrula({secret:'s',response:'t',action:'kod_gir',hostnames:['h'],fetch:sahte({success:true,action:'kod_bagla',hostname:'h'})})).neden,'action');
  assert.strictEqual((await K.turnstileDogrula({secret:'s',response:'t',action:'kod_gir',hostnames:['h'],fetch:sahte({success:true,action:'kod_gir',hostname:'localhost'})})).neden,'hostname');
  const u=[];assert.strictEqual((await K.turnstileDogrula({secret:'s',response:'x'.repeat(3000),action:'a',hostnames:['h'],fetch:sahte({},u)})).neden,'uzun');assert.strictEqual(u.length,0);
  assert.strictEqual((await K.turnstileDogrula({secret:'s',response:'',action:'a',hostnames:['h'],fetch:sahte({})})).neden,'belirtec');
  assert.strictEqual((await K.turnstileDogrula({secret:'',response:'t',action:'a',hostnames:['h'],fetch:sahte({})})).neden,'ayarsiz');
  assert.strictEqual((await K.turnstileDogrula({secret:'s',response:'t',action:'a',hostnames:['h'],fetch:async()=>{throw new Error('ECONN')}})).neden,'ag');
});

test('tavanlar.geriAl: işaretlenen son istek geri alınır (GoTrue ulaşılamazsa hak yanmasın)',()=>{
  let t=1000;const T=K.tavanlar({ipOn:1,adresSaat:1,saat:1,simdi:()=>t});
  assert.ok(T.kontrol({ip:'1',adres:'a@b'}).ok);T.isaretle({ip:'1',adres:'a@b'});
  assert.strictEqual(T.kontrol({ip:'1',adres:'a@b'}).ok,false,'işaret sonrası dolu');
  T.geriAl({ip:'1',adres:'a@b'});assert.ok(T.kontrol({ip:'1',adres:'a@b'}).ok,'geri alınca boş');assert.strictEqual(T.sayac.istek,0);
  T.geriAl({ip:'1',adres:'a@b'}); // boşken zararsız
  assert.ok(T.kontrol({ip:'1',adres:'a@b'}).ok);
});
