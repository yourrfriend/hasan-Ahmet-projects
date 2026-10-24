-- Kasaba Gecesi geçmişi: satır güvenliği (RLS) ve yetkiler. Tasarım §5.6.
-- Yazma yalnız service_role (RLS'yi geçer). authenticated yalnız okur; anon hiçbir şey göremez.
-- auth.uid() çağrıları (select auth.uid()) ile sarılı: satır başına değil, sorgu başına bir kez.

alter table public.profiller enable row level security;
alter table public.kasabalar enable row level security;
alter table public.kasaba_uyeleri enable row level security;
alter table public.oyunlar enable row level security;
alter table public.oyun_oyunculari enable row level security;
alter table public.olaylar enable row level security;

-- ---------- yardımcılar (private şema; sahibinin yetkisiyle, aramayı hep çağıranın kimliğine bağlar) ----------
create or replace function private.kasaba_uyesi(k uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.kasaba_uyeleri m where m.kasaba_id = k and m.uye = (select auth.uid())
  );
$$;

-- Oyunu görebilir: oyunun kayıtlı oyuncusu ya da oyunun kasabasının üyesi
create or replace function private.oyun_gorebilir(o uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.oyun_oyunculari p where p.oyun_id = o and p.uye = (select auth.uid()))
      or exists (
        select 1 from public.oyunlar g join public.kasaba_uyeleri m on m.kasaba_id = g.kasaba_id
        where g.id = o and m.uye = (select auth.uid())
      );
$$;

-- Politika ifadeleri sorguyu yapan rolle çalışır: authenticated'ın EXECUTE yetkisi kalır; anon ve public'ten alınır.
revoke execute on function private.kasaba_uyesi(uuid), private.oyun_gorebilir(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.kasaba_uyesi(uuid), private.oyun_gorebilir(uuid) to authenticated;

-- ---------- profiller: herkes (oturum açmış) okur, yalnız kendi satırını yazar ----------
grant select, insert, update on public.profiller to authenticated;
drop policy if exists profiller_oku on public.profiller;
create policy profiller_oku on public.profiller for select to authenticated using (true);
drop policy if exists profiller_kendi_ekle on public.profiller;
create policy profiller_kendi_ekle on public.profiller for insert to authenticated with check (uye = (select auth.uid()));
drop policy if exists profiller_kendi_guncelle on public.profiller;
create policy profiller_kendi_guncelle on public.profiller for update to authenticated
  using (uye = (select auth.uid())) with check (uye = (select auth.uid()));

-- ---------- kasabalar: üyeler okur; sahip yalnız adı değiştirir ----------
grant select on public.kasabalar to authenticated;
grant update (ad) on public.kasabalar to authenticated;
drop policy if exists kasabalar_uye_oku on public.kasabalar;
create policy kasabalar_uye_oku on public.kasabalar for select to authenticated using ((select private.kasaba_uyesi(id)));
drop policy if exists kasabalar_sahip_guncelle on public.kasabalar;
create policy kasabalar_sahip_guncelle on public.kasabalar for update to authenticated
  using (sahip = (select auth.uid())) with check (sahip = (select auth.uid()));

grant select on public.kasaba_uyeleri to authenticated;
drop policy if exists kasaba_uyeleri_oku on public.kasaba_uyeleri;
create policy kasaba_uyeleri_oku on public.kasaba_uyeleri for select to authenticated using ((select private.kasaba_uyesi(kasaba_id)));

-- ---------- oyunlar: oyuncular ve kasaba üyeleri okur ----------
grant select on public.oyunlar to authenticated;
drop policy if exists oyunlar_oku on public.oyunlar;
create policy oyunlar_oku on public.oyunlar for select to authenticated using ((select private.oyun_gorebilir(id)));

-- ---------- olaylar: aynı kişiler, yalnız bitmiş oyunlar (hikâye oyun sürerken sızmaz) ----------
grant select on public.olaylar to authenticated;
drop policy if exists olaylar_oku on public.olaylar;
create policy olaylar_oku on public.olaylar for select to authenticated using (
  (select private.oyun_gorebilir(oyun_id))
  and exists (select 1 from public.oyunlar g where g.id = oyun_id and g.bitis is not null)
);

-- ---------- oyun_oyunculari: taban tabloya authenticated için yetki YOK; görünüm rol sütunlarını bitişe kadar gizler ----------
create or replace view public.oyun_oyunculari_acik with (security_invoker = false) as
  select p.oyun_id, p.pub_id, p.uye, p.ad, p.renk, p.sapka, p.sonunda_sag, p.olum_gunu, p.olum_sekli,
    case when g.bitis is null then null else p.rol_key end as rol_key,
    case when g.bitis is null then null else p.takim end as takim,
    case when g.bitis is null then null else p.deli_gibi end as deli_gibi,
    case when g.bitis is null then null else p.calinan_rol end as calinan_rol
  from public.oyun_oyunculari p
  join public.oyunlar g on g.id = p.oyun_id
  where (select private.oyun_gorebilir(p.oyun_id));
revoke all on public.oyun_oyunculari_acik from anon, authenticated;
grant select on public.oyun_oyunculari_acik to authenticated;
