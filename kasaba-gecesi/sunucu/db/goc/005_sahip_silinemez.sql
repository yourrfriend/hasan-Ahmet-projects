-- İnceleme düzeltmesi: kasaba sahibi olan bir kullanıcı silinince kasaba (ve üyelikleri) sessizce gitmesin.
-- cascade yerine restrict: önce sahiplik devredilmeli (6. aşama). Diğer FK'lar (üyelik, profil) cascade kalır.
alter table public.kasabalar drop constraint if exists kasabalar_sahip_fkey;
alter table public.kasabalar add constraint kasabalar_sahip_fkey foreign key (sahip) references auth.users(id) on delete restrict;
