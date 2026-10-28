-- Göç 013 (2026-10-28): Müdavim altını `ev:saat-kulesi` yerine `ev:meydan-saati` (012 satılan "Saat kulesi" eviyle aynı anahtarı kullanmış,
-- kozmetik_al o evi 'ozel' diye reddediyordu). Yalnız kozmetik_al'ın satılmaz listesi yenilenir; liste game.js KOZMETIK ozel:'basari' ile aynı (game.test.js denetler).
create or replace function public.kozmetik_al(p_uye uuid, p_key text, p_fiyat int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_yildiz int;
  basari_ozel constant text[] := array['ev:meydan-saati', 'ev:surlu-konak', 'ev:karanlik-kule', 'bayrak:kurt', 'bayrak:mum', 'sapka:hemsire', 'sapka:kasket', 'bayrak:kapan', 'sapka:buyucu'];
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
