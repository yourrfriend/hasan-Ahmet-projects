---
name: yayinla
description: Kasaba Gecesi'ni (ya da bir test/eski sürümünü) VPS'e SSH ile kurar, günceller, listeler ya da kaldırır; kur.sh'yi sunucuda çalıştırır ve adresi doğrular. Yalnız kullanıcı /yayinla yazınca çalışır.
argument-hint: "[AD] [SÜRÜM] | --liste | --kaldir AD   (ör. kasaba-test sunucu)"
disable-model-invocation: true
---

# /yayinla

Kullanıcının istediği: `$ARGUMENTS`

Bu komut kullanıcının kendi bilgisayarında (ya da doğrudan VPS'te) çalışan Claude Code içindir. Sunucuda
`kasaba-gecesi/sunucu/kur.sh` çalıştırır; ayrıntılar için README'deki "Sunucu kurulumu" ve `kur.sh` başındaki
yardıma bak. Sunucuda değişiklik yapan her komuttan önce kullanıcıya **tam komutu göster ve onay al**.

## 1. Ayarlar

`.claude/yayin.env` dosyasını oku (git'e girmez; örnek: `.claude/yayin.env.ornek`). Alanlar:

- `VPS` — SSH hedefi, ör. `root@203.0.113.10` ya da `~/.ssh/config`'teki bir ad. Claude Code doğrudan VPS'te çalışıyorsa `yerel`.
- `DEPO` — depo VPS'te nereye klonlanacak/klonlandı, ör. `/opt/src/hasan-Ahmet-projects`.
- `ALAN_KOK` — oyunların alt alan adı kökü, varsayılan `games.munupixi.com`.
- `CANLI_SURUM` — yayındaki sürümün branch'i, varsayılan `main`.

Dosya yoksa ya da `VPS` boşsa kullanıcıya sor (şifre ya da anahtar **isteme**; yalnız kullanıcı@adres), cevabı
`.claude/yayin.env`'e yaz ve devam et.

Aşağıda `uzak KOMUT` şu demek: `VPS=yerel` ise `bash -lc 'KOMUT'`, değilse `ssh -o BatchMode=yes "$VPS" 'KOMUT'`.

## 2. Argümanları çöz

| `$ARGUMENTS` | Kurulum adı | Sürüm (`--surum`) |
|---|---|---|
| boş | `kasaba` | `CANLI_SURUM` |
| `kasaba-test sunucu` | `kasaba-test` | `sunucu` |
| `kasaba-v1 v1` | `kasaba-v1` | `v1` (tag) |
| yalnız `AD` | `AD` | `AD` = `kasaba` ise `CANLI_SURUM`; başka bir adsa hangi sürüm olduğunu kullanıcıya sor |
| `--liste` | — | yalnız listele (5. adım) |
| `--kaldir AD` | `AD` | kaldır (5. adım) |

Alan adı her zaman `AD.ALAN_KOK` (ör. `kasaba-test.games.munupixi.com`). Ad yalnız küçük harf, rakam ve tire olabilir.

## 3. Ön kontroller (yerelde)

1. `git fetch origin` ve sürüm `origin/SÜRÜM` ya da tag olarak var mı bak. Yoksa dur: sürüm GitHub'a push'lanmamış; sunucu
   kodu GitHub'dan alır. Yereldeki branch origin'in önündeyse kullanıcıya push'lanmamış commit olduğunu söyle.
2. Yerelde `node` varsa `.claude/skills/kasaba-gecesi/scripts/kontrol.sh` çalıştır (hızlı kontrol; e2e gerekmez).
   Başarısızsa yayınlama, hatayı göster. Bu kontrol çalışma klasörünü test eder; sürüm başka bir branch ise bunu
   belirt (o branch'i test etmek için önce ona geç).
3. SSH: `uzak 'echo ok'` çalışmazsa dur ve kullanıcıya anlat: SSH anahtarı bu bilgisayarda tanımlı olmalı
   (`ssh-copy-id VPS`), parola isteyen bağlantı burada çalışmaz.
4. Yetki: `uzak 'sudo -n true'` çalışmazsa dur: `kur.sh` root ister; ya `root@` ile bağlan ya da o kullanıcıya
   parolasız sudo ver (`/etc/sudoers.d/`). Claude parolayı yazamaz.

## 4. Kur ya da güncelle

1. Depo sunucuda yoksa (`uzak 'test -d DEPO/.git'` başarısız): `uzak 'git clone https://github.com/yourrfriend/hasan-Ahmet-projects.git DEPO'`.
2. `kur.sh`'nin en yeni hali için sunucudaki klonu güncelle: `uzak 'cd DEPO && git fetch -q origin && git checkout -q CANLI_SURUM && git pull -q --ff-only'`.
   `kur.sh` o branch'te çok oyunlu değilse (içinde `--surum` geçmiyorsa) `sunucu` branch'ine geçerek dene ve bunu kullanıcıya söyle.
3. Kullanıcıya göster ve onay al, sonra çalıştır:
   `uzak 'cd DEPO/kasaba-gecesi/sunucu && sudo ./kur.sh AD AD.ALAN_KOK --surum SÜRÜM'`
   Birkaç dakika sürebilir (ilk kurulumda Node ve Caddy kurulur); zaman aşımını uzun tut.
4. Çıktıda `HATA:` varsa olduğu gibi göster. "eski sürüm geri yüklendi" diyorsa yayındaki sürüm sağlam demektir;
   günlüğü getir: `uzak 'sudo journalctl -u game@AD -n 60 --no-pager'` ve nedenini açıkla.

## 5. Liste ve kaldırma

- `--liste`: `uzak 'cd DEPO/kasaba-gecesi/sunucu && sudo ./kur.sh --liste'` ve tabloyu göster.
- `--kaldir AD`: önce listeyi göster, `AD`'nin olduğunu doğrula, onay al, sonra
  `uzak 'cd DEPO/kasaba-gecesi/sunucu && sudo ./kur.sh --kaldir AD'`. `kasaba` (yayındaki) için ayrıca uyar.

## 6. Doğrula ve bildir

1. `curl -fsS https://AD.ALAN_KOK/saglik` (sertifika ilk kurulumda birkaç saniye gecikebilir; 30 sn'ye kadar tekrar dene).
   Dönen `surum` alanı `SÜRÜM@<commit>` olmalı; commit `git rev-parse --short origin/SÜRÜM` ile aynı mı karşılaştır.
2. Erişilemiyorsa nedenini ayır: DNS (`getent hosts AD.ALAN_KOK` ya da `nslookup`; `*.ALAN_KOK` A kaydı VPS'i
   göstermeli), sunucuda servis (`uzak 'curl -fsS http://127.0.0.1:PORT/saglik'`, port `--liste`'te), Caddy
   (`uzak 'sudo journalctl -u caddy -n 40 --no-pager'`).
3. Kullanıcıya kısa bildir: adres, sürüm@commit, port; sorun varsa ne olduğu ve ne yapması gerektiği.
