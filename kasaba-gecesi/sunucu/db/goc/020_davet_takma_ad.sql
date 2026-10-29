-- Göç 020 (2026-10-29): davet ödülü e-posta takma adlarıyla çiftlenemesin (son inceleme bulgusu). Adres normalleştirilir: küçük harf, '+etiket' atılır,
-- gmail/googlemail'de noktalar atılır ve alan gmail.com olur. Ayrıca adres başka bir hesapta bağlama ödülü almışsa (hesabı silip yeniden gelen eski oyuncu) davet sayılmaz.
-- Yalnız davet_odul yenilenir ve davet_eposta_norm eklenir; ödenmiş eski özetler (normalleştirilmemiş) en çok bir kez daha eşleşmeyebilir — davet yeni, kayıt yok denecek kadar az.

create or replace function public.davet_eposta_norm(p text)
returns text language sql immutable set search_path = '' as $$
  select case when position('@' in e) = 0 then e else
    (select case when d in ('gmail.com', 'googlemail.com') then replace(y, '.', '') || '@gmail.com' else y || '@' || d end
     from (select split_part(split_part(e, '@', 1), '+', 1) as y, split_part(e, '@', 2) as d) t) end
  from (select lower(trim(coalesce(p, ''))) as e) s;
$$;
revoke all on function public.davet_eposta_norm(text) from public, anon, authenticated;
grant execute on function public.davet_eposta_norm(text) to service_role;

create or replace function public.davet_odul(p_yeni uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare davet_eden_miktar constant int := 30; davet_gelen_miktar constant int := 10; davet_tavan constant int := 10; davet_kozmetik_esik constant int := 3;
  v_eden uuid; v_odullu int; v_eposta text; v_ozet text;
begin
  select davet_eden into v_eden from public.davetler where davet_edilen = p_yeni and odul_zaman is null for update;
  if not found then return 0; end if;
  select email into v_eposta from auth.users where id = p_yeni and coalesce(email, '') <> '' and email_confirmed_at is not null;
  if v_eposta is null then return 0; end if;
  -- göç 020: takma adlar aynı adres (normalleştirilmiş özet); bu adres başka bir hesapta bağlama ödülü aldıysa gelen yeni kişi değildir
  v_ozet := encode(extensions.digest(convert_to(public.davet_eposta_norm(v_eposta), 'UTF8'), 'sha256'), 'hex');
  if exists (select 1 from public.davet_odulleri where eposta_ozet = v_ozet) then return 0; end if;
  if exists (select 1 from public.bagla_odulleri where eposta_ozet = encode(extensions.digest(convert_to(lower(v_eposta), 'UTF8'), 'sha256'), 'hex') and uye is distinct from p_yeni) then return 0; end if;
  if not exists (select 1 from public.kasalar where uye = p_yeni and not coalesce((odul ->> 'tavan')::boolean, false)) then return 0; end if;
  update public.davetler set odul_zaman = now() where davet_edilen = p_yeni;
  insert into public.cuzdan (uye, yildiz) values (p_yeni, 0) on conflict (uye) do nothing;
  update public.cuzdan set yildiz = yildiz + davet_gelen_miktar where uye = p_yeni;
  if v_eden is not null then
    insert into public.cuzdan (uye, yildiz) values (v_eden, 0) on conflict (uye) do nothing;
    perform 1 from public.cuzdan where uye = v_eden for update;
    select count(*) into v_odullu from public.davet_odulleri where davet_eden = v_eden;
    if v_odullu < davet_tavan then
      update public.cuzdan set yildiz = yildiz + davet_eden_miktar where uye = v_eden;
      if v_odullu + 1 >= davet_kozmetik_esik then
        insert into public.kozmetikler (uye, key) values (v_eden, 'bayrak:dostluk') on conflict do nothing;
      end if;
    end if;
  end if;
  insert into public.davet_odulleri (eposta_ozet, davet_eden) values (v_ozet, v_eden);
  return davet_gelen_miktar;
end;
$$;

