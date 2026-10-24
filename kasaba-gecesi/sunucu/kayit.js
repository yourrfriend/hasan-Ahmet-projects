'use strict';
// Kayıt yuvası: sunucu her yayında (flush) odanın olay günlüğünü (R.log) buraya boşaltır.
// Bu sürümde olaylar yalnız sayılır ve atılır; geçmiş/Supabase aşamasında aynı arayüzle veritabanına yazılacak:
//   olustur(opts) → {kuyrukla(room, olaylar), kapat(), sayac}
// Oyun sunucusu bu modülün ne yaptığını bilmez; kuyrukla hiçbir zaman beklemez ya da hata fırlatmaz.
function olustur(opts={}){
  const sayac={olay:0};
  return{
    kuyrukla(room,olaylar){sayac.olay+=olaylar.length},
    kapat(){},
    sayac
  };
}
module.exports={olustur};
