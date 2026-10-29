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
  if position('for update' in pg_get_functiondef('public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb, int, int, jsonb, int)'::regprocedure)) = 0 then raise exception 'BAŞARISIZ 15: göç 009 — mac_sonu cüzdan kilidi (for update) yok'; end if;
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
  -- tavana takılan maç kasa ve günün ilki vermez ama seriye sayılır (kullanıcı kararı 2026-10-29)
  if not (r->>'tavan')::boolean or (r->>'gunun_ilki')::int <> 0 or (select seri from public.seriler where uye = c) is distinct from 1 then raise exception 'BAŞARISIZ 28: tavanda seri sayılmalı, ödül yok: %', r; end if;
  insert into public.seriler (uye, son_gun, seri, en_uzun) values (d, bugun - 1, 2, 2);
  r := public.mac_sonu(d, gen_random_uuid(), od, null, null, 0, 5, null);
  if (r->>'gunun_ilki')::int <> 5 or (r->>'seri')::int <> 3 then raise exception 'BAŞARISIZ 28: eski çağrı: %', r; end if;
  if (public.envanter_oku(d)->'seri'->>'seri')::int <> 3 or (public.envanter_oku(c)->'seri'->>'seri')::int <> 1 then raise exception 'BAŞARISIZ 28: envanter_oku seri'; end if;
  raise notice 'GEÇTİ 28: seri ve günün ilki';
end $$;
reset role;

