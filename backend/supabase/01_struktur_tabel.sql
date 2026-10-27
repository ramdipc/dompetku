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
