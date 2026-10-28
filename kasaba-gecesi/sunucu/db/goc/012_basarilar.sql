-- Göç 012 (2026-10-28): kademeli başarılar. Tasarım: docs/superpowers/specs/2026-10-28-kasaba-gecesi-yildiz-2-design.md.
-- Tablo basarilar (üye+anahtar: sayaç, kademe); mac_sonu'ya varsayılanı null olan p_basari eklendi (geriye uyumlu: eski 7 parametreli çağrı
-- aynen çalışır, dönüşen rozetler sayaca +1 yazılır, kademe yeni kodun ilk maçında hesaplanır), dönüşe 'kademeler'. Eski rozetler
-- rozet_donustur() ile bronz/gümüş kademeye taşınır (yıldız verilmez). envanter_oku 'basarilar'; kozmetik_al altınları satmaz; hesap_birlestir sayaçları toplar.
-- SQL eşik bilmez (p_basari her çağrıda 9 anahtarla taşır); bronz_esik yalnız dönüşümde. bronz_esik, donusum ve basari_ozel game.js ile aynı (game.test.js denetler).

create table if not exists public.basarilar (
  uye uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sayac int not null default 0,
  kademe int not null default 0,
  zaman timestamptz,
  primary key (uye, key)
);
alter table public.basarilar enable row level security;
revoke all on public.basarilar from anon, authenticated;
grant select on public.basarilar to authenticated;
drop policy if exists basarilar_kendi_oku on public.basarilar;
create policy basarilar_kendi_oku on public.basarilar for select to authenticated using (uye = (select auth.uid()));

-- Eski rozetleri başarıya taşır: olay/zafer rozetleri → bronz (sayaç = bronz eşiği), mac_10 → mudavim bronz, mac_50 → gümüş;
-- mudavim sayacı kasası olan herkese kasa sayısı. Taşınan rozet satırları silinir; cüzdana dokunulmaz. Yeniden çağrılabilir (taşınan satır sayısını döndürür).
create or replace function public.rozet_donustur()
returns int language plpgsql security definer set search_path = '' as $$
declare donusum constant jsonb := '{"kurtarici":"kurtarici","bekci":"bekci","tuzak_ustasi":"tuzak_ustasi","yildirim":"yildirim","hain_zafer":"golgeler","masum_zafer":"kalkan","sag_kalan":"son_isik","tek_kurt":"yalniz_kurt"}';
  bronz_esik constant jsonb := '{"kalkan":5,"golgeler":3,"yalniz_kurt":1,"son_isik":5,"kurtarici":3,"bekci":3,"tuzak_ustasi":3,"yildirim":3}';
  v_n int;
begin
  insert into public.basarilar (uye, key, sayac, kademe, zaman)
    select r.uye, donusum ->> r.key, (bronz_esik ->> (donusum ->> r.key))::int, 1, r.kazanma
    from public.rozetler r where donusum ? r.key
  on conflict (uye, key) do update set sayac = greatest(public.basarilar.sayac, excluded.sayac), kademe = greatest(public.basarilar.kademe, excluded.kademe),
    zaman = coalesce(public.basarilar.zaman, excluded.zaman);
  insert into public.basarilar (uye, key, sayac, kademe)
    select uye, 'mudavim', count(*), 0 from public.kasalar group by uye
  on conflict (uye, key) do update set sayac = excluded.sayac;
  update public.basarilar b set kademe = greatest(b.kademe, r.k), zaman = coalesce(b.zaman, r.z)
    from (select uye, max(case when key = 'mac_50' then 2 else 1 end) k, max(kazanma) z from public.rozetler where key in ('mac_10', 'mac_50') group by uye) r
    where b.uye = r.uye and b.key = 'mudavim';
  with s as (delete from public.rozetler where donusum ? key or key in ('mac_10', 'mac_50') returning 1) select count(*) into v_n from s;
  return v_n;
end;
$$;
revoke all on function public.rozet_donustur() from public, anon, authenticated;
grant execute on function public.rozet_donustur() to service_role;

