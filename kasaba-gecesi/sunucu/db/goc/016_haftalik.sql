-- Göç 016 (2026-10-28): haftalık görevler (yıldız ekonomisi 3b). Tasarım: docs/superpowers/specs/2026-10-28-kasaba-gecesi-yildiz-3-gorev-design.md.
-- Geriye uyumlu: mac_sonu'ya varsayılanı null/0 olan p_gorev/p_gorev_bonus eklendi (eski çağrı görev saymaz); dönüşe 'gorevler'. envanter_oku 'hafta'; hesap_birlestir görevleri taşır.

create table if not exists public.haftalik_gorevler (
  uye uuid not null references auth.users(id) on delete cascade,
  hafta date not null,
  key text not null,
  sayac int not null default 0,
  tamam boolean not null default false,
  primary key (uye, hafta, key)
);
alter table public.haftalik_gorevler enable row level security;
revoke all on public.haftalik_gorevler from anon, authenticated;
grant select on public.haftalik_gorevler to authenticated;
drop policy if exists haftalik_gorevler_kendi_oku on public.haftalik_gorevler;
create policy haftalik_gorevler_kendi_oku on public.haftalik_gorevler for select to authenticated using (uye = (select auth.uid()));

drop function if exists public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb, int, int);
create or replace function public.mac_sonu(p_uye uuid, p_oyun uuid, p_odul jsonb, p_rozetler text[], p_harcanan text, p_bonus int, p_gunluk int default 0, p_basari jsonb default null, p_seri_artis int default 0, p_seri_tavan int default 0, p_gorev jsonb default null, p_gorev_bonus int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_tavan boolean; v_donustu boolean := false; v_tur text; v_say int; v_yeni text[]; v_yildiz int; v_roz text[];
  v_gorevler jsonb := '[]'::jsonb; v_hafta date; v_gs int; v_gt boolean; v_go jsonb; v_tamam int;
  v_ilk int := 0; v_ilk_mi boolean := false; v_seri int; v_son date; v_bagli boolean;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date; v_kademeler jsonb := '[]'::jsonb; v_key text; v_b jsonb; v_sayac int; v_eski int; v_yeni_k int; v_k int; v_odul jsonb;
  donusum constant jsonb := '{"kurtarici":"kurtarici","bekci":"bekci","tuzak_ustasi":"tuzak_ustasi","yildirim":"yildirim","hain_zafer":"golgeler","masum_zafer":"kalkan","sag_kalan":"son_isik","tek_kurt":"yalniz_kurt"}';
begin
  -- Göç 009: aynı üyenin eşzamanlı iki çağrısı aynı kilidi bekler; tavan sayımı ve kasa eklemesi kilit altında (20'yi aşamaz)
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  select count(*) >= 20 into v_tavan from public.kasalar where uye = p_uye and zaman > now() - interval '24 hours';
  -- göç 010/011: bugünün (Europe/Istanbul) ilk gerçek kasası mı (aralık koşulu, kasalar_uye_zaman_idx) — kilit altında, kasa eklenmeden önce; tavan kasaları sayılmaz
  if not v_tavan and not exists (select 1 from public.kasalar where uye = p_uye
       and zaman >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')
       and not coalesce((odul ->> 'tavan')::boolean, false)) then v_ilk_mi := true; v_ilk := greatest(coalesce(p_gunluk, 0), 0); end if;
  insert into public.kasalar (uye, oyun_id, odul) values (p_uye, p_oyun, case when v_tavan then '{"tavan":true}'::jsonb else p_odul end)
    on conflict (uye, oyun_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('tekrar', true); end if;
  -- göç 014: seri — bugünün ilk gerçek kasası (tavan değil; p_gunluk'tan bağımsız) seriyi işler: dün oynandıysa +1, daha eskiyse 1.
  -- Günün ilki yalnız bağlı hesapta büyür (bağlı = e-posta dolu ve doğrulanmış); miktar/tavan sunucudan (game.js YILDIZ_KAYNAK.seri), SQL sayı bilmez.
  select seri, son_gun into v_seri, v_son from public.seriler where uye = p_uye;
  if v_ilk_mi then
    v_seri := case when v_son = v_bugun then v_seri when v_son = v_bugun - 1 then v_seri + 1 else 1 end;
    insert into public.seriler (uye, son_gun, seri, en_uzun) values (p_uye, v_bugun, v_seri, v_seri)
      on conflict (uye) do update set son_gun = v_bugun, seri = v_seri, en_uzun = greatest(public.seriler.en_uzun, v_seri);
    select exists (select 1 from auth.users where id = p_uye and coalesce(email, '') <> '' and email_confirmed_at is not null) into v_bagli;
    if v_bagli and coalesce(p_seri_artis, 0) > 0 and coalesce(p_seri_tavan, 0) > 0 then
      v_ilk := v_ilk + least(greatest(v_seri - 1, 0) * p_seri_artis, p_seri_tavan);
    end if;
  end if;
  if p_harcanan is not null then
    update public.esyalar set adet = adet - 1 where uye = p_uye and key = p_harcanan and adet > 0;
  end if;
  if not v_tavan then
    v_tur := p_odul ->> 'tur';
    if v_tur = 'esya' then
      insert into public.esyalar (uye, key, adet) values (p_uye, p_odul ->> 'key', greatest(coalesce((p_odul ->> 'adet')::int, 1), 0))
        on conflict (uye, key) do update set adet = public.esyalar.adet + excluded.adet;
    elsif v_tur = 'yildiz' then
      update public.cuzdan set yildiz = yildiz + greatest(coalesce((p_odul ->> 'adet')::int, 0), 0) where uye = p_uye;
    elsif v_tur = 'kozmetik' then
      insert into public.kozmetikler (uye, key) values (p_uye, p_odul ->> 'key') on conflict (uye, key) do nothing;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        v_donustu := true;
        update public.cuzdan set yildiz = yildiz + greatest(coalesce((p_odul ->> 'donusum')::int, 0), 0) where uye = p_uye;
      end if;
    end if;
    if coalesce(p_bonus, 0) > 0 then update public.cuzdan set yildiz = yildiz + p_bonus where uye = p_uye; end if;
    if v_ilk > 0 then update public.cuzdan set yildiz = yildiz + v_ilk where uye = p_uye; end if;
  end if;
  -- göç 016: haftalık görevler — kasa yeni eklendiyse ve tavan yoksa; hedefe ilk ulaşınca ödül (bir kez), haftanın görevlerinin hepsi tamamsa bonus (bir kez).
  -- Görev/hedef/ödül sunucudan (game.js HAFTALIK); gun görevi bugünün ilk gerçek kasasından sayılır (artis yok sayılır). Hafta = Europe/Istanbul pazartesisi.
  if not v_tavan and p_gorev is not null and jsonb_typeof(p_gorev) = 'object' then
    v_hafta := v_bugun - (extract(isodow from v_bugun)::int - 1);
    for v_key, v_b in select * from jsonb_each(p_gorev) loop
      insert into public.haftalik_gorevler (uye, hafta, key) values (p_uye, v_hafta, v_key) on conflict do nothing;
      select sayac, tamam into v_gs, v_gt from public.haftalik_gorevler where uye = p_uye and hafta = v_hafta and key = v_key;
      v_gs := v_gs + case when v_key = 'gun' then (case when v_ilk_mi then 1 else 0 end) else greatest(coalesce((v_b ->> 'artis')::int, 0), 0) end;
      if not v_gt and v_gs >= coalesce((v_b ->> 'hedef')::int, 2147483647) then
        v_gt := true; v_go := v_b -> 'odul';
        update public.cuzdan set yildiz = yildiz + greatest(coalesce((v_go #>> '{}')::int, 0), 0) where uye = p_uye;
        v_gorevler := v_gorevler || jsonb_build_object('key', v_key, 'odul', v_go);
      end if;
      update public.haftalik_gorevler set sayac = v_gs, tamam = v_gt where uye = p_uye and hafta = v_hafta and key = v_key;
    end loop;
    select count(*) into v_tamam from public.haftalik_gorevler where uye = p_uye and hafta = v_hafta and tamam and p_gorev ? key;
    if v_tamam = (select count(*) from jsonb_object_keys(p_gorev)) and v_tamam > 0 and coalesce(p_gorev_bonus, 0) > 0
       and not exists (select 1 from public.haftalik_gorevler where uye = p_uye and hafta = v_hafta and key = 'hepsi') then
      insert into public.haftalik_gorevler (uye, hafta, key, sayac, tamam) values (p_uye, v_hafta, 'hepsi', 1, true);
      update public.cuzdan set yildiz = yildiz + p_gorev_bonus where uye = p_uye;
      v_gorevler := v_gorevler || jsonb_build_object('key', 'hepsi', 'odul', p_gorev_bonus);
    end if;
  end if;
  select count(*) into v_say from public.kasalar where uye = p_uye;
  -- göç 012: kademeli başarılar — yalnız kasa yeni eklendiyse (yukarıda), tavanda da (başarı o maçta gerçekten oldu; kasa/bonus zaten yok)
  if p_basari is null then
    -- eski kod: dönüşen rozetler ilgili sayaca +1; eşik bilinmediği için kademe yeni kodun ilk maçında hesaplanır
    insert into public.basarilar (uye, key, sayac, zaman) select p_uye, donusum ->> k, 1, now() from unnest(coalesce(p_rozetler, '{}'::text[])) k where donusum ? k
    on conflict (uye, key) do update set sayac = public.basarilar.sayac + 1, zaman = now();
  else
    for v_key, v_b in select * from jsonb_each(p_basari) loop
      insert into public.basarilar (uye, key) values (p_uye, v_key) on conflict (uye, key) do nothing;
      select sayac, kademe into v_sayac, v_eski from public.basarilar where uye = p_uye and key = v_key;
      v_sayac := case when v_key = 'mudavim' then v_say else v_sayac + greatest(coalesce((v_b ->> 'artis')::int, 0), 0) end;
      select count(*) into v_yeni_k from jsonb_array_elements_text(coalesce(v_b -> 'esik', '[]'::jsonb)) e where e::int <= v_sayac;
      -- aradaki her kademenin ödülü (bir maçta iki eşik birden geçilebilir: birleştirme/geçiş sonrası)
      if v_yeni_k > v_eski then
        for v_k in v_eski + 1 .. v_yeni_k loop
          v_odul := (v_b -> 'odul') -> (v_k - 1);
          if jsonb_typeof(v_odul) = 'number' then
            update public.cuzdan set yildiz = yildiz + greatest((v_odul #>> '{}')::int, 0) where uye = p_uye;
          elsif jsonb_typeof(v_odul) = 'string' then
            insert into public.kozmetikler (uye, key) values (p_uye, v_odul #>> '{}') on conflict (uye, key) do nothing;
          end if;
          v_kademeler := v_kademeler || jsonb_build_object('key', v_key, 'kademe', v_k, 'odul', v_odul);
        end loop;
      else v_yeni_k := v_eski; end if;
      update public.basarilar set sayac = v_sayac, kademe = v_yeni_k, zaman = case when v_yeni_k > v_eski then now() else zaman end where uye = p_uye and key = v_key;
    end loop;
  end if;
  -- rozetler: dönüşen anahtarlar hiç yazılmaz; ilk_mac eşik ≥ (birleştirme sayıyı sıçratabilir); PK tekilleştirir
  v_roz := (select coalesce(array_agg(k), '{}'::text[]) from unnest(coalesce(p_rozetler, '{}'::text[])) k where not donusum ? k)
           || case when v_say >= 1 then array['ilk_mac'] else '{}'::text[] end;
  with ek as (
    insert into public.rozetler (uye, key, oyun_id) select p_uye, k, p_oyun from unnest(v_roz) k
    on conflict (uye, key) do nothing returning key
  ) select coalesce(array_agg(key), '{}'::text[]) into v_yeni from ek;
  select yildiz into v_yildiz from public.cuzdan where uye = p_uye;
  return jsonb_build_object('odul', case when v_tavan then null else p_odul end, 'donustu', v_donustu, 'yildiz', v_yildiz,
                            'yeni_rozetler', to_jsonb(v_yeni), 'tavan', v_tavan, 'gunun_ilki', v_ilk, 'kademeler', v_kademeler, 'seri', coalesce(v_seri, 0), 'gorevler', v_gorevler);
end;
$$;
revoke all on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb, int, int, jsonb, int) from public, anon, authenticated;
grant execute on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb, int, int, jsonb, int) to service_role;

create or replace function public.envanter_oku(p_uye uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'yildiz', coalesce((select yildiz from public.cuzdan where uye = p_uye), 0),
    'esyalar', coalesce((select jsonb_object_agg(key, adet) from public.esyalar where uye = p_uye and adet > 0), '{}'::jsonb),
    'kozmetikler', coalesce((select jsonb_agg(key order by key) from public.kozmetikler where uye = p_uye), '[]'::jsonb),
    'bagli', exists (select 1 from auth.users where id = p_uye and coalesce(email, '') <> '' and email_confirmed_at is not null),
    'bagla_odulu', exists (select 1 from public.bagla_odulleri where uye = p_uye),
    'basarilar', coalesce((select jsonb_object_agg(key, jsonb_build_object('sayac', sayac, 'kademe', kademe)) from public.basarilar where uye = p_uye), '{}'::jsonb),
    'seri', (select jsonb_build_object('seri', seri, 'en_uzun', en_uzun, 'son_gun', son_gun) from public.seriler where uye = p_uye),
    'hafta', (select jsonb_build_object('hafta', h, 'gorevler', coalesce((select jsonb_object_agg(key, jsonb_build_object('sayac', sayac, 'tamam', tamam)) from public.haftalik_gorevler where uye = p_uye and hafta = h), '{}'::jsonb))
              from (select (now() at time zone 'Europe/Istanbul')::date - (extract(isodow from (now() at time zone 'Europe/Istanbul')::date)::int - 1) as h) w));
$$;
revoke all on function public.envanter_oku(uuid) from public, anon, authenticated;
grant execute on function public.envanter_oku(uuid) to service_role;

create or replace function public.hesap_birlestir(eski uuid, yeni uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ys date; v_yn int; v_yu int; v_es date; v_en int; v_eu int; v_ns date; v_nn int; v_os date; v_on int;
begin
  if eski is null or yeni is null or eski = yeni then
    raise exception 'hesap_birlestir: geçersiz kimlikler';
  end if;
  update public.oyun_oyunculari set uye = yeni where uye = eski;
  update public.kasabalar set sahip = yeni where sahip = eski;
  insert into public.kasaba_uyeleri (kasaba_id, uye, rol, katilma)
    select kasaba_id, yeni, rol, katilma from public.kasaba_uyeleri where uye = eski
  on conflict (kasaba_id, uye) do update
    set rol = case when excluded.rol = 'sahip' or public.kasaba_uyeleri.rol = 'sahip' then 'sahip' else 'uye' end,
        katilma = least(public.kasaba_uyeleri.katilma, excluded.katilma);
  delete from public.kasaba_uyeleri where uye = eski;
  insert into public.profiller (uye, ad, renk, sapka, guncellenme)
    select yeni, ad, renk, sapka, guncellenme from public.profiller where uye = eski
  on conflict (uye) do nothing;
  delete from public.profiller where uye = eski;
  -- ilerleme (008)
  insert into public.cuzdan (uye, yildiz) select yeni, yildiz from public.cuzdan where uye = eski
    on conflict (uye) do update set yildiz = public.cuzdan.yildiz + excluded.yildiz;
  delete from public.cuzdan where uye = eski;
  insert into public.esyalar (uye, key, adet) select yeni, key, adet from public.esyalar where uye = eski
    on conflict (uye, key) do update set adet = public.esyalar.adet + excluded.adet;
  delete from public.esyalar where uye = eski;
  insert into public.kozmetikler (uye, key, kazanma) select yeni, key, kazanma from public.kozmetikler where uye = eski
    on conflict (uye, key) do nothing;
  delete from public.kozmetikler where uye = eski;
  insert into public.rozetler (uye, key, oyun_id, kazanma) select yeni, key, oyun_id, kazanma from public.rozetler where uye = eski
    on conflict (uye, key) do nothing;
  delete from public.rozetler where uye = eski;
  insert into public.kasalar (uye, oyun_id, odul, zaman) select yeni, oyun_id, odul, zaman from public.kasalar where uye = eski
    on conflict (uye, oyun_id) do nothing;
  delete from public.kasalar where uye = eski;
  -- göç 012: başarılar
  insert into public.basarilar (uye, key, sayac, kademe, zaman) select yeni, key, sayac, kademe, zaman from public.basarilar where uye = eski
    on conflict (uye, key) do update set sayac = public.basarilar.sayac + excluded.sayac, kademe = greatest(public.basarilar.kademe, excluded.kademe),
      zaman = greatest(public.basarilar.zaman, excluded.zaman);
  delete from public.basarilar where uye = eski;
  -- göç 014/015: seri — iki serinin günleri bitişik ya da örtüşüyorsa tek seri sayılır (ikinci cihaz: eski bugün 1 + yeni dün 5 → 6);
  -- değilse en yeni son_gun'un serisi (kırılmış eski seri canlanmaz); en_uzun büyüğü
  select son_gun, seri, en_uzun into v_ys, v_yn, v_yu from public.seriler where uye = yeni;
  select son_gun, seri, en_uzun into v_es, v_en, v_eu from public.seriler where uye = eski;
  if v_es is not null then
    if v_ys is null then
      insert into public.seriler (uye, son_gun, seri, en_uzun) values (yeni, v_es, v_en, v_eu);
    else
      if v_es > v_ys then v_ns := v_es; v_nn := v_en; v_os := v_ys; v_on := v_yn; else v_ns := v_ys; v_nn := v_yn; v_os := v_es; v_on := v_en; end if;
      if v_os >= v_ns - v_nn then v_nn := v_ns - least(v_ns - v_nn + 1, v_os - v_on + 1) + 1; end if;
      update public.seriler set son_gun = v_ns, seri = v_nn, en_uzun = greatest(v_yu, v_eu, v_nn) where uye = yeni;
    end if;
  end if;
  delete from public.seriler where uye = eski;
  -- göç 016: haftalık görevler — aynı hafta/görevde sayaç toplanır, tamam biri doğruysa doğru; ödül verilmez (sonraki maç yakalar)
  insert into public.haftalik_gorevler (uye, hafta, key, sayac, tamam) select yeni, hafta, key, sayac, tamam from public.haftalik_gorevler where uye = eski
    on conflict (uye, hafta, key) do update set sayac = public.haftalik_gorevler.sayac + excluded.sayac, tamam = public.haftalik_gorevler.tamam or excluded.tamam;
  delete from public.haftalik_gorevler where uye = eski;
  -- göç 010: bağlama ödülü kaydı yeniye geçer; ikisi de ödül aldıysa fazla ödül (25 ⭐, yukarıda toplanan) geri alınır,
  -- eski adresin kaydı kalır (uye boşalır) — bir kişi birleştirmeyle iki ödül tutamaz
  if exists (select 1 from public.bagla_odulleri where uye = eski) then
    if exists (select 1 from public.bagla_odulleri where uye = yeni) then
      update public.cuzdan set yildiz = greatest(0, yildiz - 25) where uye = yeni;
      update public.bagla_odulleri set uye = null where uye = eski;
    else
      update public.bagla_odulleri set uye = yeni where uye = eski;
    end if;
  end if;
end;
$$;
revoke execute on function public.hesap_birlestir(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hesap_birlestir(uuid, uuid) to service_role;
