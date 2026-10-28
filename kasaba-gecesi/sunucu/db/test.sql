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

-- 14) ilerleme (008): mac_sonu yazar; kişi yalnız kendi satırlarını okur, istemci yazamaz
set local role service_role;
select public.mac_sonu('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000001', '{"tur":"esya","key":"iksir","adet":1}'::jsonb, array['kurtarici'], null, 2);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin
  if (select adet from public.esyalar where key = 'iksir') <> 1 then raise exception 'BAŞARISIZ 14: eşya yazılmadı'; end if;
  if (select yildiz from public.cuzdan) <> 2 then raise exception 'BAŞARISIZ 14: bonus yıldız yok (eski çağrı günün ilkini almaz)'; end if;
  if (select count(*) from public.rozetler where key = 'ilk_mac') <> 1 or (select count(*) from public.rozetler where key = 'kurtarici') <> 0 then raise exception 'BAŞARISIZ 14: rozetler (yalnız ilk_mac; kurtarici göç 012 ile başarı)'; end if;
  if (select sayac from public.basarilar where uye = '33333333-3333-3333-3333-333333333333' and key = 'kurtarici') <> 1 then raise exception 'BAŞARISIZ 14: eski çağrı kurtarici sayacı +1'; end if;
  if (select count(*) from public.kasalar) <> 1 then raise exception 'BAŞARISIZ 14: kasa kaydı'; end if;
  begin insert into public.esyalar (uye, key, adet) values ('33333333-3333-3333-3333-333333333333', 'fener', 5); raise exception 'BAŞARISIZ 14: istemci eşya yazabildi';
  exception when insufficient_privilege then null; end;
  begin update public.cuzdan set yildiz = 9999; raise exception 'BAŞARISIZ 14: istemci yıldız yazabildi';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.esyalar) + (select count(*) from public.cuzdan) + (select count(*) from public.rozetler) + (select count(*) from public.basarilar) + (select count(*) from public.kasalar) + (select count(*) from public.kozmetikler) <> 0 then raise exception 'BAŞARISIZ 14: başkasının ilerlemesi görünüyor'; end if;
  begin perform public.mac_sonu('11111111-1111-1111-1111-111111111111', gen_random_uuid(), null, null, null, 0); raise exception 'BAŞARISIZ 14: istemci mac_sonu çağırabildi';
  exception when insufficient_privilege then null; end;
  raise notice 'GEÇTİ 14: ilerleme yalnız kendine görünür, yalnız sunucu yazar';
end $$;
reset role;

-- 15) mac_sonu: idempotent; kozmetik tekrarı yıldıza döner; harcanan düşer (eksiye inmez); günlük kasa tavanı
set local role service_role;
do $$ declare r jsonb; u uuid := '33333333-3333-3333-3333-333333333333'; n int := 0; begin
  r := public.mac_sonu(u, 'cccccccc-0000-0000-0000-000000000001', '{"tur":"esya","key":"iksir","adet":1}'::jsonb, '{}', null, 2);
  if not coalesce((r->>'tekrar')::boolean, false) then raise exception 'BAŞARISIZ 15: aynı maç ikinci kez ödül verdi'; end if;
  r := public.mac_sonu(u, 'cccccccc-0000-0000-0000-000000000002', '{"tur":"kozmetik","key":"sapka:tac","donusum":20}'::jsonb, '{}', null, 0);
  if coalesce((r->>'donustu')::boolean, false) then raise exception 'BAŞARISIZ 15: ilk kozmetik dönüştü'; end if;
  r := public.mac_sonu(u, 'cccccccc-0000-0000-0000-000000000003', '{"tur":"kozmetik","key":"sapka:tac","donusum":20}'::jsonb, '{}', null, 0);
  if not (r->>'donustu')::boolean or (r->>'yildiz')::int <> 22 then raise exception 'BAŞARISIZ 15: tekrar kozmetik yıldıza dönmedi: %', r; end if;
  r := public.mac_sonu(u, 'cccccccc-0000-0000-0000-000000000004', null, '{}', 'iksir', 0);
  r := public.mac_sonu(u, 'cccccccc-0000-0000-0000-000000000005', null, '{}', 'iksir', 0);
  if (select adet from public.esyalar where uye = u and key = 'iksir') <> 0 then raise exception 'BAŞARISIZ 15: harcama yanlış (eksiye inmemeli)'; end if;
  for i in 1..25 loop
    r := public.mac_sonu(u, gen_random_uuid(), '{"tur":"esya","key":"fener","adet":1}'::jsonb, '{}', null, 0);
    if coalesce((r->>'tavan')::boolean, false) then n := n + 1; end if;
  end loop;
  if n = 0 then raise exception 'BAŞARISIZ 15: günlük kasa tavanı işlemedi'; end if;
  if position('for update' in pg_get_functiondef('public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb, int, int)'::regprocedure)) = 0 then raise exception 'BAŞARISIZ 15: göç 009 — mac_sonu cüzdan kilidi (for update) yok'; end if;
  if (select adet from public.esyalar where uye = u and key = 'fener') > 20 then raise exception 'BAŞARISIZ 15: tavan sonrası ödül verildi'; end if;
  raise notice 'GEÇTİ 15: mac_sonu idempotent, dönüşüm, harcama, tavan';