drop function if exists public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int);
create or replace function public.mac_sonu(p_uye uuid, p_oyun uuid, p_odul jsonb, p_rozetler text[], p_harcanan text, p_bonus int, p_gunluk int default 0, p_basari jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_tavan boolean; v_donustu boolean := false; v_tur text; v_say int; v_yeni text[]; v_yildiz int; v_roz text[];
  v_ilk int := 0; v_kademeler jsonb := '[]'::jsonb; v_key text; v_b jsonb; v_sayac int; v_eski int; v_yeni_k int; v_k int; v_odul jsonb;
  donusum constant jsonb := '{"kurtarici":"kurtarici","bekci":"bekci","tuzak_ustasi":"tuzak_ustasi","yildirim":"yildirim","hain_zafer":"golgeler","masum_zafer":"kalkan","sag_kalan":"son_isik","tek_kurt":"yalniz_kurt"}';
begin
  -- Göç 009: aynı üyenin eşzamanlı iki çağrısı aynı kilidi bekler; tavan sayımı ve kasa eklemesi kilit altında (20'yi aşamaz)
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  select count(*) >= 20 into v_tavan from public.kasalar where uye = p_uye and zaman > now() - interval '24 hours';
  -- göç 010/011: bugünün (Europe/Istanbul) ilk gerçek kasası mı (aralık koşulu, kasalar_uye_zaman_idx) — kilit altında, kasa eklenmeden önce; tavan kasaları sayılmaz
  if not v_tavan and not exists (select 1 from public.kasalar where uye = p_uye
       and zaman >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')
       and not coalesce((odul ->> 'tavan')::boolean, false)) then v_ilk := greatest(coalesce(p_gunluk, 0), 0); end if;
  insert into public.kasalar (uye, oyun_id, odul) values (p_uye, p_oyun, case when v_tavan then '{"tavan":true}'::jsonb else p_odul end)
    on conflict (uye, oyun_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('tekrar', true); end if;
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
                            'yeni_rozetler', to_jsonb(v_yeni), 'tavan', v_tavan, 'gunun_ilki', v_ilk, 'kademeler', v_kademeler);
end;
$$;
revoke all on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int, jsonb) to service_role;

-- envanter_oku: başarılar {key:{sayac,kademe}}
create or replace function public.envanter_oku(p_uye uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'yildiz', coalesce((select yildiz from public.cuzdan where uye = p_uye), 0),
    'esyalar', coalesce((select jsonb_object_agg(key, adet) from public.esyalar where uye = p_uye and adet > 0), '{}'::jsonb),
    'kozmetikler', coalesce((select jsonb_agg(key order by key) from public.kozmetikler where uye = p_uye), '[]'::jsonb),
    'bagli', exists (select 1 from auth.users where id = p_uye and coalesce(email, '') <> '' and email_confirmed_at is not null),
    'bagla_odulu', exists (select 1 from public.bagla_odulleri where uye = p_uye),
    'basarilar', coalesce((select jsonb_object_agg(key, jsonb_build_object('sayac', sayac, 'kademe', kademe)) from public.basarilar where uye = p_uye), '{}'::jsonb));
$$;
revoke all on function public.envanter_oku(uuid) from public, anon, authenticated;
grant execute on function public.envanter_oku(uuid) to service_role;

-- kozmetik_al: bağlama ve başarı altını öğeleri satılamaz (sunucu da reddeder; burası ikinci kapı)
create or replace function public.kozmetik_al(p_uye uuid, p_key text, p_fiyat int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_yildiz int;
  basari_ozel constant text[] := array['ev:saat-kulesi', 'ev:surlu-konak', 'ev:karanlik-kule', 'bayrak:kurt', 'bayrak:mum', 'sapka:hemsire', 'sapka:kasket', 'bayrak:kapan', 'sapka:buyucu'];
begin
  if p_fiyat is null or p_fiyat <= 0 or p_key is null then return jsonb_build_object('hata', 'gecersiz'); end if;
  if p_key = 'bayrak:mektup' or p_key = any(basari_ozel) then return jsonb_build_object('hata', 'ozel'); end if;
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  select yildiz into v_yildiz from public.cuzdan where uye = p_uye for update;
  if exists (select 1 from public.kozmetikler where uye = p_uye and key = p_key) then
    return jsonb_build_object('hata', 'var', 'yildiz', v_yildiz);
  end if;
  if v_yildiz < p_fiyat then return jsonb_build_object('hata', 'yildiz', 'yildiz', v_yildiz); end if;
  update public.cuzdan set yildiz = yildiz - p_fiyat where uye = p_uye;
  insert into public.kozmetikler (uye, key) values (p_uye, p_key);
  return jsonb_build_object('ok', true, 'yildiz', v_yildiz - p_fiyat);
end;
$$;
revoke all on function public.kozmetik_al(uuid, text, int) from public, anon, authenticated;
grant execute on function public.kozmetik_al(uuid, text, int) to service_role;

-- Hesap birleştirme (010'un güncel hali + başarılar: sayaçlar toplanır, kademe büyüğü; eşik geçilirse kademe bir sonraki maçta)
create or replace function public.hesap_birlestir(eski uuid, yeni uuid)
returns void language plpgsql security definer set search_path = '' as $$
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

-- mevcut rozetler bir kez taşınır (yıldız yok)
select public.rozet_donustur();
