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
insert into public.oyunlar (id, kasaba_id, kurulum, sonuc) values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'kasaba', 'devam');
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

rollback;
