// Kasaba Gecesi — ev görünümleri (kozmetik "ev"). Oyun sahnesi (index.html drawHouse) ve /ben önizlemeleri kullanır.
// Katalog (ad, nadirlik, fiyat) game.js KOZMETIK.ev'de; burada yalnız çizim. Her model ev merkezine göre çizilir
// (taban y≈34, ön yüz x -54..54, yan yüz 54..74, varsayılan evle aynı ölçek) ve şunları verir:
//   kapi {x,y,w,h,rx}  kapı kutusu (açılma animasyonu)   pencere {x,y,w,h,rx}  gece ışığı
//   silu  seçim parlaması/ölüm karartması silueti        golge {cx,rx}  zemin gölgesi   ust  en üst nokta (ad etiketi bunun üstünde)
//   ciz(b,SE)  gövdeyi b grubuna çizer (SE: SVG eleman yardımcısı, sayfa verir)
// RESIM: kullanıcının çizdiği evler (sayfa/ev/<key>.webp, 320 px, saydam): {w,h}; sahnede genişlik 150 birim, taban y=40.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KG_EVLER=api})(typeof self!=='undefined'?self:this,function(){
'use strict';
const K='#4a2f1c',CAM='#9fd6ff',ISIK='#ffe39a';
// ---------- yardımcılar ----------
const yap=(SE,b)=>({
  p:(d,f,ex)=>SE('path',Object.assign({d,fill:f||'none',stroke:K,'stroke-width':2.6,'stroke-linejoin':'round','stroke-linecap':'round'},ex||{}),b),
  r:(x,y,w,h,f,ex)=>SE('rect',Object.assign({x,y,width:w,height:h,fill:f,stroke:K,'stroke-width':2.4},ex||{}),b),
  c:(cx,cy,r,f,ex)=>SE('circle',Object.assign({cx,cy,r,fill:f,stroke:K,'stroke-width':2.2},ex||{}),b),
  e:(cx,cy,rx,ry,f,ex)=>SE('ellipse',Object.assign({cx,cy,rx,ry,fill:f,stroke:K,'stroke-width':2.4},ex||{}),b),
  l:(d,renk,w,ex)=>SE('path',Object.assign({d,fill:'none',stroke:renk,'stroke-width':w||1.6,'stroke-linecap':'round'},ex||{}),b),
  t:(x,y,s,txt,ex)=>{const e=SE('text',Object.assign({x,y,'font-size':s,'text-anchor':'middle'},ex||{}),b);e.textContent=txt;return e}
});
const YOK={stroke:'none'};
// pencere türleri: dikdörtgen kutusu (gece ışığı) döner
function pencere(d,tur,x,y,w,h,cerceve){cerceve=cerceve||'#f1e3c8';
  if(tur==='yuvarlak'){const r=Math.min(w,h)/2;d.c(x+w/2,y+h/2,r+3,cerceve);d.c(x+w/2,y+h/2,r,CAM,{'stroke-width':1.4});d.l(`M${x+w/2} ${y+h/2-r} V${y+h/2+r} M${x+w/2-r} ${y+h/2} H${x+w/2+r}`,cerceve,2);return{x,y,w,h,rx:r}}
  if(tur==='kemer'){d.p(`M${x-3} ${y+h+3} V${y+w/2} A${w/2+3} ${w/2+3} 0 0 1 ${x+w+3} ${y+w/2} V${y+h+3} Z`,cerceve);d.p(`M${x} ${y+h} V${y+w/2} A${w/2} ${w/2} 0 0 1 ${x+w} ${y+w/2} V${y+h} Z`,CAM,{'stroke-width':1.4});d.l(`M${x+w/2} ${y+2} V${y+h}`,cerceve,2);return{x,y,w,h,rx:w/2}}
  if(tur==='sogi'){d.r(x-2,y-2,w+4,h+4,'#7a5236');d.r(x,y,w,h,'#fbf3dc',{'stroke-width':1.2});for(let i=1;i<3;i++)d.l(`M${x+w*i/3} ${y} V${y+h}`,'#7a5236',1.4);d.l(`M${x} ${y+h/2} H${x+w}`,'#7a5236',1.4);return{x,y,w,h,rx:1}}
  if(tur==='kepenk'){d.r(x-9,y-1,8,h+2,'#4b7bb5',{'stroke-width':1.6});d.r(x+w+1,y-1,8,h+2,'#4b7bb5',{'stroke-width':1.6});}
  d.r(x-3,y-3,w+6,h+6,cerceve,{rx:2});d.r(x,y,w,h,CAM,{rx:1.5,'stroke-width':1.4});d.l(`M${x+w/2} ${y} V${y+h} M${x} ${y+h/2} H${x+w}`,cerceve,2);d.l(`M${x+4} ${y+h-5} l6 -6`,'#e6f7ff',2.2,{opacity:.9});return{x,y,w,h,rx:2}}
function kapiCiz(d,tur,x,y,w,h,renk){renk=renk||'#8a5a3c';
  if(tur==='kemer')d.p(`M${x} ${y+h} V${y+w/2} A${w/2} ${w/2} 0 0 1 ${x+w} ${y+w/2} V${y+h} Z`,renk);
  else if(tur==='yuvarlak')d.e(x+w/2,y+h-w/2,w/2,w/2,renk);
  else d.r(x,y,w,h,renk,{rx:2.5});
  d.c(x+w-5,y+h*0.6,1.9,'#f1e3c8',{'stroke-width':1});return{x,y,w,h,rx:tur==='kemer'?w/2:2.5}}
