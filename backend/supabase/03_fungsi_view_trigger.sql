-- =====================================================================
--  DompetKu — 03. BACKEND: FUNGSI, VIEW, TRIGGER
--  Jalankan KETIGA, setelah 02_keamanan_rls.sql
-- ---------------------------------------------------------------------
--  Supabase otomatis membuat REST API dari tabel & fungsi ini, jadi kita
--  tidak perlu server sendiri. Logika penting dibuat di sini (di database)
--  supaya data selalu konsisten, misalnya:
--    • akun baru  → otomatis dapat dompet & kategori default
--    • bayar hutang → transaksi keluar dibuat + sisa hutang berkurang
--    • setor/tarik tabungan → transaksi dibuat + saldo tabungan berubah
--    • hapus transaksi cicilan/tabungan → pembayaran ikut dibatalkan
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) DATA AWAL UNTUK AKUN BARU
--    Disimpan di schema "private" yang TIDAK dibuka ke API, jadi tidak bisa
--    dipanggil langsung dari aplikasi/internet.
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.buat_data_awal(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profil (id) values (p_user) on conflict (id) do nothing;

  insert into public.dompet (user_id, nama, jenis, urutan) values
    (p_user, 'Tunai',         'tunai',   1),
    (p_user, 'Rekening Bank', 'bank',    2),
    (p_user, 'E-Wallet',      'ewallet', 3);

  insert into public.kategori (user_id, nama, tipe, kelompok, is_jajan, ikon, kode) values
    -- Pemasukan
    (p_user, 'Gaji',                 'masuk',  'pendapatan',      false, 'briefcase',        null),
    (p_user, 'Bonus & THR',          'masuk',  'pendapatan',      false, 'gift',             null),
    (p_user, 'Usaha sampingan',      'masuk',  'pendapatan',      false, 'building-store',   null),
    (p_user, 'Pemasukan lain',       'masuk',  'pendapatan',      false, 'coins',            null),
    (p_user, 'Tarik tabungan',       'masuk',  'pendapatan',      false, 'pig-money',        'tarik_tabungan'),
    -- Kebutuhan (target maks 50%)
    (p_user, 'Makan harian',         'keluar', 'kebutuhan',       false, 'bowl',             null),
    (p_user, 'Belanja dapur',        'keluar', 'kebutuhan',       false, 'shopping-cart',    null),
    (p_user, 'Transportasi & bensin','keluar', 'kebutuhan',       false, 'gas-station',      null),
    (p_user, 'Listrik & air',        'keluar', 'kebutuhan',       false, 'bolt',             null),
    (p_user, 'Pulsa & internet',     'keluar', 'kebutuhan',       false, 'wifi',             null),
    (p_user, 'Kos / sewa rumah',     'keluar', 'kebutuhan',       false, 'home',             null),
    (p_user, 'Kesehatan',            'keluar', 'kebutuhan',       false, 'first-aid-kit',    null),
    (p_user, 'Keluarga & sedekah',   'keluar', 'kebutuhan',       false, 'heart-handshake',  null),
    -- Keinginan / jajan (target maks 30%)
    (p_user, 'Kopi & snack',         'keluar', 'keinginan',       true,  'coffee',           null),
    (p_user, 'Makan di luar',        'keluar', 'keinginan',       true,  'tools-kitchen-2',  null),
    (p_user, 'Nongkrong',            'keluar', 'keinginan',       true,  'users-group',      null),
    (p_user, 'Belanja online',       'keluar', 'keinginan',       true,  'shopping-bag',     null),
    (p_user, 'Hiburan & langganan',  'keluar', 'keinginan',       true,  'device-tv',        null),
    (p_user, 'Hobi',                 'keluar', 'keinginan',       false, 'device-gamepad-2', null),
    -- Tabungan & hutang (target min 20%)
    (p_user, 'Cicilan & hutang',     'keluar', 'tabungan_hutang', false, 'file-invoice',     'bayar_hutang'),
    (p_user, 'Setor tabungan',       'keluar', 'tabungan_hutang', false, 'pig-money',        'setor_tabungan'),
    (p_user, 'Investasi',            'keluar', 'tabungan_hutang', false, 'chart-line',       null)
  on conflict do nothing;
end;
$$;
revoke execute on function private.buat_data_awal(uuid) from public, anon;
grant  execute on function private.buat_data_awal(uuid) to authenticated;
drop function if exists public.buat_data_awal(uuid);

-- Trigger: dijalankan otomatis saat ada akun baru mendaftar
create or replace function public.saat_akun_baru()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.buat_data_awal(new.id);
  -- nama dari form pendaftaran (jika diisi)
  update public.profil
     set nama = left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nama'), ''), 'Saya'), 60)
   where id = new.id;
  return new;
end;
$$;
revoke execute on function public.saat_akun_baru() from public, anon, authenticated;

drop trigger if exists trg_akun_baru on auth.users;
create trigger trg_akun_baru
  after insert on auth.users
  for each row execute function public.saat_akun_baru();


-- ---------------------------------------------------------------------
-- 2) KATEGORI SISTEM (dipakai otomatis saat bayar hutang / tabungan)
-- ---------------------------------------------------------------------
create or replace function public.kategori_sistem(p_kode text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.kategori
   where user_id = auth.uid() and kode = p_kode;
  if v_id is null then
    insert into public.kategori (nama, tipe, kelompok, ikon, kode)
    values (
      case p_kode when 'bayar_hutang' then 'Cicilan & hutang'
                  when 'setor_tabungan' then 'Setor tabungan'
                  else 'Tarik tabungan' end,
      case p_kode when 'tarik_tabungan' then 'masuk' else 'keluar' end,
      case p_kode when 'tarik_tabungan' then 'pendapatan' else 'tabungan_hutang' end,
      case p_kode when 'bayar_hutang' then 'file-invoice' else 'pig-money' end,
      p_kode)
    on conflict (user_id, tipe, nama) do update set kode = excluded.kode
    returning id into v_id;
  end if;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 3) BAYAR HUTANG  → rpc('bayar_hutang', {...})
