'use strict';
// sayfa/karsilastirma.js: kasaba sayfasındaki arkadaş karşılaştırmaları ve kazanma kuralının JS kopyası (SQL kazanma() ile aynı dallar)
const test=require('node:test');const assert=require('node:assert');
const {karsilastir,kazandiMi}=require('../../sayfa/karsilastirma.js');
const BEN='ben-uuid',A='a-uuid',B='b-uuid';
const oyun=(id,kazanan)=>({id,sonuc:'bitti',kazanan_takim:kazanan,kazanan_metin:''});
const oyuncu=(oyun_id,uye,takim,rol_key='masum',sag=true,olum_sekli=null)=>({oyun_id,pub_id:oyun_id+uye,uye,ad:uye.split('-')[0],takim,rol_key,sonunda_sag:sag,olum_sekli});

test('kazandiMi: takım, hayatta kalan, hortlak, tek başına tarafsız, Deli masum',()=>{
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'inn'),oyun('g','inn')),true);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'imp','hain'),oyun('g','inn')),false);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'neu','hayatta',true),oyun('g','imp')),true);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'neu','hayatta',false,'stab'),oyun('g','imp')),false);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'neu','hortlak',false,'asildi'),oyun('g','inn')),true);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'neu','serikatil',true),oyun('g','neu')),true);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'neu','serikatil',false,'stab'),oyun('g','neu')),false);
  assert.strictEqual(kazandiMi(oyuncu('g',BEN,'inn','deli'),oyun('g','inn')),true);
});

test('karşılaştır: birlikte maç, aynı tarafta zafer, karşı tarafta sen–o; az maçta azMac',()=>{
  const oyunlar=[oyun('g1','inn'),oyun('g2','imp'),oyun('g3','inn'),oyun('g4','inn')];
  const oyuncular=[
    oyuncu('g1',BEN,'inn'),oyuncu('g1',A,'inn'),oyuncu('g1',B,'imp','hain'),      // g1: ben+A aynı taraf kazandı; B karşı, kaybetti
    oyuncu('g2',BEN,'inn'),oyuncu('g2',A,'imp','hain'),                            // g2: A karşı tarafta kazandı
    oyuncu('g3',BEN,'imp','hain'),oyuncu('g3',A,'inn'),oyuncu('g3',B,'inn'),       // g3: ben karşı, A ve B kazandı
    oyuncu('g4',BEN,'inn'),oyuncu('g4',A,'inn'),                                   // g4: aynı taraf kazandı
  ];
  const r=karsilastir(BEN,oyunlar,oyuncular);const by=Object.fromEntries(r.map(x=>[x.uye,x]));
  assert.deepStrictEqual(by[A],{uye:A,ad:'a',birlikte:4,ayniTarafZafer:2,karsi:{ben:0,o:2},azMac:false});
  assert.deepStrictEqual(by[B],{uye:B,ad:'b',birlikte:2,ayniTarafZafer:0,karsi:{ben:1,o:1},azMac:true});
  assert.ok(!r.some(x=>x.uye===BEN),'kendisi listede yok');
  assert.deepStrictEqual(karsilastir(BEN,[],[]),[]);
  // bitmemiş oyun sayılmaz; uye'siz (misafir) satırlar listeye girmez
  const r2=karsilastir(BEN,[{...oyun('g5','inn'),sonuc:'devam'}],[oyuncu('g5',BEN,'inn'),oyuncu('g5',A,'inn'),{...oyuncu('g5','x',"inn"),uye:null}]);
  assert.deepStrictEqual(r2,[]);
});

test('karşılaştır: iki tarafsız aynı taraf sayılmaz — tek başına kazanan karşı tarafta sayılır',()=>{
  const oyunlar=[oyun('g1','neu'),oyun('g2','neu')];
  const oyuncular=[
    oyuncu('g1',BEN,'neu','hirsiz',true),oyuncu('g1',A,'neu','bombaci',false),   // g1: ben (Hırsız, sağ) kazandı; A (Bombacı) öldü
    oyuncu('g2',BEN,'neu','serikatil',false),oyuncu('g2',A,'neu','buyucu',true), // g2: A kazandı
  ];
  const by=Object.fromEntries(karsilastir(BEN,oyunlar,oyuncular).map(x=>[x.uye,x]));
  assert.deepStrictEqual(by[A],{uye:A,ad:'a',birlikte:2,ayniTarafZafer:0,karsi:{ben:1,o:1},azMac:true});
});

test('karşılaştır: iki tarafsız aynı oyunda ikisi de kazanırsa karşı taraf sayılmaz',()=>{
  const oyunlar=[oyun('g1','imp')]; // Hayatta sağ kaldı, Hortlak asıldı: ikisi de kazandı
  const oyuncular=[oyuncu('g1',BEN,'neu','hayatta',true),oyuncu('g1',A,'neu','hortlak',false,'asildi')];
  const by=Object.fromEntries(karsilastir(BEN,oyunlar,oyuncular).map(x=>[x.uye,x]));
  assert.deepStrictEqual(by[A],{uye:A,ad:'a',birlikte:1,ayniTarafZafer:0,karsi:{ben:0,o:0},azMac:true});
});
