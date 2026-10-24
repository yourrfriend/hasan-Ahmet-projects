-- Kasaba Gecesi geçmişi: tablolar.
-- Tasarım: docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md §5.3–5.4
-- Kurallar: küçük harf adlar, timestamptz, text, FK sütunlarına indeks, yazma yalnız service_role (RLS: 002).
-- Supabase, postgres'in oluşturduğu nesnelere anon/authenticated/service_role için varsayılan yetki verir;
-- bu yüzden her tablodan sonra anon ve authenticated yetkileri kaldırılır, gerekenler 002'de geri verilir.

create schema if not exists private;                       -- RLS yardımcı fonksiyonları (API'ye açılmaz)
revoke all on schema private from public, anon, authenticated;

-- Oyuncu profili: uuid = Supabase Auth kullanıcısı (anonim de olabilir)
create table if not exists public.profiller (
  uye uuid primary key references auth.users(id) on delete cascade,
  ad text not null default '',
  renk text,
  sapka text,
  guncellenme timestamptz not null default now()
);
revoke all on public.profiller from anon, authenticated;

-- Kasaba: ev sahibinin grubu; oyunlar ona yazılır, sıralama onun içinde
create table if not exists public.kasabalar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  sahip uuid not null references auth.users(id) on delete cascade,
  olusturma timestamptz not null default now()
);
create index if not exists kasabalar_sahip_idx on public.kasabalar (sahip);
revoke all on public.kasabalar from anon, authenticated;

create table if not exists public.kasaba_uyeleri (
  kasaba_id uuid not null references public.kasabalar(id) on delete cascade,
  uye uuid not null references auth.users(id) on delete cascade,
  rol text not null check (rol in ('sahip', 'uye')),
  katilma timestamptz not null default now(),
  primary key (kasaba_id, uye)
);
create index if not exists kasaba_uyeleri_uye_idx on public.kasaba_uyeleri (uye);   -- RLS: "üyesi olduğum kasabalar"
revoke all on public.kasaba_uyeleri from anon, authenticated;

-- Oyun: kimliği oyun sunucusu üretir (uuid v4; yazma hacmi küçük, sıralı kimlik gerekmez)
create table if not exists public.oyunlar (
  id uuid primary key,
  kasaba_id uuid references public.kasabalar(id) on delete set null,
  kurulum text not null,                                   -- kur.sh kurulum adı: kasaba, kasaba-test
  oda_kodu text,
  baslama timestamptz not null default now(),
  bitis timestamptz,
  sonuc text not null default 'devam' check (sonuc in ('devam', 'bitti', 'iptal')),
  kazanan_takim text,
  kazanan_metin text,
  oyuncu_sayisi int,
  ayarlar jsonb
);
create index if not exists oyunlar_kasaba_baslama_idx on public.oyunlar (kasaba_id, baslama desc);
create index if not exists oyunlar_kurulum_baslama_idx on public.oyunlar (kurulum, baslama desc);
create index if not exists oyunlar_devam_idx on public.oyunlar (baslama) where sonuc = 'devam';   -- eski "devam" temizliği
revoke all on public.oyunlar from anon, authenticated;

-- Oyundaki oyuncular: pub_id oyun içi açık kimlik, uye kalıcı kimlik (misafirde null)
create table if not exists public.oyun_oyunculari (
  oyun_id uuid not null references public.oyunlar(id) on delete cascade,
  pub_id text not null,
  uye uuid references auth.users(id) on delete set null,
  ad text,
  renk text,
  sapka text,
  rol_key text,                                            -- gizli: oyun bitene kadar görünüm null döner
  takim text,
  deli_gibi text,
  calinan_rol text,
  sonunda_sag boolean,
  olum_gunu int,
  olum_sekli text,
  primary key (oyun_id, pub_id)
);
create index if not exists oyun_oyunculari_uye_idx on public.oyun_oyunculari (uye) where uye is not null;
revoke all on public.oyun_oyunculari from anon, authenticated;

-- Olay günlüğü: hikâye, özet ve istatistiğin kaynağı (game.js logEv; tasarım §5.4)
create table if not exists public.olaylar (
  oyun_id uuid not null references public.oyunlar(id) on delete cascade,
  sira int not null,
  gun int,
  faz text,
  tur text not null,
  veri jsonb not null,
  primary key (oyun_id, sira)
);
revoke all on public.olaylar from anon, authenticated;