// süsler
const SUS={
  baca:(d,o)=>{d.r(o.bx||28,(o.by||o.T-40)-20,12,22,'#b5523a');d.r((o.bx||28)-2,(o.by||o.T-40)-24,16,5,'#9a4430')},
  fener:(d,o)=>{const x=o.kx-6,y=o.ky-4;d.l(`M${x} ${y-6} h4`,'#3f3f48',2);d.r(x-4,y-6,8,11,'#ffcf5a',{rx:2,'stroke-width':1.6})},
  ciceklik:(d,o)=>{const W=o.pen;d.r(W.x-4,W.y+W.h+3,W.w+8,6,'#8a5a3c',{rx:2,'stroke-width':1.5});['#ff6fae','#ffd23f','#9bd84a','#8e4bff'].forEach((c,i)=>d.c(W.x+i*(W.w/3.2),W.y+W.h+2,2.6,c,YOK))},
  sarmasik:(d,o)=>{d.l('M-50 32 q4 -14 -2 -26 q6 -10 0 -22','#3f8f3a',3);[[-50,20],[-52,6],[-48,-6],[-50,-14]].forEach(([x,y])=>d.e(x,y,4,2.6,'#5cbf4f',{'stroke-width':1}))},
  biber:(d,o)=>{d.l(`M-40 ${o.T+6} q30 10 60 0`,'#6b4a2e',1.4);for(let i=0;i<7;i++)d.e(-36+i*9,o.T+9+Math.sin(i)*1.5,2.4,5,'#d8342a',{'stroke-width':1})},
  kar:(d,o)=>{d.p(o.karYol||`M-60 ${o.T+2} L0 ${o.T-48} L60 ${o.T+2} Q30 ${o.T-6} 0 ${o.T-36} Q-30 ${o.T-6} -60 ${o.T+2} Z`,'#ffffff',{'stroke-width':2})},
  anten:(d,o)=>{d.l(`M40 ${o.ust} v-18`,'#5a5f6a',2.4);d.c(40,o.ust-20,3,'#ff5a5a',{'stroke-width':1.2})},
  gunes:(d,o)=>{d.p(`M-40 ${o.T-8} l30 -22 h28 l-30 22 Z`,'#2c4a8a');d.l(`M-31 ${o.T-15} l30 -22 M-20 ${o.T-8} l30 -22`,'#7fb2ff',1.2)},
  fenerKirmizi:(d,o)=>{[[-40,o.T+8],[44,o.T+4]].forEach(([x,y])=>{d.l(`M${x} ${y-6} v4`,'#3a2418',1.6);d.e(x,y+4,6,8,'#e23b3b',{'stroke-width':1.6});d.l(`M${x-5} ${y+4} h10`,'#ffd23f',1.4)})},
  cini:(d,o)=>{for(let i=0;i<9;i++){d.r(-54+i*12,o.T+4,12,7,i%2?'#2f7fd0':'#f5f5f0',{'stroke-width':1})}},
  sutun:(d,o)=>{[-50,-8].forEach(x=>{d.r(x,o.T+2,8,o.H-2,'#f3efe4',{'stroke-width':1.8});d.r(x-2,o.T,12,4,'#e2dccb',{'stroke-width':1.4})})},
  ejder:(d,o)=>{d.p(`M-58 ${o.T+4} q-10 -10 -4 -20 q6 2 6 8 q4 -6 10 -4`,'#6b3f2a',{'stroke-width':2.2})},
  balkon:(d,o)=>{d.r(-58,o.T+30,116,5,'#7a4e2c');for(let i=0;i<10;i++)d.l(`M${-54+i*12} ${o.T+35} v12`,'#7a4e2c',2);d.l(`M-58 ${o.T+47} h116`,'#7a4e2c',3)},
  kus:(d,o)=>{d.e(-20,o.ust+4,10,5,'#8a6a42',{'stroke-width':1.6});d.c(-16,o.ust,3,'#f1e3c8',{'stroke-width':1})},
  kivilcim:(d,o)=>{[[46,o.T-50],[52,o.T-60],[40,o.T-66]].forEach(([x,y])=>d.c(x,y,2.2,'#ffb020',YOK))},
  ag:(d,o)=>{d.l('M-56 0 q20 14 40 0 M-56 8 q20 14 40 0 M-48 -6 v20 M-36 -4 v20 M-24 -4 v20','#d9cfa6',1.2)},
  ortu:(d,o)=>{d.p(`M14 ${o.ky-6} h28 l-4 10 h-20 Z`,'#e23b3b',{'stroke-width':1.6})},
  yildiz:(d,o)=>{[[-40,o.T-30],[30,o.T-52],[-10,o.T-60]].forEach(([x,y])=>d.t(x,y,9,'✦',{fill:'#ffe48a'}))},
  neon:(d,o)=>{d.p(`M-54 ${o.T} H54 V32 H-54 Z`,'none',{stroke:'#2ff3ff','stroke-width':2.2,opacity:.9});d.l(`M-58 ${o.T-4} L0 ${o.T-50} L58 ${o.T-4}`,'#ff4fd8',2.4)}
};
// ---------- kutu ev üretici (parametrik) ----------
// o: {duvar,yan,taban,kat(1|2),desen,cati,catiRenk,catiYan,pencere,cerceve,kapi,kapiRenk,ekler[]}
function kutu(o){
  const T=o.kat===2?-62:-30,H=32-T;const cat=o.cati||'ucgen';
  const catiUst={ucgen:T-56,saz:T-60,cim:T-58,kar:T-56,duz:T-18,teras:T-18,kubbe:T-62,sogan:T-78,pagoda:T-50,egri:T-48,basamak:T-50,kemer:T-44,konik:T-64,tek:T-34}[cat]||T-56;
  const ust=catiUst-(o.ekler&&o.ekler.includes('anten')?22:0);
  const kapi={x:12,y:-10,w:26,h:42,rx:3};const pen=o.pencere==='ikiz'?{x:-46,y:T+18,w:16,h:16,rx:2}:{x:-38,y:o.kat===2?-8:-12,w:26,h:20,rx:2};
  return{kapi,pencere:pen,golge:{cx:12,rx:78},ust,
    silu:`M-58 ${T} L-58 34 L56 34 L76 22 L76 ${T-12} L${o.cati==='duz'||cat==='teras'?'-58 '+(T-14):'0 '+(catiUst+4)} Z`,
    ciz(b,SE){const d=yap(SE,b);const yan=o.yan||'#e2cfa6';const TB=o.taban||'#b9a37c';
      d.p(`M-56 30 L-56 36 L56 36 L76 24 L76 18 L54 30 Z`,TB,{'stroke-width':1.8});
      d.p(`M54 ${T} L74 ${T-12} L74 20 L54 32 Z`,yan);
      d.r(-54,T,108,H,o.duvar||'#f6ead1');
      // desenler
      const ds=o.desen;
      if(ds==='tugla')for(let y=T+6;y<30;y+=7)for(let x=-54+((y/7)%2?0:6);x<52;x+=12)d.l(`M${x} ${y} h9`,'rgba(90,40,25,.45)',1.4);
      if(ds==='tas')for(const [x,y,w] of [[-48,T+8,14],[-28,T+14,12],[-46,T+30,10],[-16,T+6,10],[-50,20,12],[-30,26,10],[40,T+10,10],[44,T+26,8],[-8,24,8]])d.r(x,y,w,6,'rgba(0,0,0,.08)',{rx:3,stroke:'rgba(60,40,30,.45)','stroke-width':1.2});
      if(ds==='ahsap')for(let y=T+8;y<32;y+=8)d.l(`M-54 ${y} H54`,'rgba(70,40,20,.45)',1.4);
      if(ds==='kutuk')for(let y=T+8;y<32;y+=9){d.l(`M-54 ${y} H54`,'rgba(70,40,20,.5)',2);d.c(-54,y-4,4,'#c9945c',{'stroke-width':1.2})}
      if(ds==='yarim'){d.l(`M-54 ${T+H/2} H54 M-30 ${T} V32 M30 ${T} V32 M-54 ${T} L-30 ${T+H/2} M30 ${T+H/2} L54 32`,'#5b3a27',4)}
      if(ds==='kerpic')for(const [x,y] of [[-44,T+10],[-20,T+24],[38,T+16],[-36,20],[30,24]])d.l(`M${x} ${y} q6 -3 12 0`,'rgba(120,80,40,.4)',1.6);
      if(ds==='metal')for(let x=-30;x<54;x+=24)d.l(`M${x} ${T} V32`,'rgba(60,70,80,.4)',1.6);
      if(o.kat===2)d.l(`M-54 ${T+H/2-6} H54`,'rgba(70,40,20,.55)',3);
      // çatı
      const cr=o.catiRenk||'#c9643f',cy=o.catiYan||'#a24f31';
      if(cat==='ucgen'||cat==='kar'||cat==='saz'||cat==='cim'){const tepe=cat==='saz'?T-52:T-48;
        d.p(`M0 ${tepe+2} L54 ${T} L74 ${T-12} L20 ${tepe-10} Z`,cy);
        d.p(`M-60 ${T+2} L0 ${tepe} L60 ${T+2} Z`,cat==='saz'?'#d9b25c':cat==='cim'?'#6fbf4f':cr,{'stroke-width':cat==='saz'?3.4:2.6});
        if(cat==='saz')for(let i=-3;i<=3;i++)d.l(`M${i*12} ${T-2} L${i*4} ${tepe+8}`,'rgba(120,80,20,.5)',1.4);
        if(cat==='cim')[[-30,T-8],[0,T-30],[26,T-10],[-12,T-18]].forEach(([x,y])=>d.l(`M${x} ${y} l3 -6 l3 6`,'#3f8f3a',1.6));
        if(cat==='kar')SUS.kar(d,{T});
        if(cat==='ucgen')d.e(0,T-24,8,9,'none',{stroke:'#f1e3c8','stroke-width':2.6});}
      else if(cat==='duz'||cat==='teras'){d.p(`M-58 ${T-8} L54 ${T-8} L74 ${T-20} L-38 ${T-20} Z`,o.catiUstRenk||'#d8c49a');d.r(-58,T-8,112,10,cr);d.p(`M54 ${T-8} L74 ${T-20} L74 ${T-10} L54 ${T+2} Z`,cy);
        if(cat==='teras'){d.p(`M-20 ${T-12} q16 -36 32 0 Z`,o.kubbeRenk||'#3f86d8')}}
      else if(cat==='kubbe'){d.p(`M-56 ${T+2} Q-56 ${T-62} 0 ${T-62} Q56 ${T-62} 56 ${T+2} Z`,cr);d.p(`M54 ${T} Q70 ${T-30} 40 ${T-52}`,'none',{stroke:cy,'stroke-width':5,opacity:.6})}
      else if(cat==='sogan'){d.p(`M-58 ${T-6} L54 ${T-6} L74 ${T-18} L-38 ${T-18} Z`,cy);d.r(-58,T-6,112,8,cr);d.p(`M-4 ${T-18} Q-30 ${T-40} 8 ${T-72} Q46 ${T-40} 20 ${T-18} Z`,o.kubbeRenk||'#e8b030');d.l(`M8 ${T-72} v-8`,K,2.4);d.c(8,T-82,3,'#ffd23f',{'stroke-width':1.2})}
      else if(cat==='pagoda'||cat==='egri'){d.p(`M0 ${T-38} L54 ${T} L74 ${T-12} L20 ${T-46} Z`,cy);d.p(`M-70 ${T+2} Q-46 ${T-6} -30 ${T-26} L0 ${T-44} L30 ${T-26} Q46 ${T-6} 70 ${T+2} Q30 ${T-10} 0 ${T-10} Q-30 ${T-10} -70 ${T+2} Z`,cr);
        if(cat==='pagoda'){d.p(`M-34 ${T-32} Q-18 ${T-36} -10 ${T-46} L4 ${T-54} L18 ${T-46} Q26 ${T-36} 42 ${T-32} Q18 ${T-38} 4 ${T-38} Q-14 ${T-38} -34 ${T-32} Z`,cr)}}
      else if(cat==='basamak'){d.p(`M54 ${T} L74 ${T-12} L74 ${T-24} L54 ${T-12} Z`,cy);d.p(`M-54 ${T} V${T-12} H-40 V${T-24} H-26 V${T-36} H-12 V${T-48} H12 V${T-36} H26 V${T-24} H40 V${T-12} H54 V${T} Z`,o.duvar||'#b5523a');d.c(0,T-30,6,CAM,{'stroke-width':1.6})}
      else if(cat==='kemer'){d.p(`M0 ${T-38} L54 ${T} L74 ${T-12} L20 ${T-50} Z`,cy);d.p(`M-58 ${T+2} L-48 ${T-24} L0 ${T-40} L48 ${T-24} L58 ${T+2} Z`,cr);d.l(`M-48 ${T-24} L48 ${T-24}`,'rgba(0,0,0,.25)',2)}
      else if(cat==='konik'){d.p(`M-60 ${T+2} L0 ${T-64} L60 ${T+2} Q0 ${T+10} -60 ${T+2} Z`,cr)}
      else if(cat==='tek'){d.p(`M-60 ${T+2} L-60 ${T-12} L58 ${T-34} L76 ${T-30} L76 ${T-14} L58 ${T+2} Z`,cr)}
      // pencere, kapı
      const pw=o.pencere==='ikiz'?null:pencere(d,o.pencere||'kare',pen.x,pen.y,pen.w,pen.h,o.cerceve);
      if(o.pencere==='ikiz'){pencere(d,'kare',-46,T+18,16,16,o.cerceve);pencere(d,'kare',-22,T+18,16,16,o.cerceve)}
      if(o.kat===2)pencere(d,o.pencere2||'kare',12,T+12,22,18,o.cerceve);
      kapiCiz(d,o.kapi||'duz',12,-10,26,42,o.kapiRenk);
      const ctx={T,H,ust:catiUst,pen:pw||pen,kx:12,ky:-10,bx:28,by:T-30};
      (o.ekler||[]).forEach(k=>SUS[k]&&SUS[k](d,ctx));}};
}
// ---------- özel siluetler ----------
const M={};
M.fici={kapi:{x:47,y:-4,w:20,h:36,rx:9},pencere:{x:-23,y:-9,w:18,h:18,rx:9},silu:'M-60 -36 L-30 -38 L-14 -62 L24 -62 L40 -40 L58 -38 Q76 0 58 36 L-60 36 Q-68 0 -60 -36 Z',golge:{cx:4,rx:74},ust:-80,
  ciz(b,SE){const d=yap(SE,b);d.p('M-56 -34 Q-66 0 -56 34 L52 34 Q60 0 52 -34 Z','#a8703f',{'stroke-width':3});for(const y of [-22,-8,6,20])d.l(`M-60 ${y} L54 ${y}`,'#7a4e2c',1.6);
    for(const x of [-34,24])d.l(`M${x} -36 Q${x-5} 0 ${x} 36`,'#3f3f48',5);d.p('M-30 -34 L-14 -60 L24 -60 L40 -34 Z','#6b3f2a');d.r(24,-76,12,24,'#b5523a');
    d.e(57,0,18,37,'#b97c48',{'stroke-width':3});d.e(57,0,13,31,'none',{stroke:'#7a4e2c','stroke-width':2});pencere(d,'yuvarlak',-23,-9,18,18);kapiCiz(d,'kemer',47,-4,20,36,'#7d5236')}};
