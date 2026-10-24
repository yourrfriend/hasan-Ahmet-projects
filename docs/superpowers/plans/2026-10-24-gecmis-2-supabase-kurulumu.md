# Geçmiş 2/6 — Supabase Kurulumu, Dış Kapı, Şema ve Yedek Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ionos'ta oyuna ait, ayrı bir Supabase kurulumu: resmi Docker paketi `/opt/supabase-kasaba` altında, yalnız `127.0.0.1`'de dinler; `https://kasaba-api.munupixi.com` Cloudflare tüneli + Caddy üzerinden yalnız API yollarını dışarı açar; veritabanı şeması (tablolar, RLS, görünümler, `hesap_birlestir`) repodaki göçlerle uygulanır; günlük yedek alınır.

**Architecture:** Kurulum ve işletme betikleri repoda `kasaba-gecesi/sunucu/db/` altında durur ve sunucuda root olarak çalıştırılır (`kur.sh` gibi, ama ondan bağımsız). Supabase'in kendi `setup.sh`'si paketi indirir ve gizli anahtarları üretir; bizim `kur-supabase.sh` üstüne `.env` ayarlarını, port bağlarını (`!override` ile `127.0.0.1`) ve GoTrue bayraklarını koyup yığını başlatır. Caddy parçası `db/caddy.sh` ile `kur.sh`'nin kip mantığına uyarak yazılır. Şema `db/goc/*.sql`, `db/uygula.sh` ile `supabase-db` konteynerinde `psql` üzerinden uygulanır ve `goc_gecmisi` tablosunda izlenir; `db/test.sql` RLS senaryolarını aynı yolla çalıştırır.

