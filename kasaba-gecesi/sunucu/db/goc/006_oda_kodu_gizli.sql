-- Güvenlik düzeltmesi (2026-10-25 taraması): oda kodu bir yetkidir — kodu bilen odaya girer, sohbeti görür,
-- sonraki maçta rol alır. Kasaba üyeleri oyunlar satırının tamamını okuyabildiğinden, ev sahibinin daha sonra
-- açtığı yeni odanın kodu da bir kez oynamış herkese sızıyordu. Sütun yalnız service_role'a (oyun sunucusu) kalır;
-- istemci sorguları sütunları adıyla seçer (select=* kullanılmaz; PostgREST yetkisiz sütunda hata verir).
revoke select on public.oyunlar from authenticated;
grant select (id, kasaba_id, kurulum, baslama, bitis, sonuc, kazanan_takim, kazanan_metin, oyuncu_sayisi, ayarlar)
  on public.oyunlar to authenticated;
