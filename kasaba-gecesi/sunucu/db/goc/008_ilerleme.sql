-- İlerleme ve eşya modu (2026-10-26): yıldız, eşyalar, kozmetikler, rozetler, maç sonu kasaları.
-- Tasarım: docs/superpowers/specs/2026-10-26-kasaba-gecesi-ilerleme-esya-design.md §5.3, §5.7.
-- İlke: oyuncu yalnız KENDİ satırlarını okur; yazma yalnız service_role'ün çağırdığı RPC'lerle (bakiye istemciden yazılamaz).
-- Ödül/fiyat/dönüşüm değerleri game.js katalogundan sunucu tarafından gelir (tek kaynak); SQL yalnız uygular.

create table if not exists public.cuzdan (
  uye uuid primary key references auth.users(id) on delete cascade,
  yildiz int not null default 0 check (yildiz >= 0)
);
create table if not exists public.esyalar (
  uye uuid not null references auth.users(id) on delete cascade,
  key text not null,
  adet int not null default 0 check (adet >= 0),
  primary key (uye, key)
);
create table if not exists public.kozmetikler (
  uye uuid not null references auth.users(id) on delete cascade,
  key text not null,                                         -- 'tur:anahtar' (sapka:tac, bayrak:mavi, efekt:yildiz)
  kazanma timestamptz not null default now(),
  primary key (uye, key)
);
create table if not exists public.rozetler (
  uye uuid not null references auth.users(id) on delete cascade,
  key text not null,
  oyun_id uuid,
  kazanma timestamptz not null default now(),
  primary key (uye, key)
);
create table if not exists public.kasalar (                 -- maç başına bir kasa (idempotent); oyunlar'a bağlı değil (kayıt kuyruğu sonra yazabilir)
  uye uuid not null references auth.users(id) on delete cascade,
  oyun_id uuid not null,
  odul jsonb,
  zaman timestamptz not null default now(),
  primary key (uye, oyun_id)
);
create index if not exists kasalar_uye_zaman_idx on public.kasalar (uye, zaman desc);

do $$ declare t text; begin
  foreach t in array array['cuzdan','esyalar','kozmetikler','rozetler','kasalar'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_kendi_oku', t);
    execute format('create policy %I on public.%I for select to authenticated using (uye = (select auth.uid()))', t || '_kendi_oku', t);
  end loop;
end $$;

-- Maç sonu: kasa (ödül), harcanan eşya, kazanan bonusu, rozetler. (uye, oyun) başına bir kez.
-- 24 saatte 20 kasadan sonra ödül verilmez (kayıt yine yazılır, rozetler yine verilir): çok sekmeyle toplama sınırı.
create or replace function public.mac_sonu(p_uye uuid, p_oyun uuid, p_odul jsonb, p_rozetler text[], p_harcanan text, p_bonus int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_tavan boolean; v_donustu boolean := false; v_tur text; v_say int; v_yeni text[]; v_yildiz int; v_roz text[];
begin
  select count(*) >= 20 into v_tavan from public.kasalar where uye = p_uye and zaman > now() - interval '24 hours';
  insert into public.kasalar (uye, oyun_id, odul) values (p_uye, p_oyun, case when v_tavan then '{"tavan":true}'::jsonb else p_odul end)
    on conflict (uye, oyun_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('tekrar', true); end if;
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
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
  end if;
  select count(*) into v_say from public.kasalar where uye = p_uye;
  -- eşik ≥ (birleştirme sayıyı sıçratabilir); rozetler PK tekilleştirir
  v_roz := coalesce(p_rozetler, '{}'::text[]) || case when v_say >= 1 then array['ilk_mac'] else '{}'::text[] end
           || case when v_say >= 10 then array['mac_10'] else '{}'::text[] end || case when v_say >= 50 then array['mac_50'] else '{}'::text[] end;
  with ek as (
    insert into public.rozetler (uye, key, oyun_id) select p_uye, k, p_oyun from unnest(v_roz) k
    on conflict (uye, key) do nothing returning key
  ) select coalesce(array_agg(key), '{}'::text[]) into v_yeni from ek;
  select yildiz into v_yildiz from public.cuzdan where uye = p_uye;
  return jsonb_build_object('odul', case when v_tavan then null else p_odul end, 'donustu', v_donustu, 'yildiz', v_yildiz,
                            'yeni_rozetler', to_jsonb(v_yeni), 'tavan', v_tavan);
end;
$$;

-- Dükkân: yıldızla kozmetik al (fiyat game.js katalogundan sunucuyla gelir). Cüzdan satırı kilitlenir: eşzamanlı alımda çift harcama yok.
create or replace function public.kozmetik_al(p_uye uuid, p_key text, p_fiyat int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_yildiz int;
begin
  if p_fiyat is null or p_fiyat <= 0 or p_key is null then return jsonb_build_object('hata', 'gecersiz'); end if;
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

-- Sunucunun join'de okuduğu özet (görünüm doğrulaması ve taşınacak eşya).
create or replace function public.envanter_oku(p_uye uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'yildiz', coalesce((select yildiz from public.cuzdan where uye = p_uye), 0),
    'esyalar', coalesce((select jsonb_object_agg(key, adet) from public.esyalar where uye = p_uye and adet > 0), '{}'::jsonb),
    'kozmetikler', coalesce((select jsonb_agg(key order by key) from public.kozmetikler where uye = p_uye), '[]'::jsonb));
$$;

revoke execute on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int) from public, anon, authenticated;
revoke execute on function public.kozmetik_al(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.envanter_oku(uuid) from public, anon, authenticated;
grant execute on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int) to service_role;
grant execute on function public.kozmetik_al(uuid, text, int) to service_role;
grant execute on function public.envanter_oku(uuid) to service_role;

-- Hesap birleştirme (004'ün güncel hali): ilerleme de taşınır; eşya adetleri ve yıldız toplanır.
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
end;
$$;
revoke execute on function public.hesap_birlestir(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hesap_birlestir(uuid, uuid) to service_role;