**Tech Stack:** Supabase self-hosted (resmi `docker/` paketi, son `self-hosted/v*` etiketi; Envoy api-gw, GoTrue, PostgREST, Postgres 17, Supavisor, Studio), Docker 29 + compose 5.5 (ionos'ta var), Caddy (tünel kipi), bash, psql.

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md` (§5.2 kimlik ayarları, §5.3, §5.4 şema, §5.6 RLS ve görünümler, §5.8 kurulum, §5.9 RLS testi, §6 aşama 2, §7)

## Global Constraints

- Her şey ionos'ta, `/opt/supabase-kasaba` altında; mevcut Plesk/Apache, Grafana (3000), oyun kurulumları (8080, 8787, 8788) ve `retracted-authors` (netcup'ta) etkilenmez.
- Hiçbir Supabase portu dışarıya açılmaz: tüm yayınlanan portlar `127.0.0.1`'e bağlı (`ss -tln` ile kanıtlanır). Dış erişim yalnız Caddy → tünel; Studio (`/`) ve `pg-meta` (`/pg/`) dışarıdan **erişilemez**.
- Gizli anahtarlar (`.env`, `run.sh secrets` çıktısı) sohbete, commit'e ya da günlüğe yazılmaz; doğrulamalar HTTP durum koduyla yapılır. `.env` modu `600`.
- Dış ad: `kasaba-api.munupixi.com` (tek seviyeli; spec §5.8). `SITE_URL=https://kasaba.munupixi.com`, `ADDITIONAL_REDIRECT_URLS=https://kasaba-test.munupixi.com`.
- GoTrue: `ENABLE_ANONYMOUS_USERS=true`, `JWT_EXPIRY=604800`, `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`, e-posta kaydı kapalı (`ENABLE_EMAIL_SIGNUP=false`), SMTP yok.
- Şema adları Türkçe ve spec'teki gibi; yazma yalnız `service_role`; `olaylar` ve rol sütunları yalnız `bitis` dolu oyunlar için okunur.
- Sunucuda değişiklik yapan her komut önce planda yazdığı gibi gösterilir; betikler idempotent (ikinci çalıştırma zarar vermez).
- Sunucu betikleri repodan çalışır: sunucuda bir adım çalıştırmadan önce ilgili dosyalar commit'lenip `origin/gecmis`'e push'lanır ve sunucudaki klon `git pull --ff-only` ile güncellenir.
- Commit mesajları İngilizce, sonunda `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Sunucu yeniden başlayınca** yığın kendiliğinden kalkar (`restart: unless-stopped` paketten gelir) ve Caddy parçası yerinde kalır. → Task 1 (doğrulama: `docker compose ps` restart politikası), Task 2.
2. **Anonim kullanıcı akışı**: `POST /auth/v1/signup` boş gövdeyle anonim kullanıcı döner (`is_anonymous:true`); e-posta ile kayıt reddedilir. → Task 1 Step 5, Task 3 test.
3. **RLS sızıntısı**: oyunun oyuncusu olmayan ve kasaba üyesi olmayan biri hiçbir oyun satırı göremez; oyuncu olan biri bitmemiş oyunun `olaylar`'ını ve `rol_key`'ini göremez. → Task 3 `test.sql`.
4. **Yedekten dönüş**: alınan dosya `pg_restore --list` ile okunur; geri yükleme komutu README'de. → Task 4.
5. **Caddy kipi**: `supabase.caddy` `kur.sh --kip https`'ye geçilince de doğru üretilir (`db/caddy.sh` kipi `.sunucu.env`'den okur). → Task 2 (iki kip için `caddy validate`).

---

### Task 1: `db/kur-supabase.sh` — paketi kur, ayarla, başlat

**Files:**
- Create: `kasaba-gecesi/sunucu/db/kur-supabase.sh` (bash, `set -euo pipefail`, root ister)
- Create: `kasaba-gecesi/sunucu/db/docker-compose.kasaba.yml` (override)
- Test: sunucuda doğrulama komutları (aşağıda)

**Interfaces:**
- Produces: `/opt/supabase-kasaba/` (paket + `.env` + `docker-compose.kasaba.yml` kopyası), çalışan yığın; `.env` içinde `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` (Task 3 ve sonraki aşamalar `sh run.sh secrets` ya da `.env`'den okur).
- Betik parametreleri: `kur-supabase.sh [--dizin /opt/supabase-kasaba] [--alan kasaba-api.munupixi.com] [--site https://kasaba.munupixi.com]`.

`docker-compose.kasaba.yml` içeriği (tam):

```yaml
# Kasaba Gecesi: Supabase yalnız yerelde dinler (dış kapı Caddy+tünel), anonim kullanıcı ve kimlik bağlama açık.
services:
  api-gw:
    ports: !override
      - "127.0.0.1:8000:8000/tcp"
  supavisor:
    ports: !override
      - "127.0.0.1:5432:5432"
      - "127.0.0.1:6543:6543"
  auth:
    environment:
      GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: "true"
```

`kur-supabase.sh` adımları (sırayla; her adım tekrar çalıştırılabilir):

1. `apt-get install -y -qq jq openssl curl ca-certificates` (eksikse).
2. Dizin yoksa: `cd /opt && curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh | sh -s -- -y --skip-deps --project-dir supabase-kasaba` (paket + gizli anahtarlar; `.supabase-version` yazılır). Varsa bu adım atlanır (sürüm `update.sh` ile ayrı güncellenir).
3. Override dosyasını dizine kopyala; `.env`'de `COMPOSE_FILE=docker-compose.yml:docker-compose.kasaba.yml` yap (`sh run.sh config add docker-compose.kasaba.yml` ile).
4. `.env` değerlerini `sed -i` ile yaz (anahtar varsa değiştir, yoksa ekle): `SUPABASE_PUBLIC_URL=https://ALAN`, `API_EXTERNAL_URL=https://ALAN/auth/v1`, `SITE_URL=SITE`, `ADDITIONAL_REDIRECT_URLS=https://kasaba-test.munupixi.com`, `JWT_EXPIRY=604800`, `ENABLE_ANONYMOUS_USERS=true`, `ENABLE_EMAIL_SIGNUP=false`, `ENABLE_EMAIL_AUTOCONFIRM=false`, `DISABLE_SIGNUP=false`, `STUDIO_DEFAULT_PROJECT=Kasaba Gecesi`, `STUDIO_DEFAULT_ORGANIZATION=munupixi`. `chmod 600 .env`.
5. `sh run.sh pull && sh run.sh start` (`docker compose up -d --wait`).
6. Sağlık: 60 sn'ye kadar `curl -fsS http://127.0.0.1:8000/auth/v1/health` dene; `docker compose ps --format json` içinde `unhealthy`/`exited` yoksa "Hazır" yaz, aksi halde `docker compose ps` çıktısını basıp `exit 1`.
7. Sonunda özet: dizin, sürüm (`.supabase-version`), dinlenen portlar (`ss -tln | grep -E ':(8000|5432|6543) '`), "Studio: ssh -L 8000:127.0.0.1:8000 ionos → http://localhost:8000 (kullanıcı/şifre: sh run.sh secrets)".

- [ ] **Step 1: Betiği ve override'ı yaz**; yerelde `bash -n kur-supabase.sh`; override için `docker compose -f …/docker-compose.yml -f docker-compose.kasaba.yml config` **sunucuda** çalışacak (yerelde Docker yok).

- [ ] **Step 2: Kurulum öncesi durum (başarısız olması beklenen kontrol)**

Run: `ssh ionos 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/auth/v1/health; echo; ls /opt/supabase-kasaba 2>&1 | head -1'`
Expected: `000` ve `No such file or directory`.

- [ ] **Step 3: Betiği sunucuya kopyala ve çalıştır** (repo sunucuda `gecmis` dalında: `git pull` sonrası `sudo kasaba-gecesi/sunucu/db/kur-supabase.sh`)

Run: `ssh ionos 'cd /opt/src/hasan-Ahmet-projects && git pull -q --ff-only && sudo kasaba-gecesi/sunucu/db/kur-supabase.sh 2>&1 | grep -v -E "^\s*$" | tail -25'`
Expected: son satırlarda `Hazır`, sürüm ve yalnız `127.0.0.1:` ile başlayan port satırları. Süre: imaj indirme 2–6 dk.

- [ ] **Step 4: Port ve sağlık kanıtı**

Run: `ssh ionos 'ss -tln | grep -E ":(8000|5432|6543|3000) " ; cd /opt/supabase-kasaba && docker compose ps --format "{{.Name}} {{.Status}}"'`
Expected: 8000/5432/6543 yalnız `127.0.0.1`; 3000 hâlâ Grafana (docker-proxy, önceki gibi); tüm konteynerler `Up … (healthy)` (imgproxy/functions `Up` olabilir).

- [ ] **Step 5: Anonim kullanıcı ve e-posta kaydı davranışı** (anahtar değerleri ekrana basılmaz)

Run: `ssh ionos 'cd /opt/supabase-kasaba && K=$(grep ^SUPABASE_PUBLISHABLE_KEY= .env | cut -d= -f2); curl -s -o /tmp/a.json -w "anon:%{http_code} " -X POST http://127.0.0.1:8000/auth/v1/signup -H "apikey: $K" -H "Content-Type: application/json" -d "{}"; jq -r ".user.is_anonymous" /tmp/a.json; curl -s -o /dev/null -w "eposta:%{http_code}\n" -X POST http://127.0.0.1:8000/auth/v1/signup -H "apikey: $K" -H "Content-Type: application/json" -d "{\"email\":\"a@b.co\",\"password\":\"Xx12345678\"}"; rm -f /tmp/a.json'`
Expected: `anon:200 true` ve `eposta:4xx` (422 ya da 400: e-posta kaydı kapalı).

- [ ] **Step 6: İdempotentlik** — betiği ikinci kez çalıştır.

Run: `ssh ionos 'sudo /opt/src/hasan-Ahmet-projects/kasaba-gecesi/sunucu/db/kur-supabase.sh 2>&1 | tail -3'`
Expected: yine `Hazır`; `docker compose ps` konteyner yaşları sıfırlanmamış (yeniden yaratılmadı).

- [ ] **Step 7: Commit**

```bash
git add kasaba-gecesi/sunucu/db/kur-supabase.sh kasaba-gecesi/sunucu/db/docker-compose.kasaba.yml
git commit -m "Supabase: self-hosted stack for the game on ionos, local-only ports"
```

---

### Task 2: `db/caddy.sh` — dış kapı (yalnız API yolları)

**Files:**
- Create: `kasaba-gecesi/sunucu/db/caddy.sh`
- Test: dış `curl` kontrolleri

**Interfaces:**
- Produces: `/etc/caddy/games/supabase.caddy`. Kip `/etc/games/.sunucu.env` (`KIP`, `TUNEL_PORT`) — `kur.sh`'nin yazdığı dosya; yoksa `https` varsayılır.
- Parça (tünel kipi):

```
http://kasaba-api.munupixi.com:8080 {
	bind 127.0.0.1
	@api path /auth/* /rest/* /realtime/* /storage/*
	handle @api {
		reverse_proxy 127.0.0.1:8000
	}
	handle {
		respond 404
	}
}
```
`https` kipinde ilk satır `kasaba-api.munupixi.com {` ve `bind` satırı yok. Betik: dosyayı yazar, `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`, `systemctl reload caddy`. Parametre: `--alan` (varsayılan `kasaba-api.munupixi.com`), `--port` (8000).

- [ ] **Step 1: Önce dış durum** — `curl -s -o /dev/null -w "%{http_code}\n" https://kasaba-api.munupixi.com/auth/v1/health` → Expected: `404` (Caddy'de parça yok; tünel `*.munupixi.com`'u 8080'e yolluyor).
- [ ] **Step 2: Betiği yaz**, `bash -n`.
- [ ] **Step 3: Sunucuda çalıştır**: `ssh ionos 'cd /opt/src/hasan-Ahmet-projects && git pull -q --ff-only && sudo kasaba-gecesi/sunucu/db/caddy.sh'` → Expected: `Caddy: kasaba-api.munupixi.com → 127.0.0.1:8000 (kip tunel)` ve reload hatasız.
- [ ] **Step 4: Dış doğrulama**

Run: `for p in /auth/v1/health /rest/v1/ / /pg/ /project/default; do printf "%-22s " $p; curl -s -o /dev/null -w "%{http_code}\n" -m 15 "https://kasaba-api.munupixi.com$p"; done`
Expected: `/auth/v1/health 200`, `/rest/v1/ 401` (apikey yok) ya da `200`, `/ 404`, `/pg/ 404`, `/project/default 404`.

- [ ] **Step 5: Diğer kip için sözdizimi** — sunucuda geçici dizine `KIP=https` ile üretip `caddy validate` (sadece üretim; `/etc/caddy`'ye yazmadan: betik `--yalnizca-yaz DOSYA` seçeneğiyle). Expected: `Valid configuration`.
- [ ] **Step 6: Commit** — `git commit -m "Supabase: Caddy snippet exposes only the API paths through the tunnel"`

---

### Task 3: Şema göçleri, `db/uygula.sh`, RLS testleri

**Files:**
- Create: `kasaba-gecesi/sunucu/db/goc/001_tablolar.sql`, `002_rls.sql`, `003_gorunumler.sql`, `004_hesap_birlestir.sql`
- Create: `kasaba-gecesi/sunucu/db/uygula.sh` (`[--test]`), `kasaba-gecesi/sunucu/db/test.sql`

**Interfaces (şema; spec §5.3, §5.4, §5.6):**

`001_tablolar.sql` (hepsi `public`; `uuid` için `gen_random_uuid()`):
- `goc_gecmisi(ad text primary key, uygulama timestamptz not null default now())` — `uygula.sh` yönetir.
- `profiller(uye uuid primary key references auth.users(id) on delete cascade, ad text not null default '', renk text, sapka text, guncellenme timestamptz not null default now())`
- `kasabalar(id uuid primary key default gen_random_uuid(), ad text not null, sahip uuid not null references auth.users(id), olusturma timestamptz not null default now())`
- `kasaba_uyeleri(kasaba_id uuid references kasabalar(id) on delete cascade, uye uuid references auth.users(id) on delete cascade, rol text not null check (rol in ('sahip','uye')), katilma timestamptz not null default now(), primary key (kasaba_id, uye))`
- `oyunlar(id uuid primary key, kasaba_id uuid references kasabalar(id), kurulum text not null, oda_kodu text, baslama timestamptz not null default now(), bitis timestamptz, sonuc text not null default 'devam' check (sonuc in ('devam','bitti','iptal')), kazanan_takim text, kazanan_metin text, oyuncu_sayisi int, ayarlar jsonb)`; indeks `(kasaba_id, baslama desc)`, `(kurulum, baslama desc)`.
- `oyun_oyunculari(oyun_id uuid references oyunlar(id) on delete cascade, pub_id text not null, uye uuid references auth.users(id) on delete set null, ad text, renk text, sapka text, rol_key text, takim text, deli_gibi text, calinan_rol text, sonunda_sag boolean, olum_gunu int, olum_sekli text, primary key (oyun_id, pub_id))`; indeks `(uye)`.
- `olaylar(oyun_id uuid references oyunlar(id) on delete cascade, sira int not null, gun int, faz text, tur text not null, veri jsonb not null, primary key (oyun_id, sira))`.

`002_rls.sql`:
- Tüm tablolarda `enable row level security`; `anon`'a hiçbir yetki; `authenticated`'a yalnız `select` (ve `profiller` için kendi satırına `insert/update`). `service_role` RLS'yi zaten geçer (yazma yolu).
- Yardımcı: `oyun_gorebilir(o uuid) returns boolean security definer stable`: `exists(select 1 from oyun_oyunculari where oyun_id=o and uye=auth.uid()) or exists(select 1 from oyunlar g join kasaba_uyeleri k on k.kasaba_id=g.kasaba_id where g.id=o and k.uye=auth.uid())`.
- Politikalar: `profiller` select: `auth.uid() is not null`; insert/update: `uye=auth.uid()`. `kasabalar`/`kasaba_uyeleri` select: üye (`exists kasaba_uyeleri where uye=auth.uid()`); `kasabalar` update: `sahip=auth.uid()` (yalnız `ad`). `oyunlar` select: `oyun_gorebilir(id)`. `olaylar` select: `oyun_gorebilir(oyun_id) and exists(select 1 from oyunlar where id=oyun_id and bitis is not null)`. `oyun_oyunculari` select: `oyun_gorebilir(oyun_id)` — rol sütunları doğrudan değil, görünümden okunur: taban tablodan `authenticated` için `select` yetkisi **verilmez**; görünüm verir.
- `oyun_oyunculari_acik` görünümü, **tanımlayan yetkisiyle** (`security_invoker` kapalı; sahibi `postgres`), kendi süzgeciyle: `where oyun_gorebilir(oyun_id)`; sütunlar: tüm sütunlar, ama `rol_key, takim, deli_gibi, calinan_rol` için `case when (select bitis from oyunlar g where g.id=oyun_id) is null then null else <sütun> end`. `grant select on oyun_oyunculari_acik to authenticated`; taban tablo `oyun_oyunculari`'na `authenticated` için **hiç yetki yok** (gizli sütunlara dolaylı yol kalmasın). Aynı yaklaşım `olaylar` için gerekmez: satır politikası `bitis` koşulunu taşır.

`003_gorunumler.sql` (ikisi de tanımlayan yetkisiyle, üyelik süzgeci içinde; `kurulum` sütunu taşır):
- `kazanma(takim text, rol_key text, sonunda_sag boolean, olum_sekli text, kazanan_takim text, kazanan_metin text) returns boolean immutable`: spec §5.6 kuralı — `rol_key='hayatta'` → `sonunda_sag`; `rol_key='hortlak'` → `olum_sekli='asildi'`; `rol_key in ('serikatil','bombaci','hirsiz','buyucu')` ve `takim='neu'` → `kazanan_takim='neu'`; aksi halde `takim=kazanan_takim`. Hırsız rol çaldıysa `takim`/`rol_key` sütunları zaten son hali taşır (`calinan_rol` yalnız gösterim).
- `kasaba_tablo(kasaba_id, kurulum, uye, ad, oyun, kazanma, kazanma_yuzde, en_cok_rol)`; yalnız `sonuc='bitti'`; `where exists(select 1 from kasaba_uyeleri k where k.kasaba_id=… and k.uye=auth.uid())`.
- `oyuncu_ozet(uye, kurulum, oyun, kazanma, en_cok_rol, son_oyun)`; `where uye=auth.uid()`.

`004_hesap_birlestir.sql`: `hesap_birlestir(eski uuid, yeni uuid) returns void security definer`: `update oyun_oyunculari set uye=yeni where uye=eski`; `update kasabalar set sahip=yeni where sahip=eski`; `kasaba_uyeleri`: `eski` satırlarını `yeni`'ye taşı, çakışanda `rol='sahip'` baskın, sonra `eski` satırlarını sil; `profiller`: `yeni` yoksa `eski`'yi yeniden adlandır, varsa `eski`'yi sil. `revoke all on function … from public, anon, authenticated` (yalnız `service_role`).

`uygula.sh`: `/opt/src/.../db/goc/*.sql`'i sırayla, `goc_gecmisi`'nde olmayanları `docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres` ile tek transaction'da uygular ve kaydeder; `--test` ile `test.sql`'i çalıştırır (çıktıda `BAŞARISIZ` geçerse `exit 1`).

`test.sql` (bir transaction, sonunda `rollback`; `auth.users`'a iki test kullanıcısı ekler; `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` ile kimlik değiştirir; her kontrol `do $$ … raise exception 'BAŞARISIZ: …' $$`):
1. Oyuncu olmayan ve üye olmayan U2: `oyunlar` 0 satır.
2. Oyuncu U1, oyun `devam`: `oyunlar` 1 satır; `olaylar` 0 satır; `oyun_oyunculari_acik.rol_key` null.
3. Aynı oyun `bitis` dolu: `olaylar` ≥1 satır; `rol_key` dolu.
4. Kasaba üyesi U2 (oyuncu değil): `oyunlar` 1 satır; `kasaba_tablo` kendi kasabasını gösterir, başka kasabayı göstermez.
5. `authenticated` olarak `insert into oyunlar` → hata (yetki yok).
6. `hesap_birlestir(U1,U2)` servis olarak: `oyun_oyunculari.uye` U2; iki üyelik tekilleşti, `sahip` baskın; `authenticated` olarak çağrı → yetki hatası.
7. `anon` rolü: `profiller` 0 satır / yetki hatası.

- [ ] **Step 1: Göçleri, `uygula.sh` ve `test.sql`'i yaz**; yerelde `bash -n uygula.sh`.
- [ ] **Step 2: Test önce başarısız olmalı** — `ssh ionos '... sudo db/uygula.sh --test'` göçler uygulanmadan: Expected: `relation "oyunlar" does not exist` ile `BAŞARISIZ`/`exit 1`.
- [ ] **Step 3: Uygula** — `ssh ionos '... sudo db/uygula.sh'` → Expected: `4 göç uygulandı`, ikinci çalıştırmada `0 göç uygulandı`.
- [ ] **Step 4: Testler** — `ssh ionos '... sudo db/uygula.sh --test'` → Expected: `RLS testleri: 7/7 geçti`.
- [ ] **Step 5: Uçtan uca okuma** — dışarıdan publishable key ile `GET https://kasaba-api.munupixi.com/rest/v1/kasabalar?select=id` → Expected: `200` ve `[]` (anon için RLS/yetki boş döner ya da `401/403`; her iki durumda veri sızmaz).
- [ ] **Step 6: Commit** — `git commit -m "Supabase: schema, RLS, views and account merge for the game history"`

---

### Task 4: Yedek (`db/yedek.sh` + systemd timer)

**Files:**
- Create: `kasaba-gecesi/sunucu/db/yedek.sh`, `kasaba-gecesi/sunucu/db/supabase-kasaba-yedek.service`, `…-yedek.timer`
- Modify: `kasaba-gecesi/sunucu/db/kur-supabase.sh` (adım: timer'ı kurar ve etkinleştirir)

**Interfaces:**
- `yedek.sh [DIZIN=/var/backups/supabase-kasaba] [GUN=14]`: `docker exec supabase-db pg_dump -U postgres -Fc postgres > DIZIN/kasaba-YYYY-MM-DD-HHMM.dump` (geçici ada yazıp `mv`), `find -mtime +GUN -delete`, sonunda dosya adı ve boyutu. Geri yükleme (README'ye): `docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists < dosya`.
- Timer: günlük 04:10, `Persistent=true`.

- [ ] **Step 1: Yaz**; `bash -n`; `systemd-analyze verify` (yerelde unit sözdizimi).
- [ ] **Step 2: Sunucuda kur ve bir kez çalıştır** — `ssh ionos '... sudo db/kur-supabase.sh && sudo systemctl start supabase-kasaba-yedek.service && ls -la /var/backups/supabase-kasaba/ && systemctl list-timers supabase-kasaba-yedek.timer --no-pager | head -3'` → Expected: bir `.dump` (> 50 KB), timer `active (waiting)`, next run yarın 04:10.
- [ ] **Step 3: Okunabilirlik** — `ssh ionos 'f=$(ls -t /var/backups/supabase-kasaba/*.dump | head -1); docker exec -i supabase-db pg_restore --list < $f | grep -c "TABLE public"'` → Expected: `≥ 6`.
- [ ] **Step 4: Commit** — `git commit -m "Supabase: daily pg_dump backup with a 14-day window"`

---

### Task 5: Belgeler

**Files:**
- Modify: `README.md` ("Sunucu kurulumu" altına "Geçmiş ve kullanıcı kaydı: Supabase" bölümü: ne, nerede, kurulum komutu, Studio'ya erişim, yedek/geri yükleme, taşıma, sürüm güncelleme `update.sh`)
- Modify: `.claude/skills/kasaba-gecesi/SKILL.md` (Dosyalar tablosuna `sunucu/db/`; "Yayına alma" altına Supabase satırı; tuzak: Supabase portları yalnız yerel, Studio SSH tüneliyle)

- [ ] **Step 1: Yaz**, bağlantıları ve komutları Task 1–4'teki gerçek adlarla.
- [ ] **Step 2: Commit** — `git commit -m "Docs: self-hosted Supabase for the game history"`

---

## Bitiş ölçütü (spec §6 aşama 2)

`https://kasaba-api.munupixi.com/auth/v1/health` 200; `/rest/v1/` apikey ile yanıt; Studio dışarıdan 404; `ss -tln` Supabase portlarını yalnız `127.0.0.1`'de gösterir; `uygula.sh --test` 7/7; yedek dosyası alınmış ve timer kurulu. Oyun kurulumları (`kasaba`, `kasaba-test`) ve `kur.sh` bu aşamada değişmez.
