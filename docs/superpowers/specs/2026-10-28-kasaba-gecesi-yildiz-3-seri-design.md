# Yıldız ekonomisi 3a — seri (tasarım, kısa)

Tarih: 2026-10-28. Dal: `yildiz-3-seri` (`main@0772d35`). Parça 3'ün ilk alt işi; sıra: seri → haftalık görev → davet → set → vitrin (her biri ayrı kısa tasarım). Önceki parçalar: `…yildiz-1-design.md`, `…yildiz-2-design.md` (ikisi de canlıda).

## Amaç
Sık gelmeyi ödüllendirmek: üst üste gün oynayan oyuncunun "günün ilk maçı" ödülü büyür. Ayrı bir ödül kalemi yok; kart kısa kalır.

## Kararlar (kullanıcı: "dediğin gibi olsun")
- **Seri = üst üste gün.** İstanbul takvim gününe göre; o gün kasa veren en az bir maç (günün ilki ile aynı tanım: tavan kasası ve oylamasız maç sayılmaz). Dün oynanmışsa `seri+1`, bugün zaten oynanmışsa değişmez, daha eskiyse `seri=1`. **Joker yok**: bir gün boş → seri baştan.
- **Ödül:** günün ilki = `5 + min(seri-1, 5)` → 5, 6, 7, 8, 9, 10; 6. günden sonra sabit 10. Miktarlar `game.js` tek kaynak: `YILDIZ_KAYNAK.gunun_ilki.adet=5`, yeni `YILDIZ_KAYNAK.seri={n:'Seri',adet:1,tavan:5}` (gün başına artış ve en çok artış). SQL sayı bilmez: `mac_sonu`'ya `p_seri_artis int default 0` ve `p_seri_tavan int default 0` gider (eski kod 0 → bugünkü davranış).
- **Yalnız bağlı hesaplar** (1. parça kararı): bağlı değilse (e-posta yok ya da doğrulanmamış) seri yine **sayılır** (profilde görünür, bağlayınca hemen işler) ama günün ilki +5'te kalır. Kart satırı: bağlıysa `🔥 3. gün üst üste · +7 Günün ilk maçı`; bağlı değilse `+5 Günün ilk maçı` ve mevcut hatırlatma satırına "serin +6'dan başlar" eki (builder kısa yazar).
- **Profil (`/ben`):** özet kartında `🔥 Seri: 3 gün · en uzun 9` (seri 0 ise `🔥 Seri yok · en uzun 9`; hiç yoksa satır gizli). Başkası görmez.
- **Veri:** `public.seriler(uye uuid pk references auth.users on delete cascade, son_gun date not null, seri int not null default 0, en_uzun int not null default 0)`; RLS üye kendi satırını okur (008 kalıbı), yazan yalnız RPC. Karar `mac_sonu` içinde, cüzdan kilidi altında, günün ilki hesaplanan dalda (kasa yeni eklendiyse ve `v_ilk>0`, yani bugünün ilk gerçek kasasıysa): `seriler` upsert, `v_ilk := p_gunluk + least(greatest(seri-1,0)*p_seri_artis, p_seri_tavan)` yalnız bağlıysa; dönüşe `seri` (int, bağlı olmasa da). `son_gun` dünden eskiyse `seri=1`. `envanter_oku` → `seri:{seri,en_uzun,son_gun}`. `hesap_birlestir`: `seri` ve `en_uzun` büyüğü, `son_gun` yenisi.
- **Geçiş:** göç 014 geriye uyumlu (eski 8 parametreli çağrı aynı sonucu verir; `drop function` + yeni imza, 010/012 kalıbı). Sunucuda uygulama onaysız (kasaba-test), canlı "canlıya al" ile.
- **Ölçüm:** `denge.js` hafta senaryosu satırına seri eklenir: 7 gün oynayan 60 ⭐/hafta (bugün 35), 4 gün 24 (20) — hedef bu bant; yalnız `seri.adet/tavan` ayarlanır.

## Hedef olmayanlar
Joker/dondurma, seri rozeti/kozmetiği, başkasının serisini görme, haftalık görev (bir sonraki kısa tasarım).

## Yaklaşımlar
- **A (seçilen):** `seriler` tablosu + karar `mac_sonu`'da kilit altında; 1–2. parça kalıbı, idempotent, çift sekme güvenli.
- B: tablo yok, `kasalar`'dan ardışık gün sayımı her çağrıda; "en uzun" için tam tarama, zaman dilimi sorguda; profil de aynı hesabı yapar. Elendi.

## Nasıl
`game.js` `YILDIZ_KAYNAK.seri`; `kayit.js` `macSonu` `p_seri_artis/p_seri_tavan`; `server.js` kasa mesajına `seri`, envanter `seri`; `index.html` kasa kartı satırı + hatırlatma eki, `KG_VER`; `sayfa/ben.html` özet satırı; göç `014_seri.sql` (tablo, RLS, `mac_sonu`, `envanter_oku`, `hesap_birlestir`); `test.sql` 28–29 (dün→+1, bugün ikinci maç değişmez, iki gün önce→1, en_uzun, bağlı değilse +5, eski imza 0; birleştirme büyüğü; RLS); `game.test` SQL sabit/parametre eşleşmesi; `server.test` kasa mesajı `seri`; e2e kart satırı ve profil satırı; `denge.js`.

## Builder'a bırakılan
Kart ve profil metinlerinin son hâli, `seriler` için ek indeks (pk yeter), e2e'de tarih sabitleme yolu.