M.mantar={kapi:{x:12,y:-6,w:22,h:38,rx:11},pencere:{x:-31,y:-10,w:26,h:18,rx:2},silu:'M-76 -26 Q-62 -98 6 -100 Q74 -98 86 -26 L46 -22 Q50 0 44 34 L-42 34 Q-48 0 -40 -22 Z',golge:{cx:4,rx:70},ust:-100,
  ciz(b,SE){const d=yap(SE,b);d.p('M-40 34 Q-48 -6 -32 -28 L36 -28 Q50 -6 44 34 Z','#f3ead5');d.e(5,-26,78,11,'#e8d4b0');d.p('M-76 -26 Q-62 -98 6 -100 Q74 -98 86 -26 Q6 -12 -76 -26 Z','#c4512f');
    for(const [cx,cy,r] of [[-42,-60,11],[-8,-82,8],[28,-62,13],[60,-44,7],[-62,-38,6],[50,-80,6]])d.e(cx,cy,r,r*0.8,'#f6e7c8',YOK);d.r(52,-92,10,18,'#b5523a');pencere(d,'kare',-31,-10,26,18);kapiCiz(d,'kemer',12,-6,22,38,'#7d5236')}};
M.peribacasi={kapi:{x:14,y:-4,w:22,h:36,rx:11},pencere:{x:-30,y:-24,w:20,h:22,rx:10},silu:'M-54 34 Q-52 -10 -28 -50 Q-14 -72 -18 -88 Q6 -108 30 -88 Q26 -72 36 -50 Q60 -10 64 34 Z',golge:{cx:6,rx:72},ust:-106,
  ciz(b,SE){const d=yap(SE,b);d.p('M-54 34 Q-52 -10 -28 -50 Q-10 -76 6 -78 Q22 -76 36 -50 Q60 -10 64 34 Z','#e6c79a');for(const y of [-10,16,-38])d.l(`M-44 ${y} Q6 ${y+8} 56 ${y-2}`,'#c9a678',2.4);
    d.p('M-24 -84 Q6 -112 34 -86 Q30 -72 6 -74 Q-18 -72 -24 -84 Z','#8c6a4a');pencere(d,'kemer',-30,-24,20,22,'#b08a5e');kapiCiz(d,'kemer',14,-4,22,36,'#5a3d26')}};
M.yurt={kapi:{x:-10,y:-4,w:22,h:36,rx:2},pencere:{x:30,y:-8,w:14,h:12,rx:2},silu:'M-64 34 L-64 -14 Q-40 -60 0 -66 Q40 -60 70 -14 L70 34 Z',golge:{cx:4,rx:76},ust:-74,
  ciz(b,SE){const d=yap(SE,b);d.p('M-64 34 L-64 -14 Q0 -6 70 -14 L70 34 Q0 40 -64 34 Z','#f2ead8');d.p('M-66 -14 Q-40 -60 0 -66 Q40 -60 72 -14 Q0 -4 -66 -14 Z','#e8dcc0');
    for(let i=-4;i<=4;i++)d.l(`M${i*15} -9 L${i*4} -62`,'rgba(150,110,60,.45)',1.4);d.l('M-64 4 Q0 12 70 4','#b5523a',4);d.l('M-64 14 Q0 22 70 14','#2f6fb5',3);d.c(3,-66,5,'#c4512f');
    kapiCiz(d,'duz',-10,-4,22,36,'#d8342a');d.l('M-6 0 h14 M-6 10 h14','#ffd23f',1.4);pencere(d,'kare',30,-8,14,12)}};
M.igloo={kapi:{x:38,y:2,w:22,h:30,rx:11},pencere:{x:-34,y:-20,w:16,h:12,rx:2},silu:'M-64 34 Q-66 -60 4 -64 Q70 -60 72 34 Z',golge:{cx:4,rx:76},ust:-68,
  ciz(b,SE){const d=yap(SE,b);d.p('M-64 34 Q-66 -60 4 -64 Q70 -60 72 34 Z','#eef6ff');for(const y of [-40,-18,4,22])d.l(`M-62 ${y} Q4 ${y-8} 70 ${y}`,'#b9d4ea',1.8);for(const [x,y] of [[-30,-30],[10,-52],[30,-8],[-40,12],[0,14]])d.l(`M${x} ${y} v10`,'#b9d4ea',1.6);
    d.p('M30 34 V10 Q30 -6 49 -6 Q68 -6 68 10 V34 Z','#e2eef9');kapiCiz(d,'kemer',38,2,22,30,'#2b3e57');pencere(d,'kare',-34,-20,16,12,'#cfe3f4');d.e(-50,30,8,3,'#f5fbff',YOK)}};
M['deniz-feneri']={kapi:{x:-8,y:0,w:18,h:32,rx:9},pencere:{x:-6,y:-92,w:16,h:14,rx:2},silu:'M-34 34 L-22 -76 L-26 -84 L-14 -112 L22 -112 L34 -84 L30 -76 L42 34 Z',golge:{cx:4,rx:52},ust:-126,
  ciz(b,SE){const d=yap(SE,b);d.p('M-34 34 L-22 -76 L30 -76 L42 34 Z','#f7f3ea');for(const [y,h] of [[-60,14],[-28,14],[4,14]])d.p(`M${-34+((34-y)*12/110)} ${y+h} L${-34+((34-y-h)*12/110)} ${y} L${42-((34-y)*12/110)} ${y} L${42-((34-y-h)*12/110)} ${y+h} Z`,'#d8342a',{'stroke-width':1.8});
    d.r(-28,-84,64,8,'#3f3f48');d.r(-16,-104,40,20,'#ffe39a',{'stroke-width':2.4});d.l('M-6 -104 v20 M4 -104 v20 M14 -104 v20','#3f3f48',1.6);d.p('M-22 -104 L4 -122 L30 -104 Z','#d8342a');d.c(4,-124,3,'#3f3f48');
    kapiCiz(d,'kemer',-8,0,18,32,'#2f5f9f');SE('path',{d:'M24 -96 L90 -110 L90 -80 Z',fill:'rgba(255,240,170,.35)',stroke:'none'},b);}};
M['yel-degirmeni']={kapi:{x:-6,y:4,w:20,h:28,rx:10},pencere:{x:-4,y:-40,w:16,h:14,rx:8},silu:'M-40 34 L-26 -50 L-30 -56 L4 -84 L38 -56 L34 -50 L48 34 Z',golge:{cx:4,rx:58},ust:-112,
  ciz(b,SE){const d=yap(SE,b);d.p('M-40 34 L-26 -52 L34 -52 L48 34 Z','#f1e1bf');d.l('M-36 0 L44 0 M-32 -26 L40 -26','rgba(120,80,40,.4)',1.6);d.p('M-32 -50 L4 -84 L40 -50 Z','#7a4e2c');
    pencere(d,'yuvarlak',-4,-40,16,14);kapiCiz(d,'kemer',-6,4,20,28,'#6b4a2e');const g=SE('g',{class:'cark',transform:'translate(4,-62)'},b);const dd=yap(SE,g);
    for(const a of [0,90,180,270]){const r=a*Math.PI/180;const x=Math.cos(r)*52,y=Math.sin(r)*52;dd.l(`M0 0 L${x} ${y}`,'#5b3a27',3);const nx=-Math.sin(r)*8,ny=Math.cos(r)*8;dd.p(`M${x*0.25} ${y*0.25} L${x} ${y} L${x+nx} ${y+ny} L${x*0.25+nx} ${y*0.25+ny} Z`,'#f6efe0',{'stroke-width':1.6})}dd.c(0,0,5,'#5b3a27')}};
