-- =====================================================================
--  DompetKu — SEMUA SQL DALAM SATU FILE (gabungan 01 s/d 04)
--  Cara pakai: Supabase > SQL Editor > New query > tempel seluruh isi file ini > Run
--  Aman dijalankan ulang (untuk update).
-- =====================================================================


-- =====================================================================
--  DompetKu — 01. STRUKTUR TABEL (DATABASE)
--  Jalankan file ini PERTAMA di: Supabase > SQL Editor > New query > Run
-- ---------------------------------------------------------------------
--  Isi database:
--    profil              → 1 baris per akun (nama, pendapatan, strategi hutang)
--    dompet              → tempat uang: tunai, rekening bank, e-wallet
--    kategori            → kategori masuk/keluar + batas budget bulanan (jajan)
--    transaksi           → catatan uang masuk, keluar, dan transfer antar dompet
--    hutang              → daftar hutang / liabilitas
--    pembayaran_hutang   → riwayat cicilan (otomatis mengurangi sisa hutang)
--    tabungan            → target tabungan (dana darurat, laptop, liburan, dll)
--    mutasi_tabungan     → riwayat setor / tarik tabungan
--
--  Semua kolom user_id otomatis terisi akun yang sedang login (auth.uid()),
--  jadi aplikasi tidak perlu mengirim user_id sendiri.
-- =====================================================================

-- ---------- PROFIL ----------
create table if not exists public.profil (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nama                text not null default 'Saya' check (char_length(trim(nama)) between 1 and 60),
  pendapatan_bulanan  numeric(15,2) not null default 0 check (pendapatan_bulanan >= 0),
  strategi_hutang     text not null default 'avalanche' check (strategi_hutang in ('avalanche','snowball')),
  dibuat_pada         timestamptz not null default now()
);
comment on table public.profil is 'Profil pengguna. pendapatan_bulanan dipakai untuk insight jika pemasukan bulan ini belum tercatat.';

-- ---------- DOMPET ----------
create table if not exists public.dompet (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama         text not null check (char_length(trim(nama)) between 1 and 50),
  jenis        text not null default 'tunai' check (jenis in ('tunai','bank','ewallet','lainnya')),
  saldo_awal   numeric(15,2) not null default 0,
  aktif        boolean not null default true,
  urutan       int not null default 0,
  dibuat_pada  timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------- KATEGORI (+ budget bulanan) ----------
create table if not exists public.kategori (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama           text not null check (char_length(trim(nama)) between 1 and 40),
  tipe           text not null check (tipe in ('masuk','keluar')),
  -- kelompok untuk aturan 50/30/20:
  --   pendapatan (khusus tipe masuk) | kebutuhan (50%) | keinginan (30%) | tabungan_hutang (20%)
  kelompok       text not null default 'kebutuhan'
                 check (kelompok in ('pendapatan','kebutuhan','keinginan','tabungan_hutang')),
  is_jajan       boolean not null default false,      -- true = masuk "list jajan"
  ikon           text not null default 'tag',          -- nama ikon Tabler (tanpa "ti-")
  batas_bulanan  numeric(15,2) check (batas_bulanan is null or batas_bulanan > 0),  -- budget per bulan
  kode           text,                                  -- kategori sistem: bayar_hutang, setor_tabungan, tarik_tabungan
  aktif          boolean not null default true,
  dibuat_pada    timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, tipe, nama),
  unique (user_id, kode),
  check ((tipe = 'masuk' and kelompok = 'pendapatan') or (tipe = 'keluar' and kelompok <> 'pendapatan'))
);

-- ---------- TRANSAKSI ----------
create table if not exists public.transaksi (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipe              text not null check (tipe in ('masuk','keluar','transfer')),
  jumlah            numeric(15,2) not null check (jumlah > 0),
  tanggal           date not null default current_date,
  dompet_id         uuid not null,
  dompet_tujuan_id  uuid,                 -- hanya untuk transfer
  kategori_id       uuid,                 -- kosong untuk transfer
  catatan           text check (catatan is null or char_length(catatan) <= 200),
  sumber            text not null default 'manual' check (sumber in ('manual','hutang','tabungan')),
  dibuat_pada       timestamptz not null default now(),
  -- FK gabungan (id + user_id) menjamin dompet/kategori milik akun yang sama
  foreign key (dompet_id, user_id)        references public.dompet(id, user_id)   on delete restrict,
  foreign key (dompet_tujuan_id, user_id) references public.dompet(id, user_id)   on delete restrict,
  foreign key (kategori_id, user_id)      references public.kategori(id, user_id) on delete set null (kategori_id),
  check ((tipe = 'transfer') = (dompet_tujuan_id is not null)),
  check (dompet_tujuan_id is null or dompet_tujuan_id <> dompet_id),
  check (tipe <> 'transfer' or kategori_id is null)
);
create index if not exists transaksi_user_tanggal_idx on public.transaksi (user_id, tanggal desc);
create index if not exists transaksi_kategori_idx     on public.transaksi (kategori_id);
create index if not exists transaksi_dompet_idx       on public.transaksi (dompet_id);
create index if not exists transaksi_dompet_tujuan_idx on public.transaksi (dompet_tujuan_id);

