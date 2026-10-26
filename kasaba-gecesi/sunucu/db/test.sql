-- RLS ve yetki senaryoları (uygula.sh --test). Tek işlem, sonunda rollback: veri bırakmaz.
-- Kimlik taklidi: set local role + request.jwt.claims (auth.uid() bunu okur).
begin;

-- test kullanıcıları
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
insert into public.profiller (uye, ad) values ('11111111-1111-1111-1111-111111111111', 'U1'), ('22222222-2222-2222-2222-222222222222', 'U2');
-- K1: U1 sahip, U2 üye. K2: U3 sahip (yabancı kasaba)
insert into public.kasabalar (id, ad, sahip) values ('aaaaaaaa-0000-0000-0000-000000000001', 'K1', '11111111-1111-1111-1111-111111111111'),
                                                   ('aaaaaaaa-0000-0000-0000-000000000002', 'K2', '33333333-3333-3333-3333-333333333333');
insert into public.kasaba_uyeleri (kasaba_id, uye, rol) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'sahip'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'uye'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'sahip');
-- G1: K1'de süren oyun; oyuncular U1 (p1) ve misafir (p2). G2: K2'de bitmiş oyun (U3)
insert into public.oyunlar (id, kasaba_id, kurulum, sonuc, oda_kodu) values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'kasaba', 'devam', 'ODAKODU12345');
insert into public.oyunlar (id, kasaba_id, kurulum, sonuc, bitis, kazanan_takim, kazanan_metin) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'kasaba', 'bitti', now(), 'inn', 'Masumlar kazandı!');
insert into public.oyun_oyunculari (oyun_id, pub_id, uye, ad, rol_key, takim, sonunda_sag) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'p1', '11111111-1111-1111-1111-111111111111', 'U1', 'doktor', 'inn', null),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'p2', null, 'Misafir', 'hain', 'imp', null),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p3', '33333333-3333-3333-3333-333333333333', 'U3', 'masum', 'inn', true);
insert into public.olaylar (oyun_id, sira, gun, faz, tur, veri) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 1, 1, 'night', 'baslangic', '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 1, 1, 'night', 'baslangic', '{}');