end $$;

-- 16) kozmetik_al: bakiye ve sahiplik
do $$ declare r jsonb; u uuid := '33333333-3333-3333-3333-333333333333'; begin
  r := public.kozmetik_al(u, 'bayrak:mavi', 12);
  if not coalesce((r->>'ok')::boolean, false) or (r->>'yildiz')::int <> 10 then raise exception 'BAŞARISIZ 16: satın alma: %', r; end if;
  r := public.kozmetik_al(u, 'bayrak:mavi', 12); if r->>'hata' <> 'var' then raise exception 'BAŞARISIZ 16: ikinci alım: %', r; end if;
  r := public.kozmetik_al(u, 'sapka:hale', 80); if r->>'hata' <> 'yildiz' then raise exception 'BAŞARISIZ 16: yetersiz bakiye: %', r; end if;
  r := public.envanter_oku(u);
  if (r->>'yildiz')::int <> 10 or not (r->'kozmetikler' ? 'bayrak:mavi') or (r->'esyalar'->>'fener') is null then raise exception 'BAŞARISIZ 16: envanter_oku: %', r; end if;
  raise notice 'GEÇTİ 16: kozmetik_al ve envanter_oku';
end $$;

-- 17) hesap_birlestir ilerlemeyi taşır ve toplar
do $$ declare u1 uuid := '11111111-1111-1111-1111-111111111111'; u3 uuid := '33333333-3333-3333-3333-333333333333'; f3 int; begin
  perform public.mac_sonu(u1, 'cccccccc-0000-0000-0000-000000000099', '{"tur":"esya","key":"fener","adet":1}'::jsonb, '{}', null, 5);
  select adet into f3 from public.esyalar where uye = u3 and key = 'fener';
  perform public.hesap_birlestir(u3, u1);
  if (select adet from public.esyalar where uye = u1 and key = 'fener') <> f3 + 1 then raise exception 'BAŞARISIZ 17: eşya adetleri toplanmadı'; end if;
  if (select yildiz from public.cuzdan where uye = u1) <> 15 then raise exception 'BAŞARISIZ 17: yıldız toplanmadı (10+5)'; end if;
  if not exists (select 1 from public.kozmetikler where uye = u1 and key = 'sapka:tac') then raise exception 'BAŞARISIZ 17: kozmetik taşınmadı'; end if;
  if (select count(*) from public.esyalar where uye = u3) + (select count(*) from public.cuzdan where uye = u3) + (select count(*) from public.kasalar where uye = u3) + (select count(*) from public.rozetler where uye = u3) + (select count(*) from public.basarilar where uye = u3) + (select count(*) from public.kozmetikler where uye = u3) <> 0 then raise exception 'BAŞARISIZ 17: eski hesapta kalıntı'; end if;
  if (select count(*) from public.kasalar where uye = u1) < 30 then raise exception 'BAŞARISIZ 17: kasalar taşınmadı'; end if;
  raise notice 'GEÇTİ 17: birleştirme ilerlemeyi taşır';
end $$;
reset role;

-- 18–21: yıldız ekonomisi 1 (göç 010). Kullanıcılar: u4 doğrulanmış e-posta, u5 sonra aynı adres, u6 e-postasız, u7 doğrulanmamış, u8 silinecek, u11 birleştirme hedefi
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Oyuncu@Ornek.com', now(), '{}', '{}', now(), now(), true),
       ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bekle@ornek.com', null, '{}', '{}', now(), now(), false),
       ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'silinen@ornek.com', now(), '{}', '{}', now(), now(), false),
       ('aaaaaaaa-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hedef@ornek.com', now(), '{}', '{}', now(), now(), false);
-- dünkü kasa ve bugünkü tavan kasası günün ilkini engellemez
insert into public.kasalar (uye, oyun_id, odul, zaman) values
  ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), '{"tur":"yildiz","adet":6}', now() - interval '1 day'),
  ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), '{"tavan":true}', now());