M.caydanlik={kapi:{x:-12,y:-2,w:22,h:34,rx:11},pencere:{x:20,y:-26,w:18,h:16,rx:8},silu:'M-56 34 Q-70 -30 -20 -54 L-10 -70 L22 -70 L30 -54 Q78 -34 62 34 Z',golge:{cx:4,rx:72},ust:-86,
  ciz(b,SE){const d=yap(SE,b);d.p('M70 -10 Q96 -30 102 -48','none',{stroke:'#d64f6a','stroke-width':12});d.p('M70 -10 Q96 -30 102 -48','none',{stroke:K,'stroke-width':2,opacity:.0});
    d.p('M-56 34 Q-70 -30 -20 -54 L30 -54 Q78 -34 62 34 Z','#e85d78');d.p('M-60 -10 Q-90 -20 -76 10 Q-70 22 -58 16','none',{stroke:'#d64f6a','stroke-width':7});d.p('M-24 -54 Q4 -72 34 -54 Z','#d64f6a');d.c(5,-70,6,'#f6efe0');
    for(const [x,y] of [[-36,-20],[-40,8],[40,-2],[44,18],[-6,-34]])d.c(x,y,5,'#fff2f5',YOK);pencere(d,'yuvarlak',20,-26,18,16);kapiCiz(d,'kemer',-12,-2,22,34,'#7d3a4a')}};
M.cizme={kapi:{x:-26,y:-4,w:20,h:36,rx:10},pencere:{x:-24,y:-50,w:16,h:14,rx:2},silu:'M-40 34 L-40 -76 L10 -76 L10 -10 Q60 -10 70 20 L70 34 Z',golge:{cx:12,rx:72},ust:-92,
  ciz(b,SE){const d=yap(SE,b);d.p('M-40 34 L-40 -70 L10 -70 L10 -12 Q62 -12 70 22 L70 34 Z','#8a5a3c');d.r(-46,-80,62,14,'#6b3f2a');for(let y=-60;y<-14;y+=12){d.c(6,y,2.2,'#f1e3c8',{'stroke-width':1});}d.l('M6 -60 L-36 -54 M6 -48 L-36 -42 M6 -36 L-36 -30','#f1e3c8',1.4);
    d.p('M-42 34 L72 34 L72 28 L-42 28 Z','#3a2418');pencere(d,'kare',-24,-50,16,14);kapiCiz(d,'kemer',-26,-4,20,36,'#5b3a27');pencere(d,'yuvarlak',36,6,14,12);d.r(-8,-96,10,18,'#b5523a')}};
M.kabak={kapi:{x:-8,y:0,w:22,h:32,rx:11},pencere:{x:24,y:-22,w:16,h:14,rx:2},silu:'M-66 34 Q-80 -40 -10 -54 L-6 -72 L14 -70 L12 -54 Q84 -40 70 34 Z',golge:{cx:4,rx:78},ust:-76,
  ciz(b,SE){const d=yap(SE,b);d.p('M-66 34 Q-80 -40 -6 -54 Q76 -40 70 34 Z','#f08a2a');for(const x of [-34,-6,24,48])d.l(`M${x} -48 Q${x+(x>0?14:-14)} -6 ${x} 32`,'#c9661a',2.6);d.p('M-6 -54 Q-10 -66 -2 -74 L10 -72 Q6 -62 10 -54 Z','#5b7a2a');
    d.p('M10 -64 q18 -10 26 4','none',{stroke:'#5b9a2a','stroke-width':3});pencere(d,'kare',24,-22,16,14,'#f6d08a');pencere(d,'kare',-44,-22,16,14,'#f6d08a');kapiCiz(d,'kemer',-8,0,22,32,'#6b3f1a')}};
M.salyangoz={kapi:{x:30,y:0,w:22,h:32,rx:11},pencere:{x:-20,y:-24,w:18,h:16,rx:8},silu:'M-62 34 Q-70 -60 0 -64 Q66 -60 64 -6 Q90 4 92 34 Z',golge:{cx:8,rx:80},ust:-68,
  ciz(b,SE){const d=yap(SE,b);d.p('M28 34 Q64 -6 92 34 Z','#9ad0a0');d.p('M-62 34 Q-70 -60 0 -64 Q66 -60 58 34 Z','#e8b27a');d.p('M-2 -6 Q-30 -6 -30 -30 Q-30 -54 0 -54 Q36 -54 36 -20 Q36 18 -6 18','none',{stroke:'#a8703f','stroke-width':4});
    pencere(d,'yuvarlak',-20,-24,18,16,'#f6d08a');kapiCiz(d,'kemer',30,0,22,32,'#7d5236');d.l('M82 22 q8 -24 2 -40 M90 26 q14 -20 10 -36','#4a8a50',2.6);d.c(84,-18,3,'#2a2a2a',YOK);d.c(100,-10,3,'#2a2a2a',YOK)}};
M['ters-kayik']={kapi:{x:12,y:-4,w:22,h:36,rx:2},pencere:{x:-34,y:-8,w:20,h:16,rx:2},silu:'M-70 34 L-70 -10 Q0 -76 76 -10 L76 34 Z',golge:{cx:4,rx:80},ust:-58,
  ciz(b,SE){const d=yap(SE,b);d.r(-60,-12,116,46,'#e9dcbc');d.p('M-72 -8 Q0 -78 78 -8 Q0 -26 -72 -8 Z','#2f5f9f');d.l('M-60 -22 Q0 -62 66 -22 M-46 -34 Q0 -66 52 -34','#d8e6f5',2);
    pencere(d,'yuvarlak',-34,-8,20,16);kapiCiz(d,'duz',12,-4,22,36,'#2f5f9f');SUS.ag(d,{});d.l('M58 34 v-30','#7a4e2c',3)}};
M['agac-ev']={kapi:{x:2,y:-62,w:18,h:24,rx:2},pencere:{x:-32,y:-62,w:18,h:14,rx:2},silu:'M-30 34 L-14 -30 L-60 -36 L-60 -92 L0 -128 L60 -92 L60 -36 L14 -30 L30 34 Z',golge:{cx:0,rx:60},ust:-132,
  ciz(b,SE){const d=yap(SE,b);d.p('M-30 34 Q-12 0 -14 -36 L14 -36 Q12 0 30 34 Z','#8a5a3c');d.p('M-30 34 q-14 -4 -22 4 M30 34 q14 -4 22 4','none',{stroke:'#8a5a3c','stroke-width':6});
    d.c(-44,-104,28,'#4f9a3f');d.c(40,-104,30,'#4f9a3f');d.c(0,-124,30,'#5cae48');d.r(-40,-74,80,40,'#e9c98f');d.p('M-48 -72 L0 -100 L48 -72 Z','#c4512f');pencere(d,'kare',-32,-62,18,14);kapiCiz(d,'duz',2,-62,18,24,'#7d5236');
    d.l('M-50 -34 H50','#7a4e2c',3);d.l('M24 -34 l10 66 M34 -34 l10 66','#7a4e2c',2);for(let y=-24;y<30;y+=10)d.l(`M${26+(y+34)*0.15} ${y} h11`,'#7a4e2c',2)}};
M.bulut={kapi:{x:8,y:-12,w:20,h:30,rx:10},pencere:{x:-34,y:-24,w:18,h:16,rx:8},silu:'M-74 22 Q-82 -10 -54 -14 Q-56 -52 -16 -50 Q0 -78 34 -60 Q72 -64 70 -26 Q96 -16 80 18 Z',golge:{cx:4,rx:66},ust:-76,
  ciz(b,SE){const d=yap(SE,b);d.p('M-74 22 Q-82 -10 -54 -14 Q-56 -52 -16 -50 Q0 -78 34 -60 Q72 -64 70 -26 Q96 -16 80 18 Q0 32 -74 22 Z','#fbfdff');d.l('M-56 10 Q-20 18 20 10','#d6e6f5',2.4);
    pencere(d,'yuvarlak',-34,-24,18,16,'#e6f0fb');kapiCiz(d,'kemer',8,-12,20,30,'#8fb8e8');d.l('M-40 30 v6 M0 30 v8 M40 26 v8','#9fc4ec',2.6,{'stroke-dasharray':'2 4'});d.t(56,-44,12,'✦',{fill:'#ffe48a'})}};