-- 1) yabancı U3: K1'in oyununu göremez (oyuncu değil, üye değil)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 0 then raise exception 'BAŞARISIZ 1: yabancı oyunu görüyor'; end if;
  if (select count(*) from public.kasaba_tablo where kasaba_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 0 then raise exception 'BAŞARISIZ 1: yabancı K1 tablosunu görüyor'; end if;
  raise notice 'GEÇTİ 1: yabancı hiçbir şey görmez';
end $$;

-- 2) oyuncu U1, oyun sürerken: oyunu görür; olayları ve rolleri göremez
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 2: oyuncu kendi oyununu görmüyor'; end if;
  if (select count(*) from public.olaylar where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 0 then raise exception 'BAŞARISIZ 2: süren oyunun olayları görünüyor'; end if;
  if (select rol_key from public.oyun_oyunculari_acik where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001' and pub_id = 'p2') is not null then raise exception 'BAŞARISIZ 2: süren oyunda rol görünüyor'; end if;
  if (select count(*) from public.oyun_oyunculari_acik where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 2 then raise exception 'BAŞARISIZ 2: oyuncu listesi eksik'; end if;
  raise notice 'GEÇTİ 2: süren oyunda olaylar ve roller gizli';
end $$;

-- 3) aynı oyun bitince: olaylar ve roller görünür
reset role;
update public.oyunlar set bitis = now(), sonuc = 'bitti', kazanan_takim = 'imp', kazanan_metin = 'Hainler kazandı!' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.olaylar where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 3: biten oyunun olayları görünmüyor'; end if;
  if (select rol_key from public.oyun_oyunculari_acik where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001' and pub_id = 'p2') <> 'hain' then raise exception 'BAŞARISIZ 3: biten oyunda rol görünmüyor'; end if;
  raise notice 'GEÇTİ 3: biten oyunda hikâye açık';
end $$;

-- 4) kasaba üyesi U2 (oyuncu değil): K1'in oyununu ve tablosunu görür, K2'yi görmez
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 4: üye kasabasının oyununu görmüyor'; end if;
  if (select count(*) from public.kasaba_tablo where kasaba_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 4: kasaba tablosu boş'; end if;
  if (select count(*) from public.kasaba_tablo where kasaba_id = 'aaaaaaaa-0000-0000-0000-000000000002') <> 0 then raise exception 'BAŞARISIZ 4: başka kasabanın tablosu görünüyor'; end if;
  if (select count(*) from public.kasabalar) <> 1 then raise exception 'BAŞARISIZ 4: kasaba listesi yanlış'; end if;
  raise notice 'GEÇTİ 4: üye yalnız kendi kasabasını görür';
end $$;

-- 5) authenticated yazamaz
do $$ begin
  begin
    insert into public.oyunlar (id, kurulum) values ('bbbbbbbb-0000-0000-0000-000000000009', 'kasaba');
    raise exception 'BAŞARISIZ 5: authenticated oyun yazabildi';
  exception when insufficient_privilege then raise notice 'GEÇTİ 5: authenticated oyun yazamaz'; end;
end $$;

-- 6) hesap_birlestir: yalnız service_role; U1 → U2 taşınır, üyelikler tekilleşir, sahip baskın
do $$ begin
  begin
    perform public.hesap_birlestir('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    raise exception 'BAŞARISIZ 6: authenticated birleştirebildi';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select public.hesap_birlestir('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
reset role;
do $$ begin
  if (select uye from public.oyun_oyunculari where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001' and pub_id = 'p1') <> '22222222-2222-2222-2222-222222222222' then raise exception 'BAŞARISIZ 6: oyuncu kaydı taşınmadı'; end if;
  if (select count(*) from public.kasaba_uyeleri where kasaba_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 6: üyelik tekilleşmedi'; end if;
  if (select rol from public.kasaba_uyeleri where kasaba_id = 'aaaaaaaa-0000-0000-0000-000000000001' and uye = '22222222-2222-2222-2222-222222222222') <> 'sahip' then raise exception 'BAŞARISIZ 6: sahip baskın değil'; end if;
  if (select sahip from public.kasabalar where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> '22222222-2222-2222-2222-222222222222' then raise exception 'BAŞARISIZ 6: kasaba sahibi taşınmadı'; end if;
  if (select count(*) from public.profiller where uye = '11111111-1111-1111-1111-111111111111') <> 0 then raise exception 'BAŞARISIZ 6: eski profil silinmedi'; end if;
  raise notice 'GEÇTİ 6: hesap birleştirme';
end $$;

-- 7) anon hiçbir şey okuyamaz
set local role anon;
do $$ begin
  begin
    perform count(*) from public.profiller;
    raise exception 'BAŞARISIZ 7: anon profilleri okuyabildi';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.oyun_oyunculari_acik;
    raise exception 'BAŞARISIZ 7: anon görünümü okuyabildi';
  exception when insufficient_privilege then null; end;
  raise notice 'GEÇTİ 7: anon okuyamaz';
end $$;
reset role;

-- 8) kasaba sahibi olan kullanıcı silinemez (kasaba sessizce gitmesin); üye olan silinebilir
do $$ begin
  begin
    delete from auth.users where id = '22222222-2222-2222-2222-222222222222';   -- U2: K1'in sahibi (birleştirme sonrası)
    raise exception 'BAŞARISIZ 8: kasaba sahibi silinebildi, kasaba gitti';
  exception when foreign_key_violation then null; end;
  if (select count(*) from public.kasabalar where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 8: kasaba kayboldu'; end if;
  raise notice 'GEÇTİ 8: kasaba sahibi silinemez';
end $$;

-- 9) oda kodu yetkidir: kasaba üyesi/oyuncu oyunu görür ama oda_kodu sütununu okuyamaz; service_role okur (006)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then raise exception 'BAŞARISIZ 9: üye oyunu görmüyor'; end if;
  begin
    perform oda_kodu from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    raise exception 'BAŞARISIZ 9: üye oda kodunu okuyabildi';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    raise exception 'BAŞARISIZ 9: üye select * ile oda kodunu okuyabildi';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
  if (select oda_kodu from public.oyunlar where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 'ODAKODU12345' then raise exception 'BAŞARISIZ 9: service_role oda kodunu okuyamıyor'; end if;
  raise notice 'GEÇTİ 9: oda kodu yalnız sunucuya açık';
end $$;
reset role;

-- 10) yabancı U3: görünümler (oyun_oyunculari_acik, oyuncu_ozet) yalnız kendi/üyelik verisini verir
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.oyun_oyunculari_acik where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 0 then raise exception 'BAŞARISIZ 10: yabancı oyuncu listesini görüyor'; end if;
  if (select count(*) from public.oyuncu_ozet where uye <> '33333333-3333-3333-3333-333333333333') <> 0 then raise exception 'BAŞARISIZ 10: oyuncu_ozet başkasını gösteriyor'; end if;
  if (select count(*) from public.oyuncu_ozet) <> 1 then raise exception 'BAŞARISIZ 10: U3 kendi özetini görmeli (G2 bitti)'; end if;
  raise notice 'GEÇTİ 10: yabancı görünümlerde yalnız kendini görür';
end $$;
reset role;

-- 11) kazanma(): 5 parametre, 5 dal (007)
do $$ begin
  if not public.kazanma('neu','hayatta',true,null,'imp') then raise exception 'BAŞARISIZ 11: hayatta sağ kazanır'; end if;
  if public.kazanma('neu','hayatta',false,'stab','neu') then raise exception 'BAŞARISIZ 11: hayatta ölü kazanmaz'; end if;
  if not public.kazanma('neu','hortlak',false,'asildi','inn') then raise exception 'BAŞARISIZ 11: hortlak asılınca kazanır'; end if;
  if not public.kazanma('neu','serikatil',true,null,'neu') then raise exception 'BAŞARISIZ 11: seri katil tek başına'; end if;
  if public.kazanma('neu','serikatil',true,null,'inn') then raise exception 'BAŞARISIZ 11: seri katil masum zaferinde kazanmaz'; end if;
  if not public.kazanma('inn','masum',true,null,'inn') then raise exception 'BAŞARISIZ 11: takım zaferi'; end if;
  if public.kazanma('imp','hain',false,'asildi','inn') then raise exception 'BAŞARISIZ 11: karşı takım kazanmaz'; end if;
  raise notice 'GEÇTİ 11: kazanma() 5 dal';
end $$;

-- 12) kasaba adı: sahip (U2, birleştirme sonrası) adı değiştirir; 41 karakter kısıta takılır; sahip sütunu değiştirilemez
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  update public.kasabalar set ad = 'Yeni Ad' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if (select ad from public.kasabalar where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 'Yeni Ad' then raise exception 'BAŞARISIZ 12: sahip adı değiştiremedi'; end if;
  begin
    update public.kasabalar set ad = repeat('x', 41) where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'BAŞARISIZ 12: 41 karakterlik ad kabul edildi';
  exception when check_violation then null; end;
  begin
    update public.kasabalar set sahip = '33333333-3333-3333-3333-333333333333' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'BAŞARISIZ 12: sahip sütunu değiştirilebildi';
  exception when insufficient_privilege then null; end;
  raise notice 'GEÇTİ 12: kasaba adı sınırı ve sahip koruması';
end $$;
reset role;

-- 13) tutarlılık kısıtları (007): sonuc/bitis; ad uzunlukları
do $$ begin
  begin
    insert into public.oyunlar (id, kurulum, sonuc) values ('bbbbbbbb-0000-0000-0000-000000000013', 'kasaba', 'bitti');
    raise exception 'BAŞARISIZ 13: bitti ama bitis null kabul edildi';
  exception when check_violation then null; end;
  begin
    update public.oyunlar set bitis = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001' and sonuc = 'bitti'; -- tutarlı: geçer
  end;
  begin
    insert into public.profiller (uye, ad) values ('33333333-3333-3333-3333-333333333333', repeat('y', 17));
    raise exception 'BAŞARISIZ 13: 17 karakterlik profil adı kabul edildi';
  exception when check_violation then null; end;
  begin
    update public.oyun_oyunculari set ad = repeat('z', 17) where oyun_id = 'bbbbbbbb-0000-0000-0000-000000000001' and pub_id = 'p1';
    raise exception 'BAŞARISIZ 13: 17 karakterlik oyuncu adı kabul edildi';
  exception when check_violation then null; end;
  raise notice 'GEÇTİ 13: tutarlılık ve uzunluk kısıtları';
end $$;

rollback;
