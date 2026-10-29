-- Göç 023 (2026-10-29): bagla_odulu ve davet_odul aynı normalleştirilmiş adres için danışma kilidi alır (güvenlik taraması: farklı hesaplardan eşzamanlı
-- takma ad bağlamada denetim-sonra-ekleme yarışı çift ödül verebiliyordu). Benzersiz indeks yerine kilit: eski satırlarda aynı norm_ozet olabilir.

create or replace function public.bagla_odulu(p_uye uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_davet int := 0; v_eposta text; v_onay timestamptz; v_ozet text; v_yildiz int; bagla_miktar constant int := 25;
begin
  select email, email_confirmed_at into v_eposta, v_onay from auth.users where id = p_uye;
  if v_eposta is null or v_eposta = '' or v_onay is null then return jsonb_build_object('hata', 'bagli_degil'); end if;
  v_ozet := encode(extensions.digest(convert_to(lower(v_eposta), 'UTF8'), 'sha256'), 'hex');
  insert into public.cuzdan (uye, yildiz) values (p_uye, 0) on conflict (uye) do nothing;
  perform 1 from public.cuzdan where uye = p_uye for update;
  -- göç 019: bağlı her üyenin davet kodu (tahmin edilemez, 8 karakter)
  insert into public.davet_kodlari (uye, kod) values (p_uye, public.davet_kodu_uret()) on conflict (uye) do nothing;
  -- göç 023: aynı normalleştirilmiş adres için kararlar sırayla (farklı hesaplar farklı cüzdan kilidi tutar; iki takma ad aynı anda bağlansa da tek ödül)
  perform pg_advisory_xact_lock(hashtext('bagla:' || public.davet_eposta_norm(v_eposta)));
  -- göç 022: takma adlar (ad+etiket, Gmail noktaları) aynı adres: normalleştirilmiş özet de denetlenir
  if exists (select 1 from public.bagla_odulleri where uye = p_uye or eposta_ozet = v_ozet
             or norm_ozet = encode(extensions.digest(convert_to(public.davet_eposta_norm(v_eposta), 'UTF8'), 'sha256'), 'hex')) then return jsonb_build_object('tekrar', true); end if;
  insert into public.bagla_odulleri (eposta_ozet, uye, norm_ozet) values (v_ozet, p_uye, encode(extensions.digest(convert_to(public.davet_eposta_norm(v_eposta), 'UTF8'), 'sha256'), 'hex'));
  update public.cuzdan set yildiz = yildiz + bagla_miktar where uye = p_uye returning yildiz into v_yildiz;
  insert into public.kozmetikler (uye, key) values (p_uye, 'bayrak:mektup') on conflict (uye, key) do nothing;
  v_davet := public.davet_odul(p_uye);
  select yildiz into v_yildiz from public.cuzdan where uye = p_uye;
  return jsonb_build_object('ok', true, 'yildiz', v_yildiz, 'davet', v_davet);
end;
$$;


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
  -- göç 023: aynı adres için davet kararları sırayla (yarışta ikinci istek birincil anahtar hatasıyla maç sonunu düşürmesin)
  perform pg_advisory_xact_lock(hashtext('davet:' || v_ozet));
  if exists (select 1 from public.davet_odulleri where eposta_ozet = v_ozet) then return 0; end if;
  -- göç 021: karşılaştırma normalleştirilmiş özetle (bağlı oyuncunun ad+x@ takma adı da eski oyuncu sayılır)
  if exists (select 1 from public.bagla_odulleri where (norm_ozet = v_ozet or eposta_ozet = encode(extensions.digest(convert_to(lower(v_eposta), 'UTF8'), 'sha256'), 'hex')) and uye is distinct from p_yeni) then return 0; end if;
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

