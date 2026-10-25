'use strict';
// Testler için taklit PostgREST (kayit.test.js ve server.test.js paylaşır).
const http=require('http');
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
module.exports={taklitRest};
