-- Göç 022 (2026-10-29): e-posta bağlama ödülü (+25 ⭐, mektup) takma adlarla tekrar alınamaz (kullanıcı kararı): bagla_odulu normalleştirilmiş özeti (021 norm_ozet) de denetler.
-- Bedeli: aynı posta kutusunu (takma adla) kullanan ikinci hesap bu ödülü almaz. Yalnız bagla_odulu yenilenir.

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