-- ---------------------------------------------------------------------
create or replace function public.bayar_hutang(
  p_hutang_id uuid,
  p_jumlah    numeric,
  p_dompet_id uuid,
  p_tanggal   date default current_date,
  p_catatan   text default null
)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hutang public.hutang;
  v_trx    uuid;
  v_sisa   numeric;
begin
  if auth.uid() is null then raise exception 'Silakan login dulu'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah pembayaran harus lebih dari 0'; end if;

  select * into v_hutang from public.hutang where id = p_hutang_id for update;
  if not found then raise exception 'Hutang tidak ditemukan'; end if;
  if v_hutang.status = 'lunas' then raise exception 'Hutang ini sudah lunas'; end if;
  if p_jumlah > v_hutang.sisa then
    raise exception 'Jumlah melebihi sisa hutang (Rp %)', replace(to_char(v_hutang.sisa, 'FM999,999,999,999'), ',', '.');
  end if;

  insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan, sumber)
  values ('keluar', p_jumlah, coalesce(p_tanggal, current_date), p_dompet_id,
          public.kategori_sistem('bayar_hutang'),
          coalesce(nullif(trim(p_catatan), ''), 'Bayar ' || v_hutang.nama), 'hutang')
  returning id into v_trx;

  insert into public.pembayaran_hutang (hutang_id, jumlah, tanggal, transaksi_id)
  values (p_hutang_id, p_jumlah, coalesce(p_tanggal, current_date), v_trx);

  v_sisa := v_hutang.sisa - p_jumlah;
  update public.hutang
     set sisa = v_sisa,
         status = case when v_sisa = 0 then 'lunas' else 'aktif' end
   where id = p_hutang_id;

  return json_build_object('transaksi_id', v_trx, 'sisa', v_sisa, 'lunas', v_sisa = 0);
end;
$$;