M['yuzen-ada']={kapi:{x:10,y:-28,w:20,h:26,rx:2},pencere:{x:-34,y:-24,w:18,h:14,rx:2},silu:'M-66 2 L-50 30 L0 50 L50 30 L70 2 L50 -50 L0 -84 L-50 -50 Z',golge:{cx:0,rx:40},ust:-90,
  ciz(b,SE){const d=yap(SE,b);d.p('M-68 0 Q0 -10 72 0 L44 22 L12 48 L-6 52 L-30 26 Z','#8a6a4a');d.p('M-68 0 Q0 -10 72 0 Q0 10 -68 0 Z','#6fbf4f');for(const [x,y] of [[-20,28],[10,40],[30,20]])d.l(`M${x} ${y} l4 6`,'#5b3f28',1.6);
    d.r(-44,-34,80,34,'#f3e3c0');d.p('M-52 -32 L-4 -70 L44 -32 Z','#5a7fd0');pencere(d,'kare',-34,-24,18,14);kapiCiz(d,'duz',10,-28,20,26,'#7d5236');
    for(const [x,y,r] of [[-74,32,6],[78,26,5],[-56,48,4]])d.p(`M${x-r} ${y} L${x} ${y-r} L${x+r} ${y} L${x} ${y+r*1.4} Z`,'#8a6a4a',{'stroke-width':1.6});d.t(-60,-60,11,'✦',{fill:'#bfe7ff'})}};
M['saat-kulesi']={kapi:{x:-10,y:2,w:22,h:30,rx:11},pencere:{x:-8,y:-24,w:18,h:16,rx:2},silu:'M-36 34 L-36 -84 L-44 -84 L2 -128 L48 -84 L40 -84 L40 34 Z',golge:{cx:4,rx:54},ust:-136,
  ciz(b,SE){const d=yap(SE,b);d.r(-36,-84,76,118,'#e9d6b0');d.p('M40 -84 L54 -92 L54 26 L40 34 Z','#cdb68c');d.p('M-44 -82 L2 -126 L48 -82 Z','#3f6f9f');d.c(2,-128,3,'#ffd23f');
    d.c(2,-58,20,'#fdf8ec',{'stroke-width':3});for(let i=0;i<12;i++){const a=i*Math.PI/6;d.l(`M${2+Math.cos(a)*15} ${-58+Math.sin(a)*15} L${2+Math.cos(a)*18} ${-58+Math.sin(a)*18}`,K,1.6)}d.l('M2 -58 L2 -72 M2 -58 L12 -52',K,2.6);
    pencere(d,'kemer',-8,-24,18,16);kapiCiz(d,'kemer',-10,2,22,30,'#6b3f2a');d.l('M-36 -32 H40','rgba(120,80,40,.4)',2)}};
M.kristal={kapi:{x:-6,y:0,w:22,h:32,rx:11},pencere:{x:-40,y:-14,w:16,h:14,rx:2},silu:'M-60 34 L-50 -20 L-30 -70 L-6 -40 L10 -96 L30 -44 L50 -76 L64 -10 L70 34 Z',golge:{cx:4,rx:76},ust:-100,
  ciz(b,SE){const d=yap(SE,b);d.p('M-62 34 Q-60 -10 -30 -14 Q0 -30 34 -14 Q66 -10 70 34 Z','#7a6a8a');
    for(const [x,y,h,c] of [[-36,-14,56,'#9fe8ff'],[10,-30,70,'#c99bff'],[48,-12,62,'#7fd8ff'],[-12,-20,38,'#ffb0f0']]){d.p(`M${x-10} ${y} L${x} ${y-h} L${x+10} ${y} Z`,c,{'stroke-width':2});d.l(`M${x} ${y-h} L${x} ${y}`,'rgba(255,255,255,.7)',1.4)}
    pencere(d,'kare',-40,-14,16,14,'#c9b8e0');kapiCiz(d,'kemer',-6,0,22,32,'#4a3a5f');d.t(26,-104,12,'✦',{fill:'#ffffff'});d.t(-50,-72,9,'✦',{fill:'#bfe7ff'})}};
M.roket={kapi:{x:-8,y:-8,w:20,h:30,rx:10},pencere:{x:-8,y:-62,w:20,h:20,rx:10},silu:'M-28 30 L-28 -70 Q-28 -110 2 -126 Q32 -110 32 -70 L32 30 L54 40 L-50 40 Z',golge:{cx:2,rx:60},ust:-128,
  ciz(b,SE){const d=yap(SE,b);d.p('M-28 30 L-50 40 L-50 10 L-28 -14 Z','#d8342a');d.p('M32 30 L54 40 L54 10 L32 -14 Z','#d8342a');d.p('M-28 30 L-28 -70 Q-28 -110 2 -126 Q32 -110 32 -70 L32 30 Z','#eef1f6');
    d.p('M-24 -92 Q2 -132 28 -92 Z','#d8342a');d.l('M-28 -30 H32','#9aa5b1',2);pencere(d,'yuvarlak',-8,-62,20,20,'#9aa5b1');kapiCiz(d,'kemer',-8,-8,20,30,'#5a6b80');d.p('M-14 30 L-6 44 L2 34 L10 46 L18 30 Z','#ffb020',{'stroke-width':1.6})}};
M.steampunk={kapi:{x:12,y:-6,w:24,h:38,rx:12},pencere:{x:-36,y:-18,w:20,h:20,rx:10},silu:'M-58 34 L-58 -40 L-40 -40 L-40 -64 L30 -64 L30 -40 L76 -40 L76 34 Z',golge:{cx:8,rx:80},ust:-96,
  ciz(b,SE){const d=yap(SE,b);d.r(-58,-40,112,74,'#b0743a');d.p('M54 -40 L74 -52 L74 22 L54 34 Z','#8a5a2a');d.r(-40,-64,70,24,'#c98a45');
    d.r(36,-90,12,40,'#7a5a3a');d.c(42,-94,8,'#d8d8d8',{opacity:.9,stroke:'none'});d.c(52,-100,6,'#e8e8e8',{opacity:.8,stroke:'none'});
    for(const [cx,cy,r] of [[-14,-52,10],[10,-52,7]]){d.c(cx,cy,r,'#d9a548');for(let i=0;i<8;i++){const a=i*Math.PI/4;d.l(`M${cx+Math.cos(a)*r} ${cy+Math.sin(a)*r} L${cx+Math.cos(a)*(r+4)} ${cy+Math.sin(a)*(r+4)}`,'#d9a548',3)}d.c(cx,cy,r/3,'#7a5a3a')}
    d.l('M-58 -6 H54 M-58 14 H54','#7a4a22',2);for(const x of [-50,-20,46])d.c(x,-30,2,'#e9c27a',{'stroke-width':1});pencere(d,'yuvarlak',-36,-18,20,20,'#d9a548');kapiCiz(d,'kemer',12,-6,24,38,'#6b4a2a')}};
M.cadi={kapi:{x:10,y:-6,w:20,h:38,rx:3},pencere:{x:-36,y:-12,w:20,h:18,rx:2},silu:'M-52 34 L-50 -26 L-62 -24 L-6 -96 L18 -118 L14 -90 L60 -30 L48 -30 L54 34 Z',golge:{cx:4,rx:70},ust:-120,
  ciz(b,SE){const d=yap(SE,b);d.p('M-52 34 L-48 -26 L50 -30 L54 34 Z','#5d4a6e');d.l('M-50 -2 L52 -6 M-50 16 L53 14','rgba(0,0,0,.25)',1.6);d.p('M-62 -22 Q-30 -60 -6 -96 Q4 -110 18 -118 Q8 -96 14 -84 Q36 -54 62 -30 Q0 -40 -62 -22 Z','#3a2f45');
    d.r(30,-80,10,30,'#5b4a3a',{transform:'rotate(14 35 -65)'});pencere(d,'kare',-36,-12,20,18,'#8fd36a');kapiCiz(d,'duz',10,-6,20,38,'#2f2540');d.e(-28,30,16,7,'#2a2a2a');d.e(-28,26,13,4,'#8fd36a',YOK);d.c(-24,20,3,'#b6f08a',{opacity:.8,stroke:'none'})}};
M.kitap={kapi:{x:2,y:-8,w:22,h:40,rx:2},pencere:{x:-38,y:-50,w:20,h:16,rx:2},silu:'M-56 34 L-56 -86 L48 -86 L68 -96 L68 22 L48 34 Z',golge:{cx:8,rx:72},ust:-100,
  ciz(b,SE){const d=yap(SE,b);d.r(-56,-86,104,120,'#7a2f4a');d.p('M48 -86 L68 -96 L68 22 L48 34 Z','#f3e9d2');for(let y=-82;y<30;y+=6)d.l(`M50 ${y} L66 ${y-9}`,'#c8bba0',1);d.p('M-56 -86 L-36 -96 L68 -96 L48 -86 Z','#8f3a58');
    d.r(-56,-72,104,8,'#e2b24a',{'stroke-width':1.6});d.r(-56,14,104,8,'#e2b24a',{'stroke-width':1.6});pencere(d,'kare',-38,-50,20,16,'#e2b24a');kapiCiz(d,'duz',2,-8,22,40,'#4a1a2a');d.r(-20,-30,40,6,'#e2b24a',YOK)}};
M['sirk-cadiri']={kapi:{x:-10,y:-6,w:24,h:38,rx:12},pencere:{x:30,y:-10,w:14,h:12,rx:7},silu:'M-62 34 L-62 -10 L4 -92 L70 -10 L70 34 Z',golge:{cx:4,rx:78},ust:-108,
  ciz(b,SE){const d=yap(SE,b);d.r(-62,-12,132,46,'#fff4ea');for(let x=-62;x<70;x+=22)d.r(x,-12,11,46,'#e23b3b',{'stroke-width':1});d.p('M-66 -10 L4 -92 L74 -10 Z','#e23b3b');for(let i=-3;i<=3;i+=2)d.p(`M${4+i*10} -92 L${4+i*24} -10 L${4+(i+1)*24} -10 Z`,'#fff4ea',{'stroke-width':1});
    d.l('M4 -92 v-14','#5b3a27',2);d.p('M4 -106 l14 4 l-14 4 Z','#ffd23f',{'stroke-width':1.4});kapiCiz(d,'kemer',-10,-6,24,38,'#2f3f9f');pencere(d,'yuvarlak',30,-10,14,12)}};