-- 18) günün ilki: bugünkü ilk kasaya +5, ikinciye 0; tavanda yok; tekrar dönüşünde alan yok
set local role service_role;
do $$ declare r jsonb; u4 uuid := '44444444-4444-4444-4444-444444444444'; u6 uuid := '66666666-6666-6666-6666-666666666666'; u3 uuid := '11111111-1111-1111-1111-111111111111'; g uuid := gen_random_uuid(); begin
  r := public.mac_sonu(u4, g, null, '{}', null, 2, 5);
  if (r->>'gunun_ilki')::int <> 5 or (r->>'yildiz')::int <> 7 then raise exception 'BAŞARISIZ 18: ilk maç +5: %', r; end if;
  r := public.mac_sonu(u4, g, null, '{}', null, 2, 5);
  if not coalesce((r->>'tekrar')::boolean, false) or r ? 'gunun_ilki' then raise exception 'BAŞARISIZ 18: tekrar: %', r; end if;
  r := public.mac_sonu(u4, gen_random_uuid(), null, '{}', null, 0, 5);
  if (r->>'gunun_ilki')::int <> 0 or (r->>'yildiz')::int <> 7 then raise exception 'BAŞARISIZ 18: ikinci maç 0: %', r; end if;
  r := public.mac_sonu('55555555-5555-5555-5555-555555555555', gen_random_uuid(), null, '{}', null, 0);
  if (r->>'gunun_ilki')::int <> 0 then raise exception 'BAŞARISIZ 18: eski (6 parametreli) çağrı günün ilkini aldı: %', r; end if;
  r := public.mac_sonu(u6, gen_random_uuid(), null, '{}', null, 0, 5);
  if (r->>'gunun_ilki')::int <> 5 then raise exception 'BAŞARISIZ 18: dünkü ve tavan kasası günün ilkini engelledi: %', r; end if;
  r := public.mac_sonu(u3, gen_random_uuid(), null, '{}', null, 0, 5);
  if not (r->>'tavan')::boolean or (r->>'gunun_ilki')::int <> 0 then raise exception 'BAŞARISIZ 18: tavanda günün ilki: %', r; end if;
  raise notice 'GEÇTİ 18: günün ilk maçı';
end $$;

-- 19) bagla_odulu: doğrulanmış e-posta bir kez; uye ve adres (küçük harf) başına bir kez
do $$ declare r jsonb; u4 uuid := '44444444-4444-4444-4444-444444444444'; begin
  r := public.bagla_odulu(u4);
  if not coalesce((r->>'ok')::boolean, false) or (r->>'yildiz')::int <> 32 then raise exception 'BAŞARISIZ 19: ödül (7+25): %', r; end if;
  if not exists (select 1 from public.kozmetikler where uye = u4 and key = 'bayrak:mektup') then raise exception 'BAŞARISIZ 19: mektup bayrağı yok'; end if;
  r := public.bagla_odulu(u4);
  if not coalesce((r->>'tekrar')::boolean, false) or (select yildiz from public.cuzdan where uye = u4) <> 32 then raise exception 'BAŞARISIZ 19: ikinci çağrı: %', r; end if;
  r := public.bagla_odulu('66666666-6666-6666-6666-666666666666');
  if r->>'hata' <> 'bagli_degil' then raise exception 'BAŞARISIZ 19: e-postasız: %', r; end if;
  r := public.bagla_odulu('77777777-7777-7777-7777-777777777777');
  if r->>'hata' <> 'bagli_degil' then raise exception 'BAŞARISIZ 19: doğrulanmamış: %', r; end if;
  if position('for update' in pg_get_functiondef('public.bagla_odulu(uuid)'::regprocedure)) = 0 then raise exception 'BAŞARISIZ 19: cüzdan kilidi yok'; end if;
  r := public.kozmetik_al(u4, 'bayrak:mektup', 70); if r->>'hata' <> 'ozel' then raise exception 'BAŞARISIZ 19: mektup satın alınabildi: %', r; end if;
  raise notice 'GEÇTİ 19: bağlama ödülü bir kez';