-- Jika pembayaran dihapus (mis. transaksinya dihapus), sisa hutang dikembalikan
create or replace function public.batalkan_pembayaran_hutang()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hutang
     set sisa   = least(total_awal, sisa + old.jumlah),
         status = 'aktif'
   where id = old.hutang_id;
  return old;
end;
$$;
drop trigger if exists trg_batal_bayar_hutang on public.pembayaran_hutang;
create trigger trg_batal_bayar_hutang
  after delete on public.pembayaran_hutang
  for each row execute function public.batalkan_pembayaran_hutang();


-- ---------------------------------------------------------------------
-- 4) SETOR / TARIK TABUNGAN  → rpc('mutasi_tabungan', {...})
--    p_jumlah positif = setor (uang keluar dari dompet)
--    p_jumlah negatif = tarik (uang masuk kembali ke dompet)
-- ---------------------------------------------------------------------
create or replace function public.mutasi_tabungan(
  p_tabungan_id uuid,
  p_jumlah      numeric,
  p_dompet_id   uuid,
  p_tanggal     date default current_date
)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tab        public.tabungan;
  v_trx        uuid;
  v_terkumpul  numeric;
begin
  if auth.uid() is null then raise exception 'Silakan login dulu'; end if;
  if p_jumlah is null or p_jumlah = 0 then raise exception 'Jumlah tidak boleh 0'; end if;

  select * into v_tab from public.tabungan where id = p_tabungan_id for update;
  if not found then raise exception 'Tabungan tidak ditemukan'; end if;
  if p_jumlah < 0 and abs(p_jumlah) > v_tab.terkumpul then
    raise exception 'Saldo tabungan tidak cukup (Rp %)', replace(to_char(v_tab.terkumpul, 'FM999,999,999,999'), ',', '.');
  end if;

  insert into public.transaksi (tipe, jumlah, tanggal, dompet_id, kategori_id, catatan, sumber)
  values (
    case when p_jumlah > 0 then 'keluar' else 'masuk' end,
    abs(p_jumlah),
    coalesce(p_tanggal, current_date),
    p_dompet_id,
    public.kategori_sistem(case when p_jumlah > 0 then 'setor_tabungan' else 'tarik_tabungan' end),
    case when p_jumlah > 0 then 'Setor ke ' else 'Tarik dari ' end || v_tab.nama,
    'tabungan')
  returning id into v_trx;

  insert into public.mutasi_tabungan (tabungan_id, jumlah, tanggal, transaksi_id)
  values (p_tabungan_id, p_jumlah, coalesce(p_tanggal, current_date), v_trx);

  v_terkumpul := v_tab.terkumpul + p_jumlah;
  update public.tabungan
     set terkumpul = v_terkumpul,
         status = case when status = 'arsip' then 'arsip'
                       when v_terkumpul >= target then 'tercapai'
                       else 'aktif' end
   where id = p_tabungan_id;

  return json_build_object('transaksi_id', v_trx, 'terkumpul', v_terkumpul,
                           'tercapai', v_terkumpul >= v_tab.target);
end;
$$;

create or replace function public.batalkan_mutasi_tabungan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.tabungan
     set terkumpul = greatest(0, terkumpul - old.jumlah),
         status = case when status = 'arsip' then 'arsip'
                       when greatest(0, terkumpul - old.jumlah) >= target then 'tercapai'
                       else 'aktif' end
   where id = old.tabungan_id;
  return old;
end;
$$;
drop trigger if exists trg_batal_mutasi_tabungan on public.mutasi_tabungan;
create trigger trg_batal_mutasi_tabungan
  after delete on public.mutasi_tabungan
  for each row execute function public.batalkan_mutasi_tabungan();


-- ---------------------------------------------------------------------
-- 5) VIEW (laporan siap pakai) — security_invoker = RLS tetap berlaku
-- ---------------------------------------------------------------------

