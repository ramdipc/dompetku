-- =====================================================================
--  DompetKu — 04. DATA CONTOH (untuk uji coba)
--  Jalankan KEEMPAT. File ini hanya MEMBUAT FUNGSI; datanya diisi lewat
--  tombol "Isi data contoh" di menu Pengaturan aplikasi (atau di Beranda
--  saat akun masih kosong). Data contoh = 3 bulan transaksi, 3 hutang,
--  3 target tabungan, dan budget jajan — supaya insight langsung terlihat.
--  Hapus kapan saja lewat Pengaturan > "Reset semua data".
-- =====================================================================

create or replace function public.isi_data_contoh()
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_tunai    uuid;
  v_bank     uuid;
  v_ewallet  uuid;
  v_bulan    date;
  v_hari     date;
  v_akhir    date;
  i          int;
  v_jumlah   int := 0;
  v_hutang1  uuid;
begin
  if v_user is null then raise exception 'Silakan login dulu'; end if;
  if exists (select 1 from public.transaksi where user_id = v_user) then
    raise exception 'Data contoh hanya bisa diisi saat belum ada transaksi. Reset data dulu di Pengaturan.';
  end if;

  select id into v_tunai   from public.dompet where user_id = v_user and jenis = 'tunai'   order by urutan limit 1;
  select id into v_bank    from public.dompet where user_id = v_user and jenis = 'bank'    order by urutan limit 1;
  select id into v_ewallet from public.dompet where user_id = v_user and jenis = 'ewallet' order by urutan limit 1;
  if v_tunai is null or v_bank is null or v_ewallet is null then
    raise exception 'Dompet default tidak lengkap. Gunakan "Reset semua data" dulu.';
  end if;

  update public.dompet set saldo_awal = 500000  where id = v_tunai;
  update public.dompet set saldo_awal = 3000000 where id = v_bank;
  update public.dompet set saldo_awal = 200000  where id = v_ewallet;
  update public.profil set pendapatan_bulanan = 7500000 where id = v_user;

  -- Budget bulanan untuk kategori jajan
  update public.kategori set batas_bulanan = 500000 where user_id = v_user and nama = 'Kopi & snack';
  update public.kategori set batas_bulanan = 800000 where user_id = v_user and nama = 'Makan di luar';
  update public.kategori set batas_bulanan = 300000 where user_id = v_user and nama = 'Nongkrong';
  update public.kategori set batas_bulanan = 400000 where user_id = v_user and nama = 'Belanja online';
  update public.kategori set batas_bulanan = 250000 where user_id = v_user and nama = 'Hiburan & langganan';

  -- Transaksi 3 bulan: 2 bulan lalu, bulan lalu, bulan ini (sampai hari ini)
  for i in reverse 2..0 loop
    v_bulan := (date_trunc('month', current_date) - make_interval(months => i))::date;
    v_akhir := least(current_date, (v_bulan + interval '1 month - 1 day')::date);

    -- tetap bulanan
    insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan)
    select 'masuk', 7500000, v_bulan, v_bank, k.id, 'Gaji bulanan'
      from public.kategori k where k.user_id = v_user and k.nama = 'Gaji';

    insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan)
    select 'keluar', x.jumlah, least(v_akhir, v_bulan + x.hari), x.dompet, k.id, x.catatan
      from (values
        ('Kos / sewa rumah',     1500000, 1,  v_bank,    'Bayar kos'),
        ('Listrik & air',         350000, 4,  v_bank,    'Token listrik + PDAM'),
        ('Pulsa & internet',      150000, 2,  v_ewallet, 'Paket data'),
        ('Hiburan & langganan',    65000, 6,  v_ewallet, 'Langganan streaming musik'),
        ('Hiburan & langganan',    54000, 9,  v_ewallet, 'Langganan streaming film'),
        ('Keluarga & sedekah',    500000, 2,  v_bank,    'Kirim ke orang tua'),
        ('Investasi',             300000, 3,  v_bank,    'Reksa dana pasar uang')
      ) as x(nama, jumlah, hari, dompet, catatan)
      join public.kategori k on k.user_id = v_user and k.nama = x.nama
     where v_bulan + x.hari <= v_akhir;

    -- harian / mingguan
    v_hari := v_bulan;
    while v_hari <= v_akhir loop
      -- kopi hampir tiap hari kerja (bulan ini sengaja lebih sering → muncul insight)
      if extract(isodow from v_hari) < 6 and (i = 0 or random() < 0.6) then
        insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan)
        select 'keluar', (18 + floor(random() * 12))::int * 1000, v_hari, v_ewallet, k.id, 'Kopi susu'
          from public.kategori k where k.user_id = v_user and k.nama = 'Kopi & snack';
      end if;
      -- makan harian
      insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan)
      select 'keluar', (20 + floor(random() * 15))::int * 1000, v_hari, v_tunai, k.id, 'Makan siang'
        from public.kategori k where k.user_id = v_user and k.nama = 'Makan harian';
      -- mingguan (Sabtu)
      if extract(isodow from v_hari) = 6 then
        insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan)
        select 'keluar', x.jumlah, v_hari, x.dompet, k.id, x.catatan
          from (values
            ('Belanja dapur',          (150 + floor(random() * 60))::int * 1000, v_bank,    'Belanja mingguan'),
            ('Transportasi & bensin',  50000,                                    v_tunai,   'Isi bensin'),
            ('Makan di luar',          (60 + floor(random() * 50))::int * 1000,  v_ewallet, 'Makan malam di luar'),
            ('Nongkrong',              (40 + floor(random() * 30))::int * 1000,  v_ewallet, 'Nongkrong bareng teman')
          ) as x(nama, jumlah, dompet, catatan)
          join public.kategori k on k.user_id = v_user and k.nama = x.nama;
      end if;
      -- belanja online sesekali
      if random() < 0.12 then
        insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan)
        select 'keluar', (60 + floor(random() * 140))::int * 1000, v_hari, v_ewallet, k.id, 'Checkout marketplace'
          from public.kategori k where k.user_id = v_user and k.nama = 'Belanja online';
      end if;
      v_hari := v_hari + 1;
    end loop;

    -- top up e-wallet dari bank tiap tanggal 1 & 15
    insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, dompet_tujuan_id, catatan)
    select 'transfer', 1000000, d, v_bank, v_ewallet, 'Top up e-wallet'
      from (values (v_bulan), (v_bulan + 14)) as x(d) where d <= v_akhir;
    -- tarik tunai
    insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, dompet_tujuan_id, catatan)
    select 'transfer', 1100000, v_bulan + 1, v_bank, v_tunai, 'Tarik tunai ATM'
     where v_bulan + 1 <= v_akhir;
  end loop;

  -- Hutang / liabilitas
  insert into public.hutang (nama, pemberi, jenis, total_awal, sisa, bunga_persen_tahun, cicilan_bulanan, tgl_jatuh_tempo, catatan)
  values ('Cicilan motor', 'Leasing ABC', 'cicilan', 18000000, 6200000, 12, 850000, 5, 'Sisa 8 bulan')
  returning id into v_hutang1;
  insert into public.hutang (nama, pemberi, jenis, total_awal, sisa, bunga_persen_tahun, cicilan_bulanan, tgl_jatuh_tempo) values
    ('Paylater marketplace', 'Marketplace', 'paylater',     1500000, 1100000, 30, 400000, 10),
    ('Kartu kredit',         'Bank XYZ',  'kartu_kredit', 2300000, 2300000, 21, 230000, 18);

  -- satu cicilan motor bulan ini lewat fungsi resmi (supaya tercatat sebagai transaksi)
  if extract(day from current_date) >= 5 then
    perform public.bayar_hutang(v_hutang1, 850000, v_bank,
      (date_trunc('month', current_date) + interval '4 day')::date, 'Cicilan motor bulan ini');
  end if;

  -- Target tabungan
  insert into public.tabungan (nama, jenis, target, terkumpul, tenggat, ikon) values
    ('Dana darurat', 'darurat', 15000000, 4000000, null,                                   'shield-check'),
    ('Laptop baru',  'tujuan',   8000000, 3000000, (current_date + interval '5 month')::date, 'device-laptop'),
    ('Liburan Bali', 'tujuan',   5000000, 1200000, (current_date + interval '8 month')::date, 'beach');

  select count(*) into v_jumlah from public.transaksi where user_id = v_user;
  return json_build_object('transaksi', v_jumlah, 'hutang', 3, 'tabungan', 3);
end;
$$;
revoke execute on function public.isi_data_contoh() from public, anon;
grant  execute on function public.isi_data_contoh() to authenticated;