end $$;
reset role;
-- u4 adresini değiştirir; eski adres u5'e geçer (büyük harfle). Silinen u8'in adresi yeni üyeye geçer.
update auth.users set email = 'yeni@ornek.com' where id = '44444444-4444-4444-4444-444444444444';
update auth.users set email = 'OYUNCU@ornek.com', email_confirmed_at = now() where id = '55555555-5555-5555-5555-555555555555';
set local role service_role;
do $$ begin perform public.bagla_odulu('88888888-8888-8888-8888-888888888888'); end $$;
reset role;
delete from auth.users where id = '88888888-8888-8888-8888-888888888888';
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'silinen@ornek.com', now(), '{}', '{}', now(), now(), false);
set local role service_role;
do $$ declare r jsonb; begin
  r := public.bagla_odulu('44444444-4444-4444-4444-444444444444');
  if not coalesce((r->>'tekrar')::boolean, false) then raise exception 'BAŞARISIZ 20: adres değiştiren üye ikinci kez aldı: %', r; end if;
  r := public.bagla_odulu('55555555-5555-5555-5555-555555555555');
  if not coalesce((r->>'tekrar')::boolean, false) then raise exception 'BAŞARISIZ 20: aynı adres (büyük harf) başka üyede: %', r; end if;
  r := public.bagla_odulu('99999999-9999-9999-9999-999999999999');
  if not coalesce((r->>'tekrar')::boolean, false) then raise exception 'BAŞARISIZ 20: silinen üyenin adresi yeniden ödül aldı: %', r; end if;
  r := public.envanter_oku('44444444-4444-4444-4444-444444444444');
  if not (r->>'bagli')::boolean or not (r->>'bagla_odulu')::boolean then raise exception 'BAŞARISIZ 20: envanter_oku bağlı: %', r; end if;
  r := public.envanter_oku('77777777-7777-7777-7777-777777777777');
  if (r->>'bagli')::boolean or (r->>'bagla_odulu')::boolean then raise exception 'BAŞARISIZ 20: envanter_oku doğrulanmamış: %', r; end if;
  raise notice 'GEÇTİ 20: adres değişimi, büyük harf, silinen hesap; envanter_oku bayrakları';
end $$;

-- 21) birleştirme ödülü taşır (yeni üye tekrar alamaz); istemci tabloyu okuyamaz
do $$ declare r jsonb; t uuid := 'aaaaaaaa-1111-1111-1111-111111111111'; begin
  perform public.hesap_birlestir('44444444-4444-4444-4444-444444444444', t);
  r := public.bagla_odulu(t);
  if not coalesce((r->>'tekrar')::boolean, false) then raise exception 'BAŞARISIZ 21: birleştirmeden sonra ikinci ödül: %', r; end if;
  if not (public.envanter_oku(t)->>'bagla_odulu')::boolean then raise exception 'BAŞARISIZ 21: ödül kaydı taşınmadı'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  begin perform count(*) from public.bagla_odulleri; raise exception 'BAŞARISIZ 21: istemci bagla_odulleri okuyabildi';
  exception when insufficient_privilege then null; end;
  begin perform public.bagla_odulu('aaaaaaaa-1111-1111-1111-111111111111'); raise exception 'BAŞARISIZ 21: istemci bagla_odulu çağırabildi';
  exception when insufficient_privilege then null; end;
  raise notice 'GEÇTİ 21: birleştirme ve yetki';
end $$;
reset role;

-- 22) ikisi de ödül almış iki hesap birleşince fazla ödül geri alınır; eski adres yine kullanılmış sayılır
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('bbbbbbbb-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ikinci1@ornek.com', now(), '{}', '{}', now(), now(), false),
       ('cccccccc-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ikinci2@ornek.com', now(), '{}', '{}', now(), now(), false);
set local role service_role;
do $$ declare r jsonb; x uuid := 'bbbbbbbb-1111-1111-1111-111111111111'; y uuid := 'cccccccc-1111-1111-1111-111111111111'; begin
  perform public.bagla_odulu(x); perform public.bagla_odulu(y);
  perform public.hesap_birlestir(x, y);
  if (select yildiz from public.cuzdan where uye = y) <> 25 then raise exception 'BAŞARISIZ 22: iki ödül birleşti: %', (select yildiz from public.cuzdan where uye = y); end if;
  r := public.bagla_odulu(x);
  if not coalesce((r->>'tekrar')::boolean, false) then raise exception 'BAŞARISIZ 22: eski adres yeniden ödül aldı: %', r; end if;
  raise notice 'GEÇTİ 22: çift ödül birleştirmede geri alınır';
end $$;
reset role;

