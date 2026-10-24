-- Kasaba Gecesi geçmişi: sıralama ve kişisel özet görünümleri. Tasarım §5.6.
-- Kazanma kuralı tek yerde (kazanma()); görünümler tanımlayan yetkisiyle çalışır ve üyelik süzgecini kendileri taşır.

create or replace function public.kazanma(
  takim text, rol_key text, sonunda_sag boolean, olum_sekli text, kazanan_takim text, kazanan_metin text
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when rol_key = 'hayatta' then coalesce(sonunda_sag, false)                                  -- sona kadar yaşadıysa
    when rol_key = 'hortlak' then olum_sekli = 'asildi'                                          -- asıldıysa
    when rol_key in ('serikatil', 'bombaci', 'hirsiz', 'buyucu') and takim = 'neu'
      then kazanan_takim = 'neu' and coalesce(sonunda_sag, false)                               -- tek başına kazandıysa
    else takim = kazanan_takim                                                                   -- takımı kazandıysa
  end;
$$;

create or replace view public.kasaba_tablo with (security_invoker = false) as
  select g.kasaba_id, g.kurulum, p.uye,
    coalesce(max(pr.ad), max(p.ad)) as ad,
    count(*)::int as oyun,
    (count(*) filter (where public.kazanma(p.takim, p.rol_key, p.sonunda_sag, p.olum_sekli, g.kazanan_takim, g.kazanan_metin)))::int as kazanma,
    round(100.0 * count(*) filter (where public.kazanma(p.takim, p.rol_key, p.sonunda_sag, p.olum_sekli, g.kazanan_takim, g.kazanan_metin)) / count(*))::int as kazanma_yuzde,
    mode() within group (order by p.rol_key) as en_cok_rol
  from public.oyun_oyunculari p
  join public.oyunlar g on g.id = p.oyun_id
  left join public.profiller pr on pr.uye = p.uye
  where p.uye is not null and g.sonuc = 'bitti' and g.kasaba_id is not null
    and (select private.kasaba_uyesi(g.kasaba_id))
  group by g.kasaba_id, g.kurulum, p.uye;
revoke all on public.kasaba_tablo from anon, authenticated;
grant select on public.kasaba_tablo to authenticated;

create or replace view public.oyuncu_ozet with (security_invoker = false) as
  select p.uye, g.kurulum,
    count(*)::int as oyun,
    (count(*) filter (where public.kazanma(p.takim, p.rol_key, p.sonunda_sag, p.olum_sekli, g.kazanan_takim, g.kazanan_metin)))::int as kazanma,
    mode() within group (order by p.rol_key) as en_cok_rol,
    max(g.bitis) as son_oyun
  from public.oyun_oyunculari p
  join public.oyunlar g on g.id = p.oyun_id
  where p.uye = (select auth.uid()) and g.sonuc = 'bitti'
  group by p.uye, g.kurulum;
revoke all on public.oyuncu_ozet from anon, authenticated;
grant select on public.oyuncu_ozet to authenticated;
