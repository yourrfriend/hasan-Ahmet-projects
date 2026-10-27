-- Yıldız ekonomisi 1 (2026-10-27): günün ilk maçı (+5, Europe/Istanbul takvim günü) ve bir kerelik e-posta bağlama ödülü (+25 ⭐, bayrak:mektup).
-- Tasarım: docs/superpowers/specs/2026-10-27-kasaba-gecesi-yildiz-1-design.md. Geriye uyumlu: mac_sonu imzası aynı, yalnız dönüşe 'gunun_ilki';
-- envanter_oku dönüşüne 'bagli', 'bagla_odulu'. Miktarlar game.js YILDIZ_KAYNAK ile aynı (game.test.js denetler).

create or replace function public.mac_sonu(p_uye uuid, p_oyun uuid, p_odul jsonb, p_rozetler text[], p_harcanan text, p_bonus int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_tavan boolean; v_donustu boolean := false; v_tur text; v_say int; v_yeni text[]; v_yildiz int; v_roz text[];
  v_ilk int := 0; gunun_ilki_miktar constant int := 5;
begin
  -- Göç 009: aynı üyenin eşzamanlı iki çağrısı aynı kilidi bekler; tavan sayımı ve kasa eklemesi kilit altında (20'yi aşamaz)
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  select count(*) >= 20 into v_tavan from public.kasalar where uye = p_uye and zaman > now() - interval '24 hours';
  -- göç 010: bugünün (Europe/Istanbul) ilk gerçek kasası mı — kilit altında, kasa eklenmeden önce; tavan kasaları sayılmaz
  if not v_tavan and not exists (select 1 from public.kasalar where uye = p_uye
       and (zaman at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date
       and not coalesce((odul ->> 'tavan')::boolean, false)) then v_ilk := gunun_ilki_miktar; end if;
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
    if v_ilk > 0 then update public.cuzdan set yildiz = yildiz + v_ilk where uye = p_uye; end if;
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
                            'yeni_rozetler', to_jsonb(v_yeni), 'tavan', v_tavan, 'gunun_ilki', v_ilk);
end;
$$;

revoke all on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int) from public, anon, authenticated;
grant execute on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int) to service_role;

-- Bağlama ödülü kaydı: e-posta özeti başına bir satır; hesap silinse de kalır (aynı adres ikinci kez alamaz). Yalnız RPC yazar/okur.
create table if not exists public.bagla_odulleri (
  eposta_ozet text primary key,
  uye uuid unique references auth.users(id) on delete set null,
  zaman timestamptz not null default now()
);
alter table public.bagla_odulleri enable row level security;
revoke all on public.bagla_odulleri from anon, authenticated;

create or replace function public.bagla_odulu(p_uye uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_eposta text; v_onay timestamptz; v_ozet text; v_yildiz int; bagla_miktar constant int := 25;
begin
  select email, email_confirmed_at into v_eposta, v_onay from auth.users where id = p_uye;
  if v_eposta is null or v_eposta = '' or v_onay is null then return jsonb_build_object('hata', 'bagli_degil'); end if;
  v_ozet := encode(extensions.digest(convert_to(lower(v_eposta), 'UTF8'), 'sha256'), 'hex');
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  if exists (select 1 from public.bagla_odulleri where uye = p_uye or eposta_ozet = v_ozet) then return jsonb_build_object('tekrar', true); end if;
  insert into public.bagla_odulleri (eposta_ozet, uye) values (v_ozet, p_uye);
  update public.cuzdan set yildiz = yildiz + bagla_miktar where uye = p_uye returning yildiz into v_yildiz;
  insert into public.kozmetikler (uye, key) values (p_uye, 'bayrak:mektup') on conflict (uye, key) do nothing;
  return jsonb_build_object('ok', true, 'yildiz', v_yildiz);
end;
$$;
revoke all on function public.bagla_odulu(uuid) from public, anon, authenticated;
grant execute on function public.bagla_odulu(uuid) to service_role;

-- envanter_oku: bağlılık bayrakları (bağlı = e-posta dolu ve doğrulanmış; is_anonymous'a bakılmaz)
create or replace function public.envanter_oku(p_uye uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'yildiz', coalesce((select yildiz from public.cuzdan where uye = p_uye), 0),
    'esyalar', coalesce((select jsonb_object_agg(key, adet) from public.esyalar where uye = p_uye and adet > 0), '{}'::jsonb),
    'kozmetikler', coalesce((select jsonb_agg(key order by key) from public.kozmetikler where uye = p_uye), '[]'::jsonb),
    'bagli', exists (select 1 from auth.users where id = p_uye and coalesce(email, '') <> '' and email_confirmed_at is not null),
    'bagla_odulu', exists (select 1 from public.bagla_odulleri where uye = p_uye));
$$;
revoke all on function public.envanter_oku(uuid) from public, anon, authenticated;
grant execute on function public.envanter_oku(uuid) to service_role;

-- kozmetik_al: yalnız bağlamayla verilen öğe satılamaz (sunucu da reddeder; burası ikinci kapı)
create or replace function public.kozmetik_al(p_uye uuid, p_key text, p_fiyat int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_yildiz int;
begin
  if p_fiyat is null or p_fiyat <= 0 or p_key is null then return jsonb_build_object('hata', 'gecersiz'); end if;
  if p_key = 'bayrak:mektup' then return jsonb_build_object('hata', 'ozel'); end if;
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

-- Hesap birleştirme (008'in güncel hali + bağlama ödülü kaydı)
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
  -- göç 010: bağlama ödülü kaydı yeniye geçer (yeninin kaydı yoksa); "bir kez" kuralı birleştirmeden sonra da geçerli
  if not exists (select 1 from public.bagla_odulleri where uye = yeni) then
    update public.bagla_odulleri set uye = yeni where uye = eski;
  end if;
end;
$$;
revoke execute on function public.hesap_birlestir(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hesap_birlestir(uuid, uuid) to service_role;