-- 23) günün ilki sınırı (göç 011 aralık koşulu): İstanbul'da dün 23:59'daki kasa sayılmaz, bugün 00:00'daki sayılır
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('dddddddd-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare r jsonb; u uuid := 'dddddddd-1111-1111-1111-111111111111';
  bas timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'; begin
  insert into public.kasalar (uye, oyun_id, odul, zaman) values (u, gen_random_uuid(), '{"tur":"yildiz","adet":1}', bas - interval '1 minute');
  r := public.mac_sonu(u, gen_random_uuid(), '{"tur":"yildiz","adet":1}', null, null, 0, 5);
  if (r->>'gunun_ilki')::int <> 5 then raise exception 'BAŞARISIZ 23: dünkü kasa bugünü kapattı: %', r; end if;
  delete from public.kasalar where uye = u;
  insert into public.kasalar (uye, oyun_id, odul, zaman) values (u, gen_random_uuid(), '{"tur":"yildiz","adet":1}', bas);
  r := public.mac_sonu(u, gen_random_uuid(), '{"tur":"yildiz","adet":1}', null, null, 0, 5);
  if (r->>'gunun_ilki')::int <> 0 then raise exception 'BAŞARISIZ 23: bugün 00:00 kasası sayılmadı: %', r; end if;
  raise notice 'GEÇTİ 23: günün ilki gün sınırı';
end $$;
reset role;

-- 24) kademeli başarılar (göç 012): iki eşik birden atlanır (her kademenin ödülü), tekrar sayaç artırmaz, mudavim = kasa sayısı,
--     tavanda sayaç yine artar ve altın verilir (kasa/bonus yok), eski 7 parametreli çağrı dönüşen rozetleri sayaca +1 yazar (kademe yok, rozetler'e yazmaz)
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('eeeeeeee-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare r jsonb; u uuid := 'eeeeeeee-1111-1111-1111-111111111111'; g uuid := gen_random_uuid(); b jsonb;
  sifir jsonb := '{"artis":0,"esik":[100,200,300],"odul":[10,30,"bayrak:kurt"]}';
begin
  b := jsonb_build_object('mudavim', '{"artis":0,"esik":[2,50,150],"odul":[10,30,"ev:meydan-saati"]}'::jsonb,
        'kurtarici', '{"artis":2,"esik":[1,2,30],"odul":[10,30,"sapka:hemsire"]}'::jsonb,
        'kalkan', sifir, 'golgeler', sifir, 'yalniz_kurt', sifir, 'son_isik', sifir, 'bekci', sifir, 'tuzak_ustasi', sifir, 'yildirim', sifir);
  r := public.mac_sonu(u, g, '{"tur":"yildiz","adet":0}', null, null, 0, 0, b);
  if r->'kademeler' <> '[{"key":"kurtarici","kademe":1,"odul":10},{"key":"kurtarici","kademe":2,"odul":30}]'::jsonb then raise exception 'BAŞARISIZ 24: iki kademe: %', r; end if;
  if (select yildiz from public.cuzdan where uye = u) <> 40 then raise exception 'BAŞARISIZ 24: bronz+gümüş 40: %', (select yildiz from public.cuzdan where uye = u); end if;
  if (select sayac from public.basarilar where uye = u and key = 'kurtarici') <> 2 or (select kademe from public.basarilar where uye = u and key = 'kurtarici') <> 2 then raise exception 'BAŞARISIZ 24: kurtarici 2/2'; end if;
  if (select sayac from public.basarilar where uye = u and key = 'mudavim') <> 1 or (select kademe from public.basarilar where uye = u and key = 'mudavim') <> 0 then raise exception 'BAŞARISIZ 24: mudavim 1/0'; end if;
  r := public.mac_sonu(u, g, '{"tur":"yildiz","adet":0}', null, null, 0, 0, b);
  if not coalesce((r->>'tekrar')::boolean, false) or (select sayac from public.basarilar where uye = u and key = 'kurtarici') <> 2 then raise exception 'BAŞARISIZ 24: tekrar sayacı artırdı: %', r; end if;
  b := b || jsonb_build_object('kurtarici', '{"artis":0,"esik":[1,2,30],"odul":[10,30,"sapka:hemsire"]}'::jsonb);
  r := public.mac_sonu(u, gen_random_uuid(), '{"tur":"yildiz","adet":0}', null, null, 0, 0, b);
  if (select sayac from public.basarilar where uye = u and key = 'mudavim') <> 2 or (select kademe from public.basarilar where uye = u and key = 'mudavim') <> 1
     or (select yildiz from public.cuzdan where uye = u) <> 50 then raise exception 'BAŞARISIZ 24: mudavim bronz: %', r; end if;
  insert into public.kasalar (uye, oyun_id, odul) select u, gen_random_uuid(), '{"tur":"yildiz","adet":1}' from generate_series(1, 20);
  b := b || jsonb_build_object('kurtarici', '{"artis":28,"esik":[1,2,30],"odul":[10,30,"sapka:hemsire"]}'::jsonb);
  r := public.mac_sonu(u, gen_random_uuid(), '{"tur":"yildiz","adet":9}', null, null, 5, 5, b);
  if not (r->>'tavan')::boolean then raise exception 'BAŞARISIZ 24: tavan bekleniyor: %', r; end if;
  if (select yildiz from public.cuzdan where uye = u) <> 50 then raise exception 'BAŞARISIZ 24: tavanda kasa/bonus verildi: %', (select yildiz from public.cuzdan where uye = u); end if;
  if r->'kademeler' <> '[{"key":"kurtarici","kademe":3,"odul":"sapka:hemsire"}]'::jsonb then raise exception 'BAŞARISIZ 24: tavanda altın: %', r; end if;
  if not exists (select 1 from public.kozmetikler where uye = u and key = 'sapka:hemsire') then raise exception 'BAŞARISIZ 24: altın kozmetik yazılmadı'; end if;
  r := public.mac_sonu(u, gen_random_uuid(), '{"tur":"yildiz","adet":0}', array['kurtarici','hain_zafer','ilk_mac'], null, 0, 0);
  if (select sayac from public.basarilar where uye = u and key = 'kurtarici') <> 31 then raise exception 'BAŞARISIZ 24: eski kod kurtarici +1'; end if;
  if (select sayac from public.basarilar where uye = u and key = 'golgeler') <> 1 or (select kademe from public.basarilar where uye = u and key = 'golgeler') <> 0 then raise exception 'BAŞARISIZ 24: eski kod golgeler 1/0'; end if;
  if (select array_agg(key order by key) from public.rozetler where uye = u) <> array['ilk_mac'] then raise exception 'BAŞARISIZ 24: rozetler: %', (select array_agg(key) from public.rozetler where uye = u); end if;
  if r->'kademeler' <> '[]'::jsonb then raise exception 'BAŞARISIZ 24: eski kod kademeler: %', r; end if;
  raise notice 'GEÇTİ 24: kademe atlama, tekrar, mudavim, tavan, eski çağrı';
end $$;
reset role;

-- 25) rozet_donustur: eski rozetler bronz/gümüş kademeye taşınır (yıldız yok), mudavim sayacı kasa sayısı, ikinci çağrı boş
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('ffffffff-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare u uuid := 'ffffffff-1111-1111-1111-111111111111'; n int; begin
  insert into public.kasalar (uye, oyun_id, odul) select u, gen_random_uuid(), '{"tur":"yildiz","adet":1}' from generate_series(1, 25);
  insert into public.rozetler (uye, key) values (u, 'ilk_mac'), (u, 'mac_10'), (u, 'kurtarici'), (u, 'masum_zafer');
  n := public.rozet_donustur();
  if n < 3 then raise exception 'BAŞARISIZ 25: en az 3 satır taşınmalı: %', n; end if;
  if (select sayac from public.basarilar where uye = u and key = 'mudavim') <> 25 or (select kademe from public.basarilar where uye = u and key = 'mudavim') <> 1 then raise exception 'BAŞARISIZ 25: mudavim 25/1'; end if;
  if (select sayac from public.basarilar where uye = u and key = 'kurtarici') <> 3 or (select kademe from public.basarilar where uye = u and key = 'kurtarici') <> 1 then raise exception 'BAŞARISIZ 25: kurtarici 3/1'; end if;
  if (select sayac from public.basarilar where uye = u and key = 'kalkan') <> 5 or (select kademe from public.basarilar where uye = u and key = 'kalkan') <> 1 then raise exception 'BAŞARISIZ 25: kalkan 5/1'; end if;
  if (select array_agg(key) from public.rozetler where uye = u) <> array['ilk_mac'] then raise exception 'BAŞARISIZ 25: rozetler temizlenmedi'; end if;
  if coalesce((select yildiz from public.cuzdan where uye = u), 0) <> 0 then raise exception 'BAŞARISIZ 25: dönüşüm yıldız verdi'; end if;
  if public.rozet_donustur() <> 0 then raise exception 'BAŞARISIZ 25: ikinci çağrı taşıdı'; end if;
  raise notice 'GEÇTİ 25: rozet dönüşümü';
end $$;
reset role;

-- 26) birleştirme: sayaçlar toplanır, kademe büyüğü, sıçrama yok; sonraki maç eşiği aşan sayacı yakalar
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('abababab-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('acacacac-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare r jsonb; x uuid := 'abababab-1111-1111-1111-111111111111'; y uuid := 'acacacac-1111-1111-1111-111111111111'; b jsonb;
  sifir jsonb := '{"artis":0,"esik":[100,200,300],"odul":[10,30,"bayrak:kurt"]}';
begin
  insert into public.basarilar (uye, key, sayac, kademe) values (x, 'kurtarici', 2, 1), (y, 'kurtarici', 2, 0);
  perform public.hesap_birlestir(x, y);
  if (select sayac from public.basarilar where uye = y and key = 'kurtarici') <> 4 or (select kademe from public.basarilar where uye = y and key = 'kurtarici') <> 1 then raise exception 'BAŞARISIZ 26: toplanmadı'; end if;
  if exists (select 1 from public.basarilar where uye = x) then raise exception 'BAŞARISIZ 26: eski satır kaldı'; end if;
  b := jsonb_build_object('mudavim', sifir, 'kurtarici', '{"artis":0,"esik":[1,3,30],"odul":[10,30,"sapka:hemsire"]}'::jsonb,
        'kalkan', sifir, 'golgeler', sifir, 'yalniz_kurt', sifir, 'son_isik', sifir, 'bekci', sifir, 'tuzak_ustasi', sifir, 'yildirim', sifir);
  r := public.mac_sonu(y, gen_random_uuid(), '{"tur":"yildiz","adet":0}', null, null, 0, 0, b);
  if r->'kademeler' <> '[{"key":"kurtarici","kademe":2,"odul":30}]'::jsonb then raise exception 'BAŞARISIZ 26: sonraki maç gümüşü vermedi: %', r; end if;
  if (select yildiz from public.cuzdan where uye = y) <> 30 then raise exception 'BAŞARISIZ 26: gümüş 30: %', (select yildiz from public.cuzdan where uye = y); end if;
  raise notice 'GEÇTİ 26: birleştirme toplar, kademe sonraki maçta';
end $$;
reset role;

-- 27) yetki: üye yalnız kendi başarılarını okur, yazamaz, dönüşümü çağıramaz; altın kozmetik satılmaz
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"acacacac-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select sayac from public.basarilar where uye = 'acacacac-1111-1111-1111-111111111111' and key = 'kurtarici') <> 4 then raise exception 'BAŞARISIZ 27: kendi satırını okuyamadı'; end if;
  if (select count(*) from public.basarilar where uye = 'eeeeeeee-1111-1111-1111-111111111111') <> 0 then raise exception 'BAŞARISIZ 27: başkasının satırını okudu'; end if;
  begin insert into public.basarilar (uye, key, sayac, kademe) values ('acacacac-1111-1111-1111-111111111111', 'bekci', 99, 3); raise exception 'BAŞARISIZ 27: istemci yazabildi';
  exception when insufficient_privilege then null; end;
  begin perform public.rozet_donustur(); raise exception 'BAŞARISIZ 27: istemci rozet_donustur çağırabildi';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare r jsonb; y uuid := 'acacacac-1111-1111-1111-111111111111'; begin
  update public.cuzdan set yildiz = 500 where uye = y;
  r := public.kozmetik_al(y, 'sapka:hemsire', 180);
  if r->>'hata' <> 'ozel' then raise exception 'BAŞARISIZ 27: altın satıldı: %', r; end if;
  r := public.kozmetik_al(y, 'bayrak:mektup', 70);
  if r->>'hata' <> 'ozel' then raise exception 'BAŞARISIZ 27: mektup satıldı: %', r; end if;
  r := public.kozmetik_al(y, 'ev:meydan-saati', 180);
  if r->>'hata' <> 'ozel' then raise exception 'BAŞARISIZ 27: mudavim altını satıldı: %', r; end if;
  r := public.kozmetik_al(y, 'ev:saat-kulesi', 180);
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'BAŞARISIZ 27: satılan Saat kulesi alınamadı (göç 013): %', r; end if;
  raise notice 'GEÇTİ 27: başarı yetkileri ve altın satılmaz';
end $$;
reset role;

-- 28) seri (göç 014): dün → +1 ve günün ilki büyür; aynı gün ikinci maç değişmez; boş gün → 1; tavan 10; bağlı değilse +5 ama sayılır;
--     tavana takılan maç seriyi işlemez; eski 8 parametreli çağrı seriyi işler, büyütmez
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('5e5e5e5e-0001-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seri1@ornek.com', now(), '{}', '{}', now(), now(), false),
       ('5e5e5e5e-0002-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-0003-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seri3@ornek.com', now(), '{}', '{}', now(), now(), false),
       ('5e5e5e5e-0004-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seri4@ornek.com', now(), '{}', '{}', now(), now(), false);