M.serender={kapi:{x:12,y:-46,w:22,h:34,rx:2},pencere:{x:-34,y:-42,w:20,h:16,rx:2},silu:'M-58 34 L-58 -12 L-62 -60 L0 -100 L62 -60 L76 -64 L76 -14 L58 -10 L58 34 Z',golge:{cx:8,rx:72},ust:-104,
  ciz(b,SE){const d=yap(SE,b);for(const x of [-50,-10,30,50])d.r(x,-10,10,44,'#9a9a92');for(const x of [-50,-10,30,50])d.r(x-4,-14,18,6,'#c9b8a0',{'stroke-width':1.6});
    d.r(-56,-56,110,44,'#b07a46');d.p('M54 -56 L74 -66 L74 -22 L54 -12 Z','#8a5a30');for(let y=-48;y<-12;y+=8)d.l(`M-56 ${y} H54`,'rgba(70,40,20,.5)',1.6);
    d.p('M-62 -54 L0 -100 L62 -54 Z','#6b4a2e');d.p('M0 -98 L54 -56 L76 -68 L20 -108 Z','#57391f');pencere(d,'kare',-34,-42,20,16);kapiCiz(d,'duz',12,-46,22,34,'#6b3f1a')}};
M['kerpic-kule']={kapi:{x:-8,y:0,w:20,h:32,rx:2},pencere:{x:-26,y:-78,w:12,h:12,rx:2},silu:'M-36 34 L-34 -110 L38 -110 L52 -118 L56 24 L40 34 Z',golge:{cx:8,rx:56},ust:-120,
  ciz(b,SE){const d=yap(SE,b);d.p('M-36 34 L-34 -110 L38 -110 L40 34 Z','#c9935a');d.p('M38 -110 L54 -118 L56 24 L40 34 Z','#a8763f');d.r(-38,-114,78,8,'#f1e3c8');
    for(const [x,y] of [[-26,-78],[6,-78],[-26,-50],[6,-50],[-26,-24],[22,-24]]){d.r(x-2,y-2,16,16,'#f1e3c8',{'stroke-width':1.6});d.r(x,y,12,12,'#5a3d26',{'stroke-width':1})}kapiCiz(d,'duz',-8,0,20,32,'#5a3d26')}};
M.rondavel={kapi:{x:-8,y:-4,w:22,h:36,rx:2},pencere:{x:28,y:-8,w:14,h:14,rx:7},silu:'M-56 34 L-56 -8 L-68 -6 L4 -84 L76 -6 L62 -8 L62 34 Z',golge:{cx:4,rx:72},ust:-88,
  ciz(b,SE){const d=yap(SE,b);d.p('M-56 34 L-56 -10 Q4 0 62 -10 L62 34 Q4 40 -56 34 Z','#d9a46a');d.l('M-56 10 Q4 18 62 10','#8a4a2a',3);for(let x=-48;x<60;x+=12)d.l(`M${x} 12 l4 6 l4 -6`,'#f1e3c8',1.6);
    d.p('M-70 -6 Q-30 -40 4 -84 Q38 -40 78 -6 Q4 6 -70 -6 Z','#d9b25c',{'stroke-width':3});for(let i=-4;i<=4;i++)d.l(`M${4+i*16} -2 L${4+i*3} -76`,'rgba(120,80,20,.5)',1.4);
    kapiCiz(d,'duz',-8,-4,22,36,'#6b3f1a');pencere(d,'yuvarlak',28,-8,14,14)}};
M['ejder-yumurtasi']={kapi:{x:-10,y:-4,w:24,h:36,rx:12},pencere:{x:18,y:-50,w:16,h:14,rx:7},silu:'M-56 34 Q-74 -40 4 -98 Q82 -40 64 34 Z',golge:{cx:4,rx:70},ust:-104,
  ciz(b,SE){const d=yap(SE,b);d.p('M-56 34 Q-74 -40 4 -98 Q82 -40 64 34 Z','#3fa88a');for(const [x,y,r] of [[-30,-30,9],[-10,-60,8],[24,-30,10],[40,0,8],[-40,6,7],[6,-10,7],[20,-70,6]])d.p(`M${x-r} ${y} Q${x} ${y-r*1.4} ${x+r} ${y} Q${x} ${y-r*0.3} ${x-r} ${y} Z`,'#2f8a70',{'stroke-width':1.4});
    d.p('M-20 -96 l6 -14 l6 12 M10 -100 l8 -12 l2 14','#ffd23f',{'stroke-width':2});pencere(d,'yuvarlak',18,-50,16,14,'#ffd23f');kapiCiz(d,'kemer',-10,-4,24,36,'#1f5a48');d.c(48,-20,3,'#ffd23f',YOK)}};
M['kar-kuresi']={kapi:{x:8,y:-12,w:18,h:26,rx:2},pencere:{x:-26,y:-16,w:16,h:12,rx:2},silu:'M-66 34 L-66 20 Q-74 -66 4 -84 Q82 -66 74 20 L74 34 Z',golge:{cx:4,rx:76},ust:-88,
  ciz(b,SE){const d=yap(SE,b);d.p('M-70 20 L-62 36 L70 36 L78 20 Z','#7a4e2c');d.c(4,-30,62,'rgba(210,235,255,.45)',{'stroke-width':2.6});d.p('M-50 14 Q4 2 58 14 Q4 24 -50 14 Z','#ffffff',{'stroke-width':1.6});
    d.r(-34,-24,60,38,'#e6c89a');d.p('M-40 -22 L-4 -50 L32 -22 Z','#c4512f');SUS.kar(d,{karYol:'M-40 -22 L-4 -50 L32 -22 Q14 -28 -4 -42 Q-22 -28 -40 -22 Z'});pencere(d,'kare',-26,-16,16,12);kapiCiz(d,'duz',8,-12,18,26,'#7d5236');
    for(const [x,y] of [[-40,-64],[30,-70],[50,-30],[-50,-30],[10,-82]])d.c(x,y,2,'#ffffff',YOK);d.l('M-30 -72 q10 -12 24 -10','rgba(255,255,255,.8)',3)}};
M.pagoda={kapi:{x:-8,y:0,w:22,h:32,rx:2},pencere:{x:-8,y:-50,w:18,h:14,rx:2},silu:'M-56 34 L-50 -14 L-78 -10 L4 -46 L-60 -46 L4 -84 L-34 -84 L4 -122 L46 -84 L12 -84 L68 -46 L12 -46 L86 -10 L58 -14 L60 34 Z',golge:{cx:4,rx:74},ust:-126,
  ciz(b,SE){const d=yap(SE,b);d.r(-46,-16,96,50,'#c84a3a');d.r(-32,-56,68,40,'#c84a3a');d.r(-18,-90,40,34,'#c84a3a');
    const kat=(y,w)=>d.p(`M${4-w} ${y} Q${4-w*0.6} ${y-4} ${4-w*0.5} ${y-14} L${4+w*0.5} ${y-14} Q${4+w*0.6} ${y-4} ${4+w} ${y} Q${4} ${y-8} ${4-w} ${y} Z`,'#2f4a3a');kat(-12,82);kat(-52,64);kat(-88,46);
    d.p('M-6 -100 L4 -124 L14 -100 Z','#e2b24a');pencere(d,'sogi',-8,-50,18,14);kapiCiz(d,'duz',-8,0,22,32,'#3a2418');SUS.fenerKirmizi(d,{T:-26})}};
M['basamakli-tas']={kapi:{x:-6,y:-34,w:18,h:22,rx:2},pencere:{x:24,y:-30,w:12,h:10,rx:2},silu:'M-70 34 L-70 10 L-54 10 L-54 -12 L-38 -12 L-38 -36 L-24 -36 L-24 -66 L32 -66 L32 -36 L46 -36 L46 -12 L62 -12 L62 10 L78 10 L78 34 Z',golge:{cx:4,rx:80},ust:-70,
  ciz(b,SE){const d=yap(SE,b);d.r(-70,10,148,24,'#a8a08c');d.r(-54,-12,116,22,'#b8b09a');d.r(-38,-36,84,24,'#c8c0aa');d.r(-24,-66,56,30,'#d8d0b8');
    d.l('M-16 -60 h40 M-16 -44 h40','#6f8a4a',2.6);for(const x of [-60,-44,58,70])d.l(`M${x} 14 v16`,'rgba(0,0,0,.2)',1.6);d.p('M-6 34 L-6 10 L18 10 L18 34 Z','#9a927e',{'stroke-width':1.6});for(let y=12;y<34;y+=6)d.l(`M-6 ${y} h24`,'rgba(0,0,0,.25)',1.4);
    kapiCiz(d,'duz',-6,-34,18,22,'#4a3a2a');pencere(d,'kare',24,-30,12,10,'#b8b09a');d.p('M-20 -66 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l6 10','none',{stroke:'#6f8a4a','stroke-width':2.4})}};
