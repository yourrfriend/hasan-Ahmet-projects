-- Göç 024 (2026-10-29): setler (yıldız ekonomisi 3d). Tasarım: docs/superpowers/specs/2026-10-29-kasaba-gecesi-yildiz-3-set-design.md.
-- set_odul(p_uye, p_setler {key:{ogeler,odul}}): sahip olunan kozmetikler bir setin tüm öğelerini kapsıyorsa set bir kez ödüllenir (setler PK, cüzdan kilidi altında).
-- Set içeriği ve ödül sunucudan (game.js SETLER); mac_sonu ve kozmetik_al değişmez (sunucu yeni kozmetik kazanımından sonra ayrıca çağırır).

create table if not exists public.setler (
  uye uuid not null references auth.users(id) on delete cascade,
  key text not null,
  zaman timestamptz not null default now(),
  primary key (uye, key)
);
alter table public.setler enable row level security;
revoke all on public.setler from anon, authenticated;
grant select on public.setler to authenticated;
drop policy if exists setler_kendi_oku on public.setler;
create policy setler_kendi_oku on public.setler for select to authenticated using (uye = (select auth.uid()));

create or replace function public.set_odul(p_uye uuid, p_setler jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text; v_b jsonb; v_odul int; v_n int; v_out jsonb := '[]'::jsonb; v_yildiz int;
begin
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  if p_setler is not null and jsonb_typeof(p_setler) = 'object' then
    for v_key, v_b in select * from jsonb_each(p_setler) loop
      -- biçim denetimi: öğe listesi boş olmayan metin dizisi, ödül sayı; değilse atla
      continue when jsonb_typeof(v_b) <> 'object' or jsonb_typeof(v_b -> 'ogeler') <> 'array' or jsonb_array_length(v_b -> 'ogeler') = 0
        or jsonb_typeof(v_b -> 'odul') <> 'number';
      continue when exists (select 1 from jsonb_array_elements(v_b -> 'ogeler') e where jsonb_typeof(e) <> 'string'
        or not exists (select 1 from public.kozmetikler k where k.uye = p_uye and k.key = e #>> '{}'));
      insert into public.setler (uye, key) values (p_uye, v_key) on conflict do nothing;
      get diagnostics v_n = row_count;
      continue when v_n = 0;
      v_odul := greatest((v_b ->> 'odul')::int, 0);
      update public.cuzdan set yildiz = yildiz + v_odul where uye = p_uye;
      v_out := v_out || jsonb_build_object('key', v_key, 'odul', v_odul);
    end loop;
  end if;
  select yildiz into v_yildiz from public.cuzdan where uye = p_uye;
  return jsonb_build_object('setler', v_out, 'yildiz', v_yildiz);
end;
$$;
revoke all on function public.set_odul(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_odul(uuid, jsonb) to service_role;

create or replace function public.hesap_birlestir(eski uuid, yeni uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ys date; v_yn int; v_yu int; v_es date; v_en int; v_eu int; v_ns date; v_nn int; v_os date; v_on int;
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
  -- göç 012: başarılar
  insert into public.basarilar (uye, key, sayac, kademe, zaman) select yeni, key, sayac, kademe, zaman from public.basarilar where uye = eski
    on conflict (uye, key) do update set sayac = public.basarilar.sayac + excluded.sayac, kademe = greatest(public.basarilar.kademe, excluded.kademe),
      zaman = greatest(public.basarilar.zaman, excluded.zaman);
  delete from public.basarilar where uye = eski;
  -- göç 014/015: seri — iki serinin günleri bitişik ya da örtüşüyorsa tek seri sayılır (ikinci cihaz: eski bugün 1 + yeni dün 5 → 6);
  -- değilse en yeni son_gun'un serisi (kırılmış eski seri canlanmaz); en_uzun büyüğü
  select son_gun, seri, en_uzun into v_ys, v_yn, v_yu from public.seriler where uye = yeni;
  select son_gun, seri, en_uzun into v_es, v_en, v_eu from public.seriler where uye = eski;
  if v_es is not null then
    if v_ys is null then
      insert into public.seriler (uye, son_gun, seri, en_uzun) values (yeni, v_es, v_en, v_eu);
    else
      if v_es > v_ys then v_ns := v_es; v_nn := v_en; v_os := v_ys; v_on := v_yn; else v_ns := v_ys; v_nn := v_yn; v_os := v_es; v_on := v_en; end if;
      if v_os >= v_ns - v_nn then v_nn := v_ns - least(v_ns - v_nn + 1, v_os - v_on + 1) + 1; end if;
      update public.seriler set son_gun = v_ns, seri = v_nn, en_uzun = greatest(v_yu, v_eu, v_nn) where uye = yeni;
    end if;
  end if;
  delete from public.seriler where uye = eski;
  -- göç 016: haftalık görevler — aynı hafta/görevde sayaç toplanır, tamam biri doğruysa doğru; ödül verilmez (sonraki maç yakalar)
  insert into public.haftalik_gorevler (uye, hafta, key, sayac, tamam) select yeni, hafta, key, sayac, tamam from public.haftalik_gorevler where uye = eski
    on conflict (uye, hafta, key) do update set sayac = public.haftalik_gorevler.sayac + excluded.sayac, tamam = public.haftalik_gorevler.tamam or excluded.tamam;
  delete from public.haftalik_gorevler where uye = eski;
  -- göç 019: davet — eski hesabın "davetle geldi" kaydı taşınmaz (mevcut hesaba katılan anonim hesap yeni kişi değildir; davetçinin gizli sekmesi de böyle düşer);
  -- eskinin davet ettikleri yeniye geçer; eskinin kodu silinir (yeni kendi kodunu korur)
  delete from public.davetler where davet_edilen = eski;
  update public.davetler set davet_eden = yeni where davet_eden = eski;
  update public.davet_odulleri set davet_eden = yeni where davet_eden = eski;
  delete from public.davetler where davet_edilen = yeni and davet_eden = yeni;
  delete from public.davet_kodlari where uye = eski;
  -- göç 024: tamamlanan setler yeniye geçer (ödül geri alınmaz, yeniden verilmez)
  insert into public.setler (uye, key, zaman) select yeni, key, zaman from public.setler where uye = eski on conflict (uye, key) do nothing;
  delete from public.setler where uye = eski;
  -- göç 010: bağlama ödülü kaydı yeniye geçer; ikisi de ödül aldıysa fazla ödül (25 ⭐, yukarıda toplanan) geri alınır,
  -- eski adresin kaydı kalır (uye boşalır) — bir kişi birleştirmeyle iki ödül tutamaz
  if exists (select 1 from public.bagla_odulleri where uye = eski) then
    if exists (select 1 from public.bagla_odulleri where uye = yeni) then
      update public.cuzdan set yildiz = greatest(0, yildiz - 25) where uye = yeni;
      update public.bagla_odulleri set uye = null where uye = eski;
    else
      update public.bagla_odulleri set uye = yeni where uye = eski;
    end if;
  end if;
end;
$$;
revoke execute on function public.hesap_birlestir(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hesap_birlestir(uuid, uuid) to service_role;
