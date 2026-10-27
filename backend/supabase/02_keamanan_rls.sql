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