set local role service_role;
do $$ declare r jsonb; a uuid := '5e5e5e5e-0001-1111-1111-111111111111'; b uuid := '5e5e5e5e-0002-1111-1111-111111111111';
  c uuid := '5e5e5e5e-0003-1111-1111-111111111111'; d uuid := '5e5e5e5e-0004-1111-1111-111111111111';
  bugun date := (now() at time zone 'Europe/Istanbul')::date; od jsonb := '{"tur":"yildiz","adet":0}';
begin
  insert into public.seriler (uye, son_gun, seri, en_uzun) values (a, bugun - 1, 2, 2);
  r := public.mac_sonu(a, gen_random_uuid(), od, null, null, 0, 5, null, 1, 5);
  if (r->>'gunun_ilki')::int <> 7 or (r->>'seri')::int <> 3 then raise exception 'BAŞARISIZ 28: dün → seri 3, +7: %', r; end if;
  if (select en_uzun from public.seriler where uye = a) <> 3 or (select son_gun from public.seriler where uye = a) <> bugun then raise exception 'BAŞARISIZ 28: en_uzun/son_gun'; end if;
  r := public.mac_sonu(a, gen_random_uuid(), od, null, null, 0, 5, null, 1, 5);
  if (r->>'gunun_ilki')::int <> 0 or (r->>'seri')::int <> 3 then raise exception 'BAŞARISIZ 28: aynı gün ikinci maç: %', r; end if;
  update public.seriler set son_gun = bugun - 2 where uye = a; delete from public.kasalar where uye = a;
  r := public.mac_sonu(a, gen_random_uuid(), od, null, null, 0, 5, null, 1, 5);
  if (r->>'gunun_ilki')::int <> 5 or (r->>'seri')::int <> 1 or (select en_uzun from public.seriler where uye = a) <> 3 then raise exception 'BAŞARISIZ 28: boş gün → 1: %', r; end if;
  update public.seriler set son_gun = bugun - 1, seri = 9 where uye = a; delete from public.kasalar where uye = a;
  r := public.mac_sonu(a, gen_random_uuid(), od, null, null, 0, 5, null, 1, 5);
  if (r->>'gunun_ilki')::int <> 10 or (r->>'seri')::int <> 10 then raise exception 'BAŞARISIZ 28: tavan 10: %', r; end if;
  insert into public.seriler (uye, son_gun, seri, en_uzun) values (b, bugun - 1, 4, 4);
  r := public.mac_sonu(b, gen_random_uuid(), od, null, null, 0, 5, null, 1, 5);
  if (r->>'gunun_ilki')::int <> 5 or (r->>'seri')::int <> 5 then raise exception 'BAŞARISIZ 28: bağlı değil: +5, seri sayılır: %', r; end if;
  insert into public.kasalar (uye, oyun_id, odul) select c, gen_random_uuid(), '{"tavan":true}' from generate_series(1, 20);
  r := public.mac_sonu(c, gen_random_uuid(), od, null, null, 0, 5, null, 1, 5);
  if not (r->>'tavan')::boolean or exists (select 1 from public.seriler where uye = c) then raise exception 'BAŞARISIZ 28: tavanda seri işlendi: %', r; end if;
  insert into public.seriler (uye, son_gun, seri, en_uzun) values (d, bugun - 1, 2, 2);
  r := public.mac_sonu(d, gen_random_uuid(), od, null, null, 0, 5, null);
  if (r->>'gunun_ilki')::int <> 5 or (r->>'seri')::int <> 3 then raise exception 'BAŞARISIZ 28: eski çağrı: %', r; end if;
  if (public.envanter_oku(d)->'seri'->>'seri')::int <> 3 or public.envanter_oku(c)->'seri' <> 'null'::jsonb then raise exception 'BAŞARISIZ 28: envanter_oku seri'; end if;
  raise notice 'GEÇTİ 28: seri ve günün ilki';