-- ---------- HUTANG / LIABILITAS ----------
create table if not exists public.hutang (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama                text not null check (char_length(trim(nama)) between 1 and 60),
  pemberi             text check (pemberi is null or char_length(pemberi) <= 60),  -- bank / leasing / teman
  jenis               text not null default 'cicilan'
                      check (jenis in ('cicilan','paylater','kartu_kredit','pinjaman','pribadi','lainnya')),
  total_awal          numeric(15,2) not null check (total_awal > 0),
  sisa                numeric(15,2) not null check (sisa >= 0),
  bunga_persen_tahun  numeric(6,2) not null default 0 check (bunga_persen_tahun between 0 and 1000),
  cicilan_bulanan     numeric(15,2) not null default 0 check (cicilan_bulanan >= 0),
  tgl_jatuh_tempo     smallint check (tgl_jatuh_tempo between 1 and 31),
  status              text not null default 'aktif' check (status in ('aktif','lunas')),
  catatan             text check (catatan is null or char_length(catatan) <= 200),
  dibuat_pada         timestamptz not null default now(),
  unique (id, user_id),
  check (sisa <= total_awal)
);
create index if not exists hutang_user_idx on public.hutang (user_id, status);

create table if not exists public.pembayaran_hutang (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hutang_id     uuid not null,
  jumlah        numeric(15,2) not null check (jumlah > 0),
  tanggal       date not null default current_date,
  transaksi_id  uuid references public.transaksi(id) on delete cascade,  -- hapus transaksi = batalkan pembayaran
  dibuat_pada   timestamptz not null default now(),
  foreign key (hutang_id, user_id) references public.hutang(id, user_id) on delete cascade
);
create index if not exists pembayaran_hutang_hutang_idx    on public.pembayaran_hutang (hutang_id);
create index if not exists pembayaran_hutang_transaksi_idx on public.pembayaran_hutang (transaksi_id);

-- ---------- TABUNGAN ----------
create table if not exists public.tabungan (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama         text not null check (char_length(trim(nama)) between 1 and 60),
  jenis        text not null default 'tujuan' check (jenis in ('darurat','tujuan')),
  target       numeric(15,2) not null check (target > 0),
  terkumpul    numeric(15,2) not null default 0 check (terkumpul >= 0),
  tenggat      date,
  ikon         text not null default 'pig-money',
  status       text not null default 'aktif' check (status in ('aktif','tercapai','arsip')),
  catatan      text check (catatan is null or char_length(catatan) <= 200),
  dibuat_pada  timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists tabungan_user_idx on public.tabungan (user_id, status);

create table if not exists public.mutasi_tabungan (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tabungan_id   uuid not null,
  jumlah        numeric(15,2) not null check (jumlah <> 0),   -- positif = setor, negatif = tarik
  tanggal       date not null default current_date,
  transaksi_id  uuid references public.transaksi(id) on delete cascade,
  dibuat_pada   timestamptz not null default now(),
  foreign key (tabungan_id, user_id) references public.tabungan(id, user_id) on delete cascade
);
create index if not exists mutasi_tabungan_tabungan_idx  on public.mutasi_tabungan (tabungan_id);
create index if not exists mutasi_tabungan_transaksi_idx on public.mutasi_tabungan (transaksi_id);


-- =====================================================================
--  DompetKu — 02. KEAMANAN (Row Level Security)
--  Jalankan KEDUA, setelah 01_struktur_tabel.sql
-- ---------------------------------------------------------------------
--  RLS = setiap akun HANYA bisa melihat & mengubah datanya sendiri.
--  Ini yang membuat "publishable/anon key" aman ditaruh di kode frontend
--  (yang publik di GitHub). JANGAN pernah taruh "service_role / secret key"
--  di frontend.
-- =====================================================================

alter table public.profil            enable row level security;
alter table public.dompet            enable row level security;
alter table public.kategori          enable row level security;
alter table public.transaksi         enable row level security;
alter table public.hutang            enable row level security;
alter table public.pembayaran_hutang enable row level security;
alter table public.tabungan          enable row level security;
alter table public.mutasi_tabungan   enable row level security;

-- Pengunjung yang belum login (anon) tidak boleh menyentuh tabel apa pun
revoke all on public.profil, public.dompet, public.kategori, public.transaksi,
              public.hutang, public.pembayaran_hutang, public.tabungan, public.mutasi_tabungan
  from anon;

-- Hak akses eksplisit untuk akun yang login (RLS tetap membatasi ke data sendiri)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profil, public.dompet, public.kategori, public.transaksi,
              public.hutang, public.pembayaran_hutang, public.tabungan, public.mutasi_tabungan
  to authenticated;

-- ---------- PROFIL (kunci = id) ----------
drop policy if exists "profil: lihat milik sendiri" on public.profil;
create policy "profil: lihat milik sendiri" on public.profil
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profil: ubah milik sendiri" on public.profil;
create policy "profil: ubah milik sendiri" on public.profil
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "profil: buat milik sendiri" on public.profil;
create policy "profil: buat milik sendiri" on public.profil
  for insert to authenticated with check (id = (select auth.uid()));

-- ---------- Tabel lain (kunci = user_id) ----------
do $$
declare
  t text;
begin
  foreach t in array array['dompet','kategori','transaksi','hutang',
                           'pembayaran_hutang','tabungan','mutasi_tabungan']
  loop
    execute format('drop policy if exists "pemilik: kelola data sendiri" on public.%I', t);
    execute format(
      'create policy "pemilik: kelola data sendiri" on public.%I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;


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