M['yoruk-cadiri']={kapi:{x:-8,y:-6,w:24,h:38,rx:2},pencere:null,silu:'M-76 34 L-70 -8 L-40 -40 L4 -46 L48 -40 L80 -8 L84 34 Z',golge:{cx:4,rx:84},ust:-62,
  ciz(b,SE){const d=yap(SE,b);for(const x of [-40,4,48])d.l(`M${x} -40 v-16`,'#6b4a2e',3);d.p('M-74 34 L-68 -6 L-40 -40 L4 -44 L48 -40 L78 -6 L84 34 Z','#2f2a28');
    for(const x of [-56,-30,38,62])d.l(`M${x} -20 V34`,'#4a4440',1.6);d.l('M-70 -6 Q4 4 78 -6','#4a4440',2);d.l('M-40 -40 L-74 34 M48 -40 L84 34','#6b4a2e',1.4,{opacity:.6});
    d.r(-10,-8,28,40,'#b8322a',{'stroke-width':2});for(let y=-2;y<30;y+=10){d.p(`M-6 ${y} l5 -4 l5 4 l5 -4 l5 4`,'none',{stroke:'#ffd23f','stroke-width':1.6});d.l(`M-8 ${y+5} h24`,'#f1e3c8',1.2)}
    d.l('M-86 34 l10 -40 M94 34 l-10 -40','#6b4a2e',1.4);d.e(-40,30,10,4,'#c9a678',{'stroke-width':1.2})}};
M.kervansaray={kapi:{x:-10,y:-2,w:24,h:34,rx:12},pencere:{x:-44,y:-30,w:12,h:14,rx:6},silu:'M-60 34 L-60 -50 L-30 -50 L-30 -80 L38 -80 L38 -50 L58 -50 L78 -62 L78 22 L58 34 Z',golge:{cx:8,rx:80},ust:-84,
  ciz(b,SE){const d=yap(SE,b);d.r(-60,-50,118,84,'#d9c08e');d.p('M58 -50 L78 -62 L78 22 L58 34 Z','#bfa36e');for(let y=-40;y<34;y+=10)d.l(`M-60 ${y} H58`,'rgba(110,80,40,.35)',1.2);
    d.r(-30,-80,68,114,'#e6cf9e');d.r(-30,-60,68,8,'#2f9a9a',{'stroke-width':1.6});for(let x=-26;x<36;x+=8)d.p(`M${x} -56 l4 -3 l4 3 l-4 3 Z`,'#f1e3c8',{'stroke-width':.8});
    d.p('M-22 34 V-20 Q-22 -46 4 -46 Q30 -46 30 -20 V34 Z','#c9ad74');for(let i=0;i<5;i++)d.p(`M${-18+i*9} -24 q4 -8 8 0`,'none',{stroke:'#8a6a3a','stroke-width':1.6});
    const yildiz=(cx,cy,r)=>d.p(`M${cx} ${cy-r} L${cx+r*0.3} ${cy-r*0.3} L${cx+r} ${cy} L${cx+r*0.3} ${cy+r*0.3} L${cx} ${cy+r} L${cx-r*0.3} ${cy+r*0.3} L${cx-r} ${cy} L${cx-r*0.3} ${cy-r*0.3} Z`,'#2f9a9a',{'stroke-width':1.2});
    yildiz(-16,-70,6);yildiz(4,-70,6);yildiz(24,-70,6);kapiCiz(d,'kemer',-10,-2,24,34,'#5a3d26');pencere(d,'kemer',-44,-30,12,14,'#c9ad74');pencere(d,'kemer',42,-30,10,14,'#c9ad74')}};