-- Saldo setiap dompet = saldo awal + masuk − keluar ± transfer
create or replace view public.v_saldo_dompet
with (security_invoker = true) as
select
  d.id, d.user_id, d.nama, d.jenis, d.aktif, d.urutan, d.saldo_awal,
  d.saldo_awal
    + coalesce(sum(t.jumlah) filter (where t.tipe = 'masuk'    and t.dompet_id = d.id), 0)
    - coalesce(sum(t.jumlah) filter (where t.tipe in ('keluar','transfer') and t.dompet_id = d.id), 0)
    + coalesce(sum(t.jumlah) filter (where t.tipe = 'transfer' and t.dompet_tujuan_id = d.id), 0)
    as saldo
from public.dompet d
left join public.transaksi t
       on t.dompet_id = d.id or t.dompet_tujuan_id = d.id
group by d.id;

-- Ringkasan per bulan (untuk grafik tren & insight)
create or replace view public.v_ringkasan_bulanan
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.tanggal)::date as bulan,
  coalesce(sum(t.jumlah) filter (where t.tipe = 'masuk' and coalesce(k.kode, '') <> 'tarik_tabungan'), 0) as pemasukan,
  coalesce(sum(t.jumlah) filter (where t.tipe = 'keluar'), 0)                                           as pengeluaran,
  coalesce(sum(t.jumlah) filter (where t.tipe = 'keluar' and k.kelompok = 'kebutuhan'), 0)              as kebutuhan,
  coalesce(sum(t.jumlah) filter (where t.tipe = 'keluar' and k.kelompok = 'keinginan'), 0)              as keinginan,
  coalesce(sum(t.jumlah) filter (where t.tipe = 'keluar' and k.kelompok = 'tabungan_hutang'), 0)        as tabungan_hutang,
  coalesce(sum(t.jumlah) filter (where t.tipe = 'keluar' and k.is_jajan), 0)                            as jajan,
  count(*) filter (where t.tipe = 'keluar' and k.is_jajan)                                              as frekuensi_jajan
from public.transaksi t
left join public.kategori k on k.id = t.kategori_id
group by t.user_id, date_trunc('month', t.tanggal);

revoke all on public.v_saldo_dompet, public.v_ringkasan_bulanan from anon;
grant select on public.v_saldo_dompet, public.v_ringkasan_bulanan to authenticated;


-- ---------------------------------------------------------------------
-- 6) RESET AKUN (hapus semua data lalu buat ulang data default)
-- ---------------------------------------------------------------------
create or replace function public.reset_akun()
returns void
language plpgsql
security invoker          -- berjalan dengan hak pengguna sendiri (RLS berlaku)
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Silakan login dulu'; end if;
  delete from public.hutang    where user_id = v_user;
  delete from public.tabungan  where user_id = v_user;
  delete from public.transaksi where user_id = v_user;
  delete from public.kategori  where user_id = v_user;
  delete from public.dompet    where user_id = v_user;
  update public.profil set pendapatan_bulanan = 0, strategi_hutang = 'avalanche' where id = v_user;
  perform private.buat_data_awal(v_user);
end;
$$;
revoke execute on function public.reset_akun() from public, anon;
grant  execute on function public.reset_akun() to authenticated;


-- ---------------------------------------------------------------------
-- 7) PING — dipakai GitHub Actions supaya project gratis tidak di-pause
-- ---------------------------------------------------------------------
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;

-- Fungsi yang hanya boleh dipanggil akun yang login
revoke execute on function public.kategori_sistem(text)                        from public, anon;
revoke execute on function public.bayar_hutang(uuid, numeric, uuid, date, text) from public, anon;
revoke execute on function public.mutasi_tabungan(uuid, numeric, uuid, date)    from public, anon;
revoke execute on function public.batalkan_pembayaran_hutang()                 from public, anon, authenticated;
revoke execute on function public.batalkan_mutasi_tabungan()                   from public, anon, authenticated;
grant  execute on function public.kategori_sistem(text)                        to authenticated;
grant  execute on function public.bayar_hutang(uuid, numeric, uuid, date, text) to authenticated;
grant  execute on function public.mutasi_tabungan(uuid, numeric, uuid, date)    to authenticated;
