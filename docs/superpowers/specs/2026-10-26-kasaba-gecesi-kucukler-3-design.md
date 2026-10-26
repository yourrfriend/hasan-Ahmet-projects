# Ertelenen küçükler 3 — ilerleme ve eşya sistemi 2 (kısa tasarım)

Tarih: 2026-10-26. Dal: `kucukler-3` (`main@b0645f4`). Kaynak: DURUM'daki iki ertelenen listesi (ilerleme v1 incelemesi + eşya 2 incelemesi);
kullanıcı "ertelenen küçükleri de planla ve yap" dedi. Oyun kuralları değişmez.

## Maddeler ve kararlar
| # | Madde | Karar |
|---|---|---|
| 1 | `/ben`'de "Rastgele"ye dönüş düğmesi yok | Eşya listesine "🎲 Rastgele" satırı: seçiliyken "Seçili ✓", değilse "Rastgele al" → `kg_look.esya` silinir |
| 2 | Günlük kasa tavanı eşzamanlı iki çağrıda 21 | Göç 009: `mac_sonu` başında `cuzdan` satırını `for update` kilitler (yoksa önce ekler) → sayım ve ekleme aynı kilit altında; `test.sql` 15'e not |
| 3 | Yeni sunucu testlerinde sabit bekleme | `bekle(120/150)` olumsuz denetimler hariç (olmaması beklenen şey için bekleme kalır) `until` yoklamasıyla; olumsuzlar en çok 150 ms |
| 4 | Misafir ev sahibinin odasında kasa verilir, maç kaydı yok | **Kabul**: kasa oyuncunun kendi ödülü, rozet sayımı `kasalar`'dan; maç kaydı kasabaya bağlı (v1 kararı). DURUM'da "kabul" |
| 5 | `kasaKarti` `tekrar:true`'da boş kart | Kart: "Bu maçın kasası daha önce açıldı." (ödül yok) |
| 6 | İki eşyalı pakette kap sonrası boş state yayını | `kap` başarılı ve paket hâlâ açıksa yalnız `sendPriv(room,uid)`; kapandıysa `schedule` |
| 7 | Maç sonu boş eşya satırı fişi ima eder | **Kabul** (tasarım kaynaklı; alternatif bilgi değerini siler) |
| 8 | Paket halkası 2,5 sn adımlarla | Paket açıkken 100 ms'lik sayaç yalnız `g._halka`'yı günceller; paket kapanınca sayaç durur |
| 9 | Hedefli eşya seçimi önceki rol modunu sıfırlar | `sel.onceki` ile giriş/çıkışta geri yükle |
| 10 | Hikâye: süren oyunda paket satırı anonim (plan "atlanır" diyordu) | Plan metni düzeltilir; davranış kalır |
| 11 | `kap/esya` `d,g` eksikse kabul | **Kabul** (`act/vote` ile aynı) |
| 12 | `denge.js` kullanılmayan `n0` | Silinir |

Hedef olmayan: fenerin/kilidin gücü (gerçek maç verisi gerek).