-- 29) seri birleştirme (en yeni son_gun'un serisi, en_uzun büyüğü) ve yetki
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('5e5e5e5e-0005-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-0006-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-0007-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-0008-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-0009-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('5e5e5e5e-000a-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare x uuid := '5e5e5e5e-0005-1111-1111-111111111111'; y uuid := '5e5e5e5e-0006-1111-1111-111111111111';
  bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  -- bitişik: x (eski) bugün-6..bugün-3, y (yeni) bugün-2..dün → tek seri 6
  insert into public.seriler (uye, son_gun, seri, en_uzun) values (x, bugun - 3, 4, 6), (y, bugun - 1, 2, 2);
  perform public.hesap_birlestir(x, y);
  if (select (seri, en_uzun, son_gun) from public.seriler where uye = y) <> (6, 6, bugun - 1) then raise exception 'BAŞARISIZ 29: birleştirme: %', (select row(seri, en_uzun, son_gun) from public.seriler where uye = y); end if;
  if exists (select 1 from public.seriler where uye = x) then raise exception 'BAŞARISIZ 29: eski satır kaldı'; end if;
  -- ikinci cihaz: eski (yeni telefon) bugün 1, yeni (hesap) dün 5 → bugün 6
  insert into public.seriler (uye, son_gun, seri, en_uzun) values ('5e5e5e5e-0007-1111-1111-111111111111', bugun, 1, 1), ('5e5e5e5e-0008-1111-1111-111111111111', bugun - 1, 5, 5);
  perform public.hesap_birlestir('5e5e5e5e-0007-1111-1111-111111111111', '5e5e5e5e-0008-1111-1111-111111111111');
  if (select (seri, en_uzun, son_gun) from public.seriler where uye = '5e5e5e5e-0008-1111-1111-111111111111') <> (6, 6, bugun) then raise exception 'BAŞARISIZ 29: ikinci cihaz serisi: %', (select row(seri, en_uzun, son_gun) from public.seriler where uye = '5e5e5e5e-0008-1111-1111-111111111111'); end if;
  -- kopuk: eski bugün-5'te bitmiş seri canlanmaz
  insert into public.seriler (uye, son_gun, seri, en_uzun) values ('5e5e5e5e-0009-1111-1111-111111111111', bugun - 5, 3, 3), ('5e5e5e5e-000a-1111-1111-111111111111', bugun - 1, 1, 4);
  perform public.hesap_birlestir('5e5e5e5e-0009-1111-1111-111111111111', '5e5e5e5e-000a-1111-1111-111111111111');
  if (select (seri, en_uzun, son_gun) from public.seriler where uye = '5e5e5e5e-000a-1111-1111-111111111111') <> (1, 4, bugun - 1) then raise exception 'BAŞARISIZ 29: kopuk seri canlandı'; end if;
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

-- 30) haftalık görev (göç 016): tamamlanınca bir kez ödül, tekrar sayılmaz, gun görevi bugünün ilk kasasından, üçü bitince bonus bir kez; tavanda sayılmaz
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values
       ('6a6a6a6a-0001-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('6a6a6a6a-0002-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('6a6a6a6a-0003-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true),
       ('6a6a6a6a-0004-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare r jsonb; u uuid := '6a6a6a6a-0001-1111-1111-111111111111'; t uuid := '6a6a6a6a-0002-1111-1111-111111111111'; g uuid := gen_random_uuid();
  od jsonb := '{"tur":"yildiz","adet":0}'; gr jsonb := '{"mac":{"artis":1,"hedef":2,"odul":15},"kazan":{"artis":1,"hedef":1,"odul":15},"gun":{"artis":0,"hedef":2,"odul":15}}';
begin
  r := public.mac_sonu(u, g, od, null, null, 0, 0, null, 0, 0, gr, 20);
  if r->'gorevler' <> '[{"key":"kazan","odul":15}]'::jsonb or (select yildiz from public.cuzdan where uye = u) <> 15 then raise exception 'BAŞARISIZ 30: ilk maç: %', r; end if;
  r := public.mac_sonu(u, g, od, null, null, 0, 0, null, 0, 0, gr, 20);
  if not coalesce((r->>'tekrar')::boolean, false) or (select sayac from public.haftalik_gorevler where uye = u and key = 'mac') <> 1 then raise exception 'BAŞARISIZ 30: tekrar saydı: %', r; end if;
  r := public.mac_sonu(u, gen_random_uuid(), od, null, null, 0, 0, null, 0, 0, gr, 20);
  if (select sayac from public.haftalik_gorevler where uye = u and key = 'kazan') <> 2 then raise exception 'BAŞARISIZ 30: kazan sayacı ilerlemedi'; end if;
  if r->'gorevler' <> '[{"key":"mac","odul":15}]'::jsonb or (select yildiz from public.cuzdan where uye = u) <> 30 then raise exception 'BAŞARISIZ 30: ikinci maç (kazan yeniden ödül vermez): %', r; end if;
  if (select sayac from public.haftalik_gorevler where uye = u and key = 'gun') <> 1 then raise exception 'BAŞARISIZ 30: aynı gün gun arttı'; end if;
  delete from public.kasalar where uye = u;
  r := public.mac_sonu(u, gen_random_uuid(), od, null, null, 0, 0, null, 0, 0, gr, 20);
  if r->'gorevler' <> '[{"key":"gun","odul":15},{"key":"hepsi","odul":20}]'::jsonb or (select yildiz from public.cuzdan where uye = u) <> 65 then raise exception 'BAŞARISIZ 30: gun + bonus: %', r; end if;
  r := public.mac_sonu(u, gen_random_uuid(), od, null, null, 0, 0, null, 0, 0, gr, 20);
  if r->'gorevler' <> '[]'::jsonb or (select yildiz from public.cuzdan where uye = u) <> 65 then raise exception 'BAŞARISIZ 30: bonus ikinci kez: %', r; end if;
  if (public.envanter_oku(u)->'hafta'->'gorevler'->'mac'->>'tamam')::boolean is not true then raise exception 'BAŞARISIZ 30: envanter_oku hafta'; end if;
  insert into public.kasalar (uye, oyun_id, odul) select t, gen_random_uuid(), '{"tavan":true}' from generate_series(1, 20);
  r := public.mac_sonu(t, gen_random_uuid(), od, null, null, 0, 0, null, 0, 0, gr, 20);
  if not (r->>'tavan')::boolean or exists (select 1 from public.haftalik_gorevler where uye = t) then raise exception 'BAŞARISIZ 30: tavanda sayıldı: %', r; end if;
  delete from public.kasalar where uye = t;
  r := public.mac_sonu(t, gen_random_uuid(), od, null, null, 0, 0, null, 0, 0);
  if exists (select 1 from public.haftalik_gorevler where uye = t) or r->'gorevler' <> '[]'::jsonb then raise exception 'BAŞARISIZ 30: eski çağrı (p_gorev null) saydı: %', r; end if;
  raise notice 'GEÇTİ 30: haftalık görev ve bonus';
end $$;
reset role;

-- 31) haftalık görev birleştirme (sayaç toplanır, tamam OR, ödül yok) ve yetki
set local role service_role;
do $$ declare x uuid := '6a6a6a6a-0003-1111-1111-111111111111'; y uuid := '6a6a6a6a-0004-1111-1111-111111111111';
  bugun date := (now() at time zone 'Europe/Istanbul')::date; h date;
begin
  h := bugun - (extract(isodow from bugun)::int - 1);
  insert into public.haftalik_gorevler (uye, hafta, key, sayac, tamam) values (x, h, 'mac', 1, false), (y, h, 'mac', 1, true);
  perform public.hesap_birlestir(x, y);
  if (select (sayac, tamam) from public.haftalik_gorevler where uye = y and key = 'mac') <> (2, true) then raise exception 'BAŞARISIZ 31: birleştirme'; end if;
  if exists (select 1 from public.haftalik_gorevler where uye = x) or coalesce((select yildiz from public.cuzdan where uye = y), 0) <> 0 then raise exception 'BAŞARISIZ 31: eski satır ya da ödül'; end if;
  -- birleştirmeyle hedefi geçen (tamam olmamış) sayaç sonraki maçta bir kez ödül alır
  insert into public.haftalik_gorevler (uye, hafta, key, sayac, tamam) values (x, h, 'kazan', 1, false), (y, h, 'kazan', 1, false);
  perform public.hesap_birlestir(x, y);
  if (select (sayac, tamam) from public.haftalik_gorevler where uye = y and key = 'kazan') <> (2, false) then raise exception 'BAŞARISIZ 31: kazan birleşimi'; end if;
  if public.mac_sonu(y, gen_random_uuid(), '{"tur":"yildiz","adet":0}', null, null, 0, 0, null, 0, 0, '{"kazan":{"artis":0,"hedef":2,"odul":15}}', 20)->'gorevler' <> '[{"key":"kazan","odul":15},{"key":"hepsi","odul":20}]'::jsonb then raise exception 'BAŞARISIZ 31: birleştirme sonrası yakalama'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6a6a6a6a-0004-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.haftalik_gorevler where uye <> '6a6a6a6a-0004-1111-1111-111111111111') <> 0 or (select count(*) from public.haftalik_gorevler) = 0 then raise exception 'BAŞARISIZ 31: yalnız kendi satırı'; end if;
  begin update public.haftalik_gorevler set sayac = 99; raise exception 'BAŞARISIZ 31: istemci yazabildi';
  exception when insufficient_privilege then null; end;
  raise notice 'GEÇTİ 31: haftalık görev birleştirme ve yetki';
end $$;
reset role;

-- 32) kayıp yanıt (göç 017): ikinci çağrı tekrar döner ama ilk sonucun kendisini de taşır (kasa kartı yeniden kurulabilir); istanbul_bugun
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('6a6a6a6a-0005-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare r1 jsonb; r2 jsonb; u uuid := '6a6a6a6a-0005-1111-1111-111111111111'; g uuid := gen_random_uuid(); begin
  r1 := public.mac_sonu(u, g, '{"tur":"yildiz","adet":3}', null, null, 0, 5, null, 1, 5, '{"mac":{"artis":1,"hedef":1,"odul":15}}', 20);
  r2 := public.mac_sonu(u, g, '{"tur":"yildiz","adet":3}', null, null, 0, 5, null, 1, 5, '{"mac":{"artis":1,"hedef":1,"odul":15}}', 20);
  if not coalesce((r2->>'tekrar')::boolean, false) or r2->'sonuc' <> r1 then raise exception 'BAŞARISIZ 32: tekrar ilk sonucu taşımıyor: % / %', r1, r2; end if;
  if (r1->'gorevler') <> '[{"key":"mac","odul":15},{"key":"hepsi","odul":20}]'::jsonb then raise exception 'BAŞARISIZ 32: ilk sonuç: %', r1; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
  if public.istanbul_bugun() <> (now() at time zone 'Europe/Istanbul')::date then raise exception 'BAŞARISIZ 32: istanbul_bugun'; end if;
  raise notice 'GEÇTİ 32: kayıp yanıt sonucu ve sunucu tarihi';
end $$;
reset role;

-- 33) davet (göç 019): kod bağlamada üretilir; kendine/bilinmeyen kod yazılmaz; ödül gelen bağlı + 1 gerçek maç olunca bir kez (iki sırada da);
--     tavan kasası sayılmaz; 3. ödülde Dostluk bayrağı; davet edene en çok 10 ödül, gelen yine alır
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('7d7d7d7d-0001-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'davetci@ornek.com', now(), '{}', '{}', now(), now(), false),
       ('7d7d7d7d-0002-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0003-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0004-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0005-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0006-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0007-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0008-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-0009-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-000a-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7d7d7d7d-000b-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true);
-- testte e-posta bağlama: auth.users'a service_role yazamaz, yetkili geçici yardımcı
create function pg_temp.test_bagla(u uuid, e text) returns void language sql security definer as $f$ update auth.users set email = e, email_confirmed_at = now() where id = u $f$;
create function pg_temp.test_sil(u uuid) returns void language sql security definer as $f$ delete from auth.users where id = u $f$;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values ('7e7e7e7e-0001-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7e7e7e7e-0002-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7e7e7e7e-0003-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7e7e7e7e-0004-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7e7e7e7e-0005-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7e7e7e7e-0006-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true),
       ('7e7e7e7e-0007-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '{}', '{}', now(), now(), true);
set local role service_role;
do $$ declare r jsonb; a uuid := '7d7d7d7d-0001-1111-1111-111111111111'; b uuid := '7d7d7d7d-0002-1111-1111-111111111111'; c uuid := '7d7d7d7d-0003-1111-1111-111111111111';
  d uuid := '7d7d7d7d-0004-1111-1111-111111111111'; e uuid := '7d7d7d7d-0005-1111-1111-111111111111'; kod text; od jsonb := '{"tur":"yildiz","adet":0}';
begin
  perform public.bagla_odulu(a);
  select k.kod into kod from public.davet_kodlari k where k.uye = a;
  if kod is null or kod !~ '^[A-HJKMNP-Z2-9]{8}$' then raise exception 'BAŞARISIZ 33: kod biçimi: %', kod; end if;
  if public.davet_kaydet(kod, a) then raise exception 'BAŞARISIZ 33: kendine davet'; end if;
  if public.davet_kaydet('ZZZZZZZZ', b) and kod <> 'ZZZZZZZZ' then raise exception 'BAŞARISIZ 33: bilinmeyen kod'; end if;
  if not public.davet_kaydet(lower(kod), b) then raise exception 'BAŞARISIZ 33: kayıt (küçük harf kabul)'; end if;
  if public.davet_kaydet(kod, b) then raise exception 'BAŞARISIZ 33: ikinci kayıt'; end if;
  r := public.mac_sonu(b, gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 0 then raise exception 'BAŞARISIZ 33: bağlı değilken ödül: %', r; end if;
  perform pg_temp.test_bagla(b, 'gelen-b@ornek.com');
  r := public.bagla_odulu(b);
  if (r->>'davet')::int <> 10 then raise exception 'BAŞARISIZ 33: maç sonra bağlama → ödül: %', r; end if;
  if (select yildiz from public.cuzdan where uye = a) <> 55 or (select yildiz from public.cuzdan where uye = b) <> 35 then raise exception 'BAŞARISIZ 33: cüzdanlar a=% b=%', (select yildiz from public.cuzdan where uye = a), (select yildiz from public.cuzdan where uye = b); end if;
  r := public.mac_sonu(b, gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 0 or (select yildiz from public.cuzdan where uye = a) <> 55 then raise exception 'BAŞARISIZ 33: ikinci ödül: %', r; end if;
  -- aynı e-posta ikinci kez davet ödülü almaz: B adresini değiştirir, adres yeni davetli F'ye bağlanır
  perform pg_temp.test_bagla(b, 'baska-b@ornek.com');
  perform public.davet_kaydet(kod, '7d7d7d7d-0008-1111-1111-111111111111'::uuid);
  perform pg_temp.test_bagla('7d7d7d7d-0008-1111-1111-111111111111', 'Gelen-B@ornek.com');
  r := public.mac_sonu('7d7d7d7d-0008-1111-1111-111111111111', gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 0 or (select yildiz from public.cuzdan where uye = a) <> 55 then raise exception 'BAŞARISIZ 33: aynı adresle ikinci davet ödülü: %', r; end if;
  -- göç 020: takma ad (+etiket, Gmail noktaları) aynı adres sayılır; başka hesapta bağlama ödülü almış adres yeni kişi değildir
  if public.davet_eposta_norm('A.b+x@GoogleMail.com') <> 'ab@gmail.com' or public.davet_eposta_norm('a.b+x@Ornek.com') <> 'a.b@ornek.com' then raise exception 'BAŞARISIZ 33: normalleştirme'; end if;
  perform public.davet_kaydet(kod, '7d7d7d7d-0009-1111-1111-111111111111'::uuid);
  perform pg_temp.test_bagla('7d7d7d7d-0009-1111-1111-111111111111', 'gelen-b+2@ornek.com');
  r := public.mac_sonu('7d7d7d7d-0009-1111-1111-111111111111', gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 0 or (select yildiz from public.cuzdan where uye = a) <> 55 then raise exception 'BAŞARISIZ 33: takma adla ikinci ödül: %', r; end if;
  insert into public.bagla_odulleri (eposta_ozet, uye) values (encode(extensions.digest(convert_to('eski-oyuncu@ornek.com', 'UTF8'), 'sha256'), 'hex'), null);
  perform public.davet_kaydet(kod, '7d7d7d7d-000a-1111-1111-111111111111'::uuid);
  perform pg_temp.test_bagla('7d7d7d7d-000a-1111-1111-111111111111', 'eski-oyuncu@ornek.com');
  r := public.mac_sonu('7d7d7d7d-000a-1111-1111-111111111111', gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 0 or (select yildiz from public.cuzdan where uye = a) <> 55 then raise exception 'BAŞARISIZ 33: eski oyuncunun adresi yeni kişi sayıldı: %', r; end if;
  -- göç 021: bağlı bir oyuncunun takma adı (davet edenin kendisi) yeni kişi sayılmaz
  perform public.davet_kaydet(kod, '7d7d7d7d-000b-1111-1111-111111111111'::uuid);
  perform pg_temp.test_bagla('7d7d7d7d-000b-1111-1111-111111111111', 'davetci+gizli@ornek.com');
  perform public.bagla_odulu('7d7d7d7d-000b-1111-1111-111111111111');
  r := public.mac_sonu('7d7d7d7d-000b-1111-1111-111111111111', gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 0 or (select yildiz from public.cuzdan where uye = a) <> 55 then raise exception 'BAŞARISIZ 33: bağlı oyuncunun takma adı davet sayıldı: %', r; end if;
  perform public.davet_kaydet(kod, c);
  perform pg_temp.test_bagla(c, 'gelen-c@ornek.com');
  insert into public.kasalar (uye, oyun_id, odul) values (c, gen_random_uuid(), '{"tavan":true}');
  r := public.bagla_odulu(c);
  if (r->>'davet')::int <> 0 then raise exception 'BAŞARISIZ 33: tavan kasası sayıldı: %', r; end if;
  r := public.mac_sonu(c, gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 10 or (select yildiz from public.cuzdan where uye = a) <> 85 then raise exception 'BAŞARISIZ 33: bağlama sonra maç → ödül: %', r; end if;
  if exists (select 1 from public.kozmetikler where uye = a and key = 'bayrak:dostluk') then raise exception 'BAŞARISIZ 33: kozmetik erken'; end if;
  perform public.davet_kaydet(kod, d);
  perform pg_temp.test_bagla(d, 'gelen-d@ornek.com');
  perform public.bagla_odulu(d); r := public.mac_sonu(d, gen_random_uuid(), od, null, null, 0, 0);
  if not exists (select 1 from public.kozmetikler where uye = a and key = 'bayrak:dostluk') or (select yildiz from public.cuzdan where uye = a) <> 115 then raise exception 'BAŞARISIZ 33: 3. davet kozmetik'; end if;
  insert into public.davetler (davet_edilen, davet_eden, odul_zaman)
    select ('7e7e7e7e-' || lpad(n::text, 4, '0') || '-1111-1111-111111111111')::uuid, a, now() from generate_series(1, 7) n;
  insert into public.davet_odulleri (eposta_ozet, davet_eden) select 'sahte-' || n, a from generate_series(1, 7) n;
  if (select count(*) from public.davet_odulleri where davet_eden = a) <> 10 then raise exception 'BAŞARISIZ 33: hazırlık 10'; end if;
  perform public.davet_kaydet(kod, e);
  perform pg_temp.test_bagla(e, 'gelen-e@ornek.com');
  perform public.bagla_odulu(e); r := public.mac_sonu(e, gen_random_uuid(), od, null, null, 0, 0);
  if (r->>'davet')::int <> 10 or (select yildiz from public.cuzdan where uye = a) <> 115 then raise exception 'BAŞARISIZ 33: tavan sonrası: gelen alır, davet eden almaz: %', r; end if;
  if (public.envanter_oku(a)->'davet'->>'odullu')::int <> 10 or public.envanter_oku(a)->'davet'->>'kod' <> kod then raise exception 'BAŞARISIZ 33: envanter_oku davet: %', public.envanter_oku(a)->'davet'; end if;
  raise notice 'GEÇTİ 33: davet kaydı ve ödül';
end $$;
reset role;

-- 34) davet birleştirme (davetçinin gizli sekme hesabı kendine katılırsa davet düşer; davet ettikleri yeniye geçer) ve yetki
set local role service_role;
do $$ declare a uuid := '7d7d7d7d-0001-1111-1111-111111111111'; s uuid := '7d7d7d7d-0006-1111-1111-111111111111'; x uuid := '7d7d7d7d-0007-1111-1111-111111111111'; kod text;
begin
  select k.kod into kod from public.davet_kodlari k where k.uye = a;
  if not public.davet_kaydet(kod, s) then raise exception 'BAŞARISIZ 34: kayıt'; end if;
  perform public.hesap_birlestir(s, a);
  if exists (select 1 from public.davetler where davet_edilen in (s, a)) then raise exception 'BAŞARISIZ 34: kendine davet birleştirmeyle kaldı'; end if;
  insert into public.davet_kodlari (uye, kod) values (x, 'XXXXXXX2');
  update public.davetler set davet_eden = x where davet_edilen = '7d7d7d7d-0002-1111-1111-111111111111';
  perform public.hesap_birlestir(x, a);
  if (select davet_eden from public.davetler where davet_edilen = '7d7d7d7d-0002-1111-1111-111111111111') <> a then raise exception 'BAŞARISIZ 34: davet eden yeniye geçmedi'; end if;
  if exists (select 1 from public.davet_kodlari dk where dk.uye = x or dk.kod = 'XXXXXXX2') then raise exception 'BAŞARISIZ 34: eski kod kaldı'; end if;
  -- ödenmiş adres, gelenin hesabı silinse de unutulmaz; davet edenin ödüllü sayısı düşmez
  perform pg_temp.test_sil('7d7d7d7d-0003-1111-1111-111111111111');
  if not exists (select 1 from public.davet_odulleri where eposta_ozet = encode(extensions.digest(convert_to('gelen-c@ornek.com', 'UTF8'), 'sha256'), 'hex')) then raise exception 'BAŞARISIZ 34: silinen hesabın ödül özeti gitti'; end if;
  if (public.davet_sayilari(a)->>'odullu')::int <> 10 then raise exception 'BAŞARISIZ 34: ödüllü sayı düştü'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7d7d7d7d-0001-1111-1111-111111111111","role":"authenticated"}', true);
do $$ declare j jsonb; begin
  begin perform count(*) from public.davetler; raise exception 'BAŞARISIZ 34: istemci davetler okudu';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.davet_odulleri; raise exception 'BAŞARISIZ 34: istemci davet_odulleri okudu';
  exception when insufficient_privilege then null; end;
  begin perform public.davet_kaydet('AAAAAAAA', '7d7d7d7d-0001-1111-1111-111111111111'); raise exception 'BAŞARISIZ 34: istemci davet_kaydet çağırdı';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.davet_kodlari where uye <> '7d7d7d7d-0001-1111-1111-111111111111') <> 0 then raise exception 'BAŞARISIZ 34: başkasının kodu görünüyor'; end if;
  j := public.davet_benim();
  if (j->>'odullu')::int <> 10 or (j->>'gelen')::int < 11 or j->>'kod' is null then raise exception 'BAŞARISIZ 34: davet_benim: %', j; end if;
  raise notice 'GEÇTİ 34: davet birleştirme ve yetki';
end $$;
reset role;

rollback;