// ---------- parametrik evler ----------
const P={
  'kirmizi-ev':{duvar:'#c8322a',yan:'#a12820',desen:'ahsap',cati:'ucgen',catiRenk:'#3a3f48',catiYan:'#2a2f38',cerceve:'#ffffff',kapiRenk:'#f1e3c8',ekler:['baca']},
  'alp-saleti':{duvar:'#c99a62',yan:'#a87a46',desen:'ahsap',cati:'ucgen',catiRenk:'#6b4a2e',catiYan:'#57391f',pencere:'ikiz',kat:2,cerceve:'#f6efe0',ekler:['balkon','ciceklik']},
  'safranbolu':{duvar:'#f7f1e2',yan:'#e3d8bf',desen:'yarim',kat:2,cati:'ucgen',catiRenk:'#b8492f',catiYan:'#923a24',pencere:'kare',pencere2:'kare',cerceve:'#6b4a2e',kapiRenk:'#6b3f1a',ekler:['ciceklik','baca']},
  'mardin':{duvar:'#e8cf96',yan:'#cfb57a',desen:'tas',cati:'duz',catiRenk:'#d9bf86',catiYan:'#bfa36a',catiUstRenk:'#e2c890',pencere:'kemer',kapi:'kemer',cerceve:'#c9ad74',kapiRenk:'#6b4a2e'},
  'ege-tas':{duvar:'#d9d3c4',yan:'#bfb8a6',desen:'tas',cati:'ucgen',catiRenk:'#b8562f',pencere:'kepenk',kapiRenk:'#3f6fb5',ekler:['ciceklik']},
  'kerpic-dam':{duvar:'#d29a62',yan:'#b47e4a',desen:'kerpic',cati:'duz',catiRenk:'#a8763f',catiYan:'#8a5f30',catiUstRenk:'#c48e56',pencere:'kare',cerceve:'#7a4e2c',kapiRenk:'#3f6fb5',ekler:['biber']},
  'santorini':{duvar:'#ffffff',yan:'#e6eef6',cati:'teras',catiRenk:'#f4f7fb',catiYan:'#dbe5ef',catiUstRenk:'#ffffff',kubbeRenk:'#2f6fd0',pencere:'kemer',kapi:'kemer',cerceve:'#2f6fd0',kapiRenk:'#2f6fd0'},
  'viking':{duvar:'#8a5a3c',yan:'#6b4428',desen:'kutuk',cati:'cim',catiYan:'#4f8a3a',pencere:'kare',cerceve:'#c9a678',kapiRenk:'#5b3a27',ekler:['ejder']},
  'minka':{duvar:'#efe6cf',yan:'#d6c9a8',desen:'yarim',cati:'saz',catiYan:'#b8902f',pencere:'sogi',kapiRenk:'#6b4a2e'},
  'fenerli-ev':{duvar:'#f3e6c8',yan:'#d9c8a0',cati:'egri',catiRenk:'#2f4a3a',catiYan:'#223a2c',pencere:'sogi',kapiRenk:'#b8322a',ekler:['fenerKirmizi']},
  'roma-villasi':{duvar:'#f2e8d6',yan:'#dccfb6',cati:'ucgen',catiRenk:'#c4512f',pencere:'kare',kapiRenk:'#7d3a2a',ekler:['sutun']},
  'venedik':{duvar:'#e8a0a0',yan:'#cc8484',kat:2,cati:'duz',catiRenk:'#c4705f',catiYan:'#a85a4a',catiUstRenk:'#d8907a',pencere:'kemer',pencere2:'kemer',cerceve:'#f6efe0',kapi:'kemer',kapiRenk:'#2f5f7f',ekler:['ciceklik']},
  'riad':{duvar:'#e2b07a',yan:'#c8965e',cati:'duz',catiRenk:'#d09a62',catiYan:'#b07a46',catiUstRenk:'#e8bc88',pencere:'kemer',kapi:'kemer',kapiRenk:'#2f7fa0',cerceve:'#f1e3c8',ekler:['cini']},
  'kanal-evi':{duvar:'#a8442f',yan:'#8a3422',desen:'tugla',kat:2,cati:'basamak',pencere:'kare',pencere2:'kare',cerceve:'#ffffff',kapiRenk:'#2f4f3f'},
  'izba':{duvar:'#a87a4a',yan:'#8a5f34',desen:'kutuk',cati:'ucgen',catiRenk:'#6b5a4a',catiYan:'#57483a',pencere:'kare',cerceve:'#5aa0d8',kapiRenk:'#5b3a27',ekler:['baca']},
  'tudor':{duvar:'#f4ecd8',yan:'#ddd0b2',desen:'yarim',kat:2,cati:'ucgen',catiRenk:'#6b4a3a',catiYan:'#57392b',pencere:'kare',pencere2:'kare',cerceve:'#5b3a27',kapiRenk:'#6b3f1a',ekler:['baca']},
  'tas-kulube':{duvar:'#c8c2b4',yan:'#aaa496',desen:'tas',cati:'saz',catiYan:'#b8902f',pencere:'kare',kapiRenk:'#6b4a2e',ekler:['sarmasik']},
  'tugla-ev':{duvar:'#c06a4a',yan:'#a0553a',desen:'tugla',cati:'ucgen',catiRenk:'#4a4f5a',catiYan:'#3a3f48',pencere:'kare',cerceve:'#f6efe0',kapiRenk:'#2f4f6f',ekler:['baca']},
  'karli-kulube':{duvar:'#9a6a40',yan:'#7a5230',desen:'kutuk',cati:'kar',catiRenk:'#6b4a2e',catiYan:'#e8f0f8',pencere:'kare',cerceve:'#f1e3c8',kapiRenk:'#5b3a27',ekler:['baca']},
  'saz-damli':{duvar:'#f2d98a',yan:'#d8bd6a',cati:'saz',catiYan:'#b8902f',pencere:'kare',cerceve:'#7a4e2c',kapiRenk:'#3f6f3f',ekler:['ciceklik']},
  'cim-damli':{duvar:'#e9dcc0',yan:'#d0c19e',desen:'tas',cati:'cim',catiYan:'#4f8a3a',pencere:'yuvarlak',kapi:'yuvarlak',kapiRenk:'#3f7f3f'},
  'balikci':{duvar:'#5a8fc0',yan:'#4676a2',desen:'ahsap',cati:'ucgen',catiRenk:'#d8d0c0',catiYan:'#b8b0a0',cerceve:'#ffffff',kapiRenk:'#f1e3c8',ekler:['ag']},
  'firin':{duvar:'#f0d8a8',yan:'#d6bc88',cati:'ucgen',catiRenk:'#b8562f',pencere:'kemer',kapiRenk:'#7d5236',ekler:['baca','ortu']},
  'demirci':{duvar:'#7a7470',yan:'#5f5a56',desen:'tas',cati:'tek',catiRenk:'#4a3a30',pencere:'kare',cerceve:'#3f3f48',kapiRenk:'#3a2a20',ekler:['baca','kivilcim']},
  'bahceli':{duvar:'#f6efe0',yan:'#ddd3bd',cati:'ucgen',catiRenk:'#5aa04a',catiYan:'#468a3a',pencere:'kare',kapiRenk:'#3f8f4a',ekler:['sarmasik','ciceklik']},
  'ambar':{duvar:'#b8322a',yan:'#962820',desen:'ahsap',cati:'kemer',catiRenk:'#5a4a40',catiYan:'#4a3a30',pencere:'yuvarlak',cerceve:'#ffffff',kapiRenk:'#ffffff'},
  'gece-mavisi':{duvar:'#2f3f7a',yan:'#24305f',cati:'ucgen',catiRenk:'#1a2350',catiYan:'#141b40',pencere:'yuvarlak',cerceve:'#ffd23f',kapiRenk:'#ffd23f',ekler:['yildiz']},
  'altin-kosk':{duvar:'#fff3d6',yan:'#e8d6ae',cati:'sogan',catiRenk:'#e8c25a',catiYan:'#c9a23a',kubbeRenk:'#e8b030',pencere:'kemer',kapi:'kemer',cerceve:'#e8b030',kapiRenk:'#8a4a2a',ekler:['cini']},
  'buyucu-evi':{duvar:'#6a4a9a',yan:'#523a7a',cati:'konik',catiRenk:'#3a2a6a',pencere:'yuvarlak',cerceve:'#ffd23f',kapi:'kemer',kapiRenk:'#2a1a4a',ekler:['yildiz']},
  'kurabiye':{duvar:'#b97a3e',yan:'#9a6230',cati:'ucgen',catiRenk:'#fdf6f0',catiYan:'#efe4da',pencere:'yuvarlak',cerceve:'#ff8ab0',kapiRenk:'#ff6fae',ekler:['ciceklik']},
  'neon-ev':{duvar:'#2a2f3a',yan:'#1f232c',desen:'metal',cati:'duz',catiRenk:'#3a404c',catiYan:'#2a2f3a',catiUstRenk:'#4a5160',pencere:'kare',cerceve:'#2ff3ff',kapiRenk:'#ff4fd8',ekler:['neon','anten']},
  'gunes-evi':{duvar:'#f6f8fb',yan:'#dfe6ee',cati:'tek',catiRenk:'#c8d0da',pencere:'kare',cerceve:'#5a6b80',kapiRenk:'#5a6b80',ekler:['gunes']},
  'konak':{duvar:'#e9d3a6',yan:'#cfb88a',desen:'ahsap',kat:2,cati:'ucgen',catiRenk:'#8a3a2a',catiYan:'#6f2e22',pencere:'kare',pencere2:'kare',cerceve:'#6b4a2e',kapiRenk:'#5b3a27',ekler:['baca']},
  'yali':{duvar:'#f4e2a8',yan:'#dbc88a',desen:'ahsap',kat:2,cati:'egri',catiRenk:'#8a3a2a',catiYan:'#6f2e22',pencere:'kare',pencere2:'kemer',cerceve:'#ffffff',kapiRenk:'#5b3a27'},
  'karadeniz':{duvar:'#b4884e',yan:'#946a38',desen:'yarim',cati:'ucgen',catiRenk:'#6a6a70',catiYan:'#55555a',pencere:'kare',cerceve:'#f6efe0',kapiRenk:'#5b3a27',ekler:['ciceklik']},
  'burc':{duvar:'#a8a296',yan:'#8a8478',desen:'tas',cati:'basamak',pencere:'kemer',kapi:'kemer',kapiRenk:'#4a3a2a',cerceve:'#8a8478'},
  'nil-evi':{duvar:'#e2c08a',yan:'#c8a46e',desen:'kerpic',cati:'duz',catiRenk:'#cfa86a',catiYan:'#b08a50',catiUstRenk:'#e2c08a',pencere:'kare',cerceve:'#2f8a9a',kapiRenk:'#2f8a9a',ekler:['cini']},
  'hanok':{duvar:'#f2ead6',yan:'#d8ccb0',desen:'yarim',cati:'egri',catiRenk:'#4a4f58',catiYan:'#3a3f48',pencere:'sogi',kapiRenk:'#7a4e2c'},
  'bambu-ev':{duvar:'#c8b46a',yan:'#a8944a',desen:'ahsap',cati:'saz',catiYan:'#a8802a',pencere:'sogi',kapiRenk:'#6b5a2a',ekler:['sarmasik']},
  'kutup-istasyonu':{duvar:'#f08a2a',yan:'#c86c1a',desen:'metal',cati:'kubbe',catiRenk:'#e6edf5',catiYan:'#c8d2de',pencere:'yuvarlak',cerceve:'#3f4a5a',kapiRenk:'#3f4a5a',ekler:['anten']}
};
for(const [k,o] of Object.entries(P))M[k]=kutu(o);
// ---------- kullanıcının çizdiği evler (raster) ----------
const RESIM={'kemerli-kulube':[320,278],'toprak-dam':[309,320],'kaya-konak':[283,320],'ayakli-ev':[305,320],'ucan-daire':[320,320],'mekanik-mantar':[292,320],'sera-kubbe':[284,320],'cimen-dam':[313,320],
  'fici-han':[318,320],'kapsul-ev':[311,320],'ahsap-kosk':[308,320],'mantar-kosk':[307,320],'kutuk-ev':[315,320],'kubbe-ev':[320,293],'a-catili':[320,317],'kule-ev':[217,320],'kok-kosk':[320,315],'sarmasikli-ev':[308,320],'kapadokya':[265,320],'kiyi-feneri':[172,320],'tas-degirmen':[230,320],'cumbali-konak':[254,320],'porselen-demlik':[320,288],'cini-kule':[187,320],'ejderli-ev':[304,320],'balkabagi':[311,320],'carkli-ev':[318,320],'deniz-kabugu':[298,320]};
// sahne ölçüsü: genişlik en çok 150, yükseklik en çok 140 birim; taban y=40
function resimOlcu(key){const r=RESIM[key];if(!r)return null;const s=Math.min(150/r[0],140/r[1]);const w=r[0]*s,h=r[1]*s;return{w,h,x:-w/2+6,y:40-h}}
function resimModel(key,url,isikUrl){const o=resimOlcu(key);return{resim:url,isik:isikUrl&&ISIKLI.has(key)?{href:isikUrl,x:o.x,y:o.y,w:o.w,h:o.h}:null,kapi:null,pencere:null,golge:{cx:6,rx:o.w*0.48},ust:o.y+4,
  silu:`M${o.x+6} ${o.y+o.h*0.25} Q${o.x+o.w/2} ${o.y-6} ${o.x+o.w-6} ${o.y+o.h*0.25} L${o.x+o.w} 38 L${o.x} 38 Z`,
  ciz(b,SE){SE('image',{href:url,x:o.x,y:o.y,width:o.w,height:o.h,preserveAspectRatio:'xMidYMax meet'},b)},
  olu(b,SE){SE('image',{href:url,x:o.x,y:o.y,width:o.w,height:o.h,preserveAspectRatio:'xMidYMax meet',filter:'url(#s_olu)'},b)}}}
// model(key, sürüm): SVG ya da resim modeli; yoksa null (varsayılan ev)
const own=(o,k)=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k);
// gece ışık katmanı olan resimler (sayfa/ev/<key>-isik.webp: yanan pencere/fener pikselleri); penceresi seçilemeyenlerde yok
const ISIKLI=new Set(['ayakli-ev','balkabagi','carkli-ev','cimen-dam','cini-kule','cumbali-konak','deniz-kabugu','ejderli-ev','fici-han','kapadokya','kapsul-ev','kaya-konak','kemerli-kulube','kiyi-feneri','kok-kosk','kubbe-ev','kutuk-ev','mantar-kosk','mekanik-mantar','porselen-demlik','sarmasikli-ev','tas-degirmen','ucan-daire']);
function model(key,v){const q=v?'?v='+v:'';if(own(M,key))return M[key];if(own(RESIM,key))return resimModel(key,'/sayfa/ev/'+key+'.webp'+q,'/sayfa/ev/'+key+'-isik.webp'+q);return null}
return{model,anahtarlar:()=>[...Object.keys(M),...Object.keys(RESIM)],svg:()=>Object.keys(M),resimler:()=>Object.keys(RESIM),RESIM};
});
