'use strict';
// Testler için taklit PostgREST (kayit.test.js ve server.test.js paylaşır).
const http=require('http');
// Taklit PostgREST: tablo başına bellek; GET ?sahip=eq., POST (representation), PATCH ?id=eq.; t.hata(req) → durum kodu ile hata üretir
function taklitRest(){const T={kasabalar:[],kasaba_uyeleri:[],oyunlar:[],oyun_oyunculari:[],olaylar:[],profiller:[]};const istekler=[];let hata=()=>null;let sayac=0;
  const s=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
    const u=new URL(req.url,'http://x');const tablo=u.pathname.replace('/rest/v1/','');const govde=b?JSON.parse(b):null;
    const kayit={yol:req.url,tablo,yontem:req.method,prefer:req.headers.prefer||'',govde,xff:req.headers['x-forwarded-for']||null};istekler.push(kayit);
    const h=hata(kayit);if(h){res.writeHead(h);return res.end(JSON.stringify({message:'taklit hata '+h}))}
    const yaz=(d,kod=200)=>{res.writeHead(kod,{'Content-Type':'application/json'});res.end(JSON.stringify(d))};
    // Plan 7: GoTrue yerel uçları — anonim signup (gövde {}), e-postalı signup 422, PUT /user (Authorization gerekir), POST /otp (create_user:false; yok@… → 422)
    if(req.method==='POST'&&u.pathname==='/auth/v1/signup'){if(govde&&(govde.email||govde.phone))return yaz({code:422,error_code:'signup_disabled',msg:'Signups not allowed for this instance'},422);return yaz({access_token:'t-anon',token_type:'bearer',expires_in:3600,refresh_token:'r-anon',user:{id:'aaaaaaaa-0000-4000-8000-0000000000aa',is_anonymous:true}})}
    if(req.method==='PUT'&&u.pathname==='/auth/v1/user'){if(!req.headers.authorization)return yaz({code:401,error_code:'no_authorization',msg:'no'},401);return yaz({id:'u',new_email:govde&&govde.email})}
    if(req.method==='POST'&&u.pathname==='/auth/v1/otp'){if(govde&&govde.create_user===false&&/^yok@/.test(govde.email||''))return yaz({code:422,error_code:'otp_disabled',msg:'Signups not allowed for otp'},422);return yaz({})}
    // Plan 6: RPC hesap_birlestir (204) ve GoTrue admin kullanıcı silme (200) — yalnız kaydedilir; hata() ile durum kodu verilebilir
    if(req.method==='POST'&&u.pathname==='/rest/v1/rpc/hesap_birlestir'){res.writeHead(204);return res.end()}
    if(req.method==='DELETE'&&/^\/auth\/v1\/admin\/users\/[0-9a-f-]{36}$/.test(u.pathname)){return yaz({id:u.pathname.split('/').pop()})}
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
