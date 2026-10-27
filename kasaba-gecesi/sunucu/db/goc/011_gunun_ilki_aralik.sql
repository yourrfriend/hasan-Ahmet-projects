-- Göç 011 (2026-10-27): mac_sonu'da "günün ilk maçı" denetimi her satırı tarihe çevirmek yerine aralıkla bakar
-- (zaman >= bugünün başı, Europe/Istanbul); kasalar_uye_zaman_idx (uye, zaman desc) yalnız bugünün kasalarını okur. Davranış aynı; imza aynı.

create or replace function public.mac_sonu(p_uye uuid, p_oyun uuid, p_odul jsonb, p_rozetler text[], p_harcanan text, p_bonus int, p_gunluk int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_tavan boolean; v_donustu boolean := false; v_tur text; v_say int; v_yeni text[]; v_yildiz int; v_roz text[];
  v_ilk int := 0;
begin
  -- Göç 009: aynı üyenin eşzamanlı iki çağrısı aynı kilidi bekler; tavan sayımı ve kasa eklemesi kilit altında (20'yi aşamaz)
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  select count(*) >= 20 into v_tavan from public.kasalar where uye = p_uye and zaman > now() - interval '24 hours';
  -- göç 010/011: bugünün (Europe/Istanbul) ilk gerçek kasası mı (011: aralık koşulu, kasalar_uye_zaman_idx kullanılır) — kilit altında, kasa eklenmeden önce; tavan kasaları sayılmaz
  if not v_tavan and not exists (select 1 from public.kasalar where uye = p_uye
       and zaman >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')
       and not coalesce((odul ->> 'tavan')::boolean, false)) then v_ilk := greatest(coalesce(p_gunluk, 0), 0); end if;
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

revoke all on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int) from public, anon, authenticated;
grant execute on function public.mac_sonu(uuid, uuid, jsonb, text[], text, int, int) to service_role;
