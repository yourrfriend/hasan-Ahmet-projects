-- Göç 025 (2026-10-29): vitrin (yıldız ekonomisi 3e). envanter_oku ödenmiş setleri ve tek seferlik rozetleri taşır (sunucu vitrin sahipliğini doğrular).
-- Yalnız envanter_oku yenilenir (son gövde 019).

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
    'davet', public.davet_sayilari(p_uye),
    'setler', coalesce((select jsonb_agg(key order by key) from public.setler where uye = p_uye), '[]'::jsonb),
    'rozetler', coalesce((select jsonb_agg(key order by key) from public.rozetler where uye = p_uye), '[]'::jsonb),
    'hafta', (select jsonb_build_object('hafta', h, 'gorevler', coalesce((select jsonb_object_agg(key, jsonb_build_object('sayac', sayac, 'tamam', tamam)) from public.haftalik_gorevler where uye = p_uye and hafta = h), '{}'::jsonb))
              from (select (now() at time zone 'Europe/Istanbul')::date - (extract(isodow from (now() at time zone 'Europe/Istanbul')::date)::int - 1) as h) w));
$$;
revoke all on function public.envanter_oku(uuid) from public, anon, authenticated;
grant execute on function public.envanter_oku(uuid) to service_role;
