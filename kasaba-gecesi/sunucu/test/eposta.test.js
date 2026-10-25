'use strict';
// eposta.js: tek gönderim fonksiyonu (Resend API) ve Türkçe kod maili şablonu. Ağ yok: sahte fetch.
const test=require('node:test');const assert=require('node:assert');
const Eposta=require('../eposta.js');

const sahteFetch=(durum,json,gecikmeMs=0)=>{const cagrilar=[];const f=async(url,o)=>{cagrilar.push({url,o});if(gecikmeMs)await new Promise((res,rej)=>{const t=setTimeout(res,gecikmeMs);if(o&&o.signal)o.signal.addEventListener('abort',()=>{clearTimeout(t);rej(Object.assign(new Error('aborted'),{name:'AbortError'}))})});return {status:durum,ok:durum>=200&&durum<300,json:async()=>json,text:async()=>JSON.stringify(json)}};return {f,cagrilar}};

test('kodMaili: Türkçe, kod geçer, süre geçer, link yok; bağlama ve giriş konuları',()=>{
  const m=Eposta.kodMaili({tur:'baglama',kod:'123456'});
  assert.strictEqual(m.subject,'Kasaba Gecesi doğrulama kodun: 123456');
  assert.match(m.text,/kodun: 123456/);assert.match(m.text,/15 dakika/);assert.match(m.html,/<b>123456<\/b>/);
  assert.ok(!/http/.test(m.text)&&!/http/.test(m.html),'mailde link yok');
  // sayfa verilince tek link o adres (başka link yok)
  const l=Eposta.kodMaili({tur:'baglama',kod:'123456',sayfa:'https://kasaba.munupixi.com/'});
  assert.match(l.text,/Sayfa kapandıysa: https:\/\/kasaba\.munupixi\.com\/ → "E-postanı bağla"/);assert.strictEqual((l.html.match(/https?:\/\//g)||[]).length,2,'html: href + görünen metin, başka link yok');assert.match(l.html,/href="https:\/\/kasaba\.munupixi\.com\/"/);
  const g=Eposta.kodMaili({tur:'giris',kod:'654321',sureDk:10});
  assert.match(g.subject,/giriş kodun: 654321/);assert.match(g.text,/10 dakika/);assert.match(g.text,/giriş/);
});
test('sendTransactionalEmail: Resend isteği doğru kurulur, 2xx → ok ve id',async()=>{
  const {f,cagrilar}=sahteFetch(200,{id:'e1'});const e=Eposta.olustur({apiKey:'k',fetch:f});
  const r=await e.sendTransactionalEmail({to:'a@b.c',subject:'S',text:'T',html:'<p>T</p>'});
  assert.deepStrictEqual(r,{ok:true,id:'e1'});assert.strictEqual(cagrilar.length,1);
  assert.strictEqual(cagrilar[0].url,'https://api.resend.com/emails');assert.strictEqual(cagrilar[0].o.method,'POST');
  assert.strictEqual(cagrilar[0].o.headers.Authorization,'Bearer k');
  const g=JSON.parse(cagrilar[0].o.body);assert.strictEqual(g.from,'Kasaba Gecesi <oyun@munupixi.com>');assert.deepStrictEqual(g.to,['a@b.c']);assert.strictEqual(g.subject,'S');assert.strictEqual(g.html,'<p>T</p>');
  assert.strictEqual(e.sayac.gonderilen,1);
});
test('sendTransactionalEmail: 429 → saglayici hatası, tek çağrı (yeniden deneme yok); anahtarsız → ayarsiz ve çağrı yok; zaman aşımı',async()=>{
  const {f,cagrilar}=sahteFetch(429,{message:'rate'});const e=Eposta.olustur({apiKey:'k',fetch:f});
  const r=await e.sendTransactionalEmail({to:'a@b.c',subject:'S',text:'T',html:'T'});
  assert.deepStrictEqual(r,{ok:false,neden:'saglayici',durum:429});assert.strictEqual(cagrilar.length,1);assert.strictEqual(e.sayac.hata,1);
  const y=sahteFetch(200,{id:'x'});const e2=Eposta.olustur({apiKey:'',fetch:y.f});
  assert.deepStrictEqual(await e2.sendTransactionalEmail({to:'a@b.c',subject:'S',text:'T',html:'T'}),{ok:false,neden:'ayarsiz'});assert.strictEqual(y.cagrilar.length,0);
  const z=sahteFetch(200,{id:'x'},50);const e3=Eposta.olustur({apiKey:'k',fetch:z.f,zamanAsimiMs:10});
  const r3=await e3.sendTransactionalEmail({to:'a@b.c',subject:'S',text:'T',html:'T'});assert.strictEqual(r3.ok,false);assert.strictEqual(r3.neden,'zaman_asimi');
  const a=sahteFetch(200,{});a.f=async()=>{throw new Error('ECONNREFUSED')};const e4=Eposta.olustur({apiKey:'k',fetch:a.f});
  assert.strictEqual((await e4.sendTransactionalEmail({to:'a@b.c',subject:'S',text:'T',html:'T'})).neden,'ag');
});
test('varsayılan örnek ve gönderen/sağlayıcı ayarı',async()=>{
  assert.ok(Eposta.varsayilan&&typeof Eposta.varsayilan.sendTransactionalEmail==='function');
  const {f,cagrilar}=sahteFetch(200,{id:'e'});const e=Eposta.olustur({apiKey:'k',fetch:f,gonderen:'X <x@y.z>'});
  await e.sendTransactionalEmail({to:'a@b.c',subject:'S',text:'T',html:'T'});assert.strictEqual(JSON.parse(cagrilar[0].o.body).from,'X <x@y.z>');
  assert.throws(()=>Eposta.olustur({apiKey:'k',saglayici:'yok'}),/sağlayıcı/);
});