end $$;
reset role;

-- 29) seri birleştirme (en yeni son_gun'un serisi, en_uzun büyüğü) ve yetki
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('5e5e5e5e-0005-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-0006-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare x uuid := '5e5e5e5e-0005-1111-1111-111111111111'; y uuid := '5e5e5e5e-0006-1111-1111-111111111111';
  bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  insert into public.seriler (uye, son_gun, seri, en_uzun) values (x, bugun - 3, 4, 6), (y, bugun - 1, 2, 2);
  perform public.hesap_birlestir(x, y);
  if (select (seri, en_uzun, son_gun) from public.seriler where uye = y) <> (2, 6, bugun - 1) then raise exception 'BAŞARISIZ 29: birleştirme: %', (select row(seri, en_uzun, son_gun) from public.seriler where uye = y); end if;
  if exists (select 1 from public.seriler where uye = x) then raise exception 'BAŞARISIZ 29: eski satır kaldı'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5e5e5e5e-0006-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.seriler) <> 1 then raise exception 'BAŞARISIZ 29: yalnız kendi satırını görmeli'; end if;
  begin update public.seriler set seri = 99; raise exception 'BAŞARISIZ 29: istemci yazabildi';
  exception when insufficient_privilege then null; end;
  raise notice 'GEÇTİ 29: seri birleştirme ve yetki';
end $$;
reset role;

rollback;
