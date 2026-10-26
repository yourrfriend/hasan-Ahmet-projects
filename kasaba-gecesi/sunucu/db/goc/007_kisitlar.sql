-- Ertelenen küçükler 2 (2026-10-26): tutarlılık ve uzunluk kısıtları; kazanma() kullanılmayan parametreden arındı;
-- kasaba_tablo boş profil adını ('') oyuncu adıyla doldurur. Tasarım: docs/superpowers/specs/2026-10-26-kasaba-gecesi-ertelenen-kucukler-design.md
-- Uygulamadan önce canlıda ihlal sayıldı (2026-10-26: 0). Sınırlar istemci/sunucuyla uyumlu: kasaba adı 40 (kasaba.html maxLength), oyuncu adı 16 (server.js cleanName).

alter table public.oyunlar drop constraint if exists oyunlar_sonuc_bitis_tutarli;
alter table public.oyunlar add constraint oyunlar_sonuc_bitis_tutarli check ((sonuc = 'devam') = (bitis is null));

alter table public.kasabalar drop constraint if exists kasabalar_ad_uzunluk;
alter table public.kasabalar add constraint kasabalar_ad_uzunluk check (char_length(ad) <= 40);
alter table public.profiller drop constraint if exists profiller_ad_uzunluk;
alter table public.profiller add constraint profiller_ad_uzunluk check (char_length(ad) <= 16);
alter table public.oyun_oyunculari drop constraint if exists oyun_oyunculari_ad_uzunluk;
alter table public.oyun_oyunculari add constraint oyun_oyunculari_ad_uzunluk check (ad is null or char_length(ad) <= 16);

-- kazanma(): kazanan_metin hiç kullanılmıyordu → 5 parametre. Görünümler fonksiyona bağlı: önce düşer, sonra yeniden kurulur.
drop view if exists public.kasaba_tablo;
drop view if exists public.oyuncu_ozet;
drop function if exists public.kazanma(text, text, boolean, text, text, text);
create or replace function public.kazanma(
  takim text, rol_key text, sonunda_sag boolean, olum_sekli text, kazanan_takim text
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when rol_key = 'hayatta' then coalesce(sonunda_sag, false)                                  -- sona kadar yaşadıysa
    when rol_key = 'hortlak' then olum_sekli = 'asildi'                                          -- asıldıysa
    when rol_key in ('serikatil', 'bombaci', 'hirsiz', 'buyucu') and takim = 'neu'
      then kazanan_takim = 'neu' and coalesce(sonunda_sag, false)                               -- tek başına kazandıysa
    else takim = kazanan_takim                                                                   -- takımı kazandıysa
  end;
$$;

create view public.kasaba_tablo with (security_invoker = false) as
  select g.kasaba_id, g.kurulum, p.uye,
    coalesce(max(nullif(pr.ad, '')), max(p.ad)) as ad,                                           -- boş profil adı oyuncu adını ezmesin
    count(*)::int as oyun,
    (count(*) filter (where public.kazanma(p.takim, p.rol_key, p.sonunda_sag, p.olum_sekli, g.kazanan_takim)))::int as kazanma,
    round(100.0 * count(*) filter (where public.kazanma(p.takim, p.rol_key, p.sonunda_sag, p.olum_sekli, g.kazanan_takim)) / count(*))::int as kazanma_yuzde,
    mode() within group (order by p.rol_key) as en_cok_rol
  from public.oyun_oyunculari p
  join public.oyunlar g on g.id = p.oyun_id
  left join public.profiller pr on pr.uye = p.uye
  where p.uye is not null and g.sonuc = 'bitti' and g.kasaba_id is not null
    and (select private.kasaba_uyesi(g.kasaba_id))
  group by g.kasaba_id, g.kurulum, p.uye;
revoke all on public.kasaba_tablo from anon, authenticated;
grant select on public.kasaba_tablo to authenticated;

create view public.oyuncu_ozet with (security_invoker = false) as
  select p.uye, g.kurulum,
    count(*)::int as oyun,
    (count(*) filter (where public.kazanma(p.takim, p.rol_key, p.sonunda_sag, p.olum_sekli, g.kazanan_takim)))::int as kazanma,
    mode() within group (order by p.rol_key) as en_cok_rol,
    max(g.bitis) as son_oyun
  from public.oyun_oyunculari p
  join public.oyunlar g on g.id = p.oyun_id
  where p.uye = (select auth.uid()) and g.sonuc = 'bitti'
  group by p.uye, g.kurulum;
revoke all on public.oyuncu_ozet from anon, authenticated;
grant select on public.oyuncu_ozet to authenticated;
