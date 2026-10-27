// =====================================================================
//  API — semua komunikasi ke backend Supabase ada di file ini.
//  Halaman tidak memanggil Supabase langsung, cukup lewat fungsi di bawah.
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';
import { rentangBulan, tambahBulan, bulanIni } from './util.js';

export const sudahDikonfigurasi =
  /^https:\/\/.+\.supabase\.co\/?$/.test(CONFIG.SUPABASE_URL) &&
  !CONFIG.SUPABASE_URL.includes('XXXX') &&
  !CONFIG.SUPABASE_KEY.startsWith('GANTI');

export const sb = sudahDikonfigurasi
  ? createClient(CONFIG.SUPABASE_URL.replace(/\/$/, ''), CONFIG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Ubah error teknis menjadi pesan yang mudah dipahami */
export function pesanError(e) {
  const m = e?.message || String(e);
  if (!navigator.onLine) return 'Tidak ada koneksi internet. Coba lagi saat online.';
  if (e?.code === '23503') return 'Data ini masih dipakai di transaksi lain, jadi tidak bisa dihapus. Nonaktifkan saja.';
  if (e?.code === '23505') return 'Nama tersebut sudah ada. Gunakan nama lain.';
  if (e?.code === '23514') return 'Ada isian yang tidak valid. Periksa lagi formnya.';
  if (/Invalid login credentials/i.test(m)) return 'Email atau password salah.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk email kamu.';
  if (/User already registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/Password should be/i.test(m)) return 'Password minimal 6 karakter.';
  if (/Signups not allowed/i.test(m)) return 'Pendaftaran akun baru sedang ditutup oleh pemilik aplikasi.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Gagal terhubung ke server. Periksa internet, atau project Supabase sedang di-pause.';
  if (/JWT expired/i.test(m)) return 'Sesi login habis. Silakan masuk lagi.';
  return m;
}

async function jalankan(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---------------- AUTH ----------------
export const auth = {
  sesi: async () => (await sb.auth.getSession()).data.session,
  masuk: (email, password) => jalankan(sb.auth.signInWithPassword({ email, password })),
  daftar: (email, password, nama) =>
    jalankan(sb.auth.signUp({ email, password, options: { data: { nama }, emailRedirectTo: location.origin + location.pathname } })),
  lupaPassword: (email) =>
    jalankan(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })),
  gantiPassword: (password) => jalankan(sb.auth.updateUser({ password })),
  keluar: () => sb.auth.signOut(),
  saatBerubah: (fn) => sb.auth.onAuthStateChange(fn),
};

// ---------------- REFERENSI (profil, dompet, kategori) ----------------
export const profil = {
  ambil: () => jalankan(sb.from('profil').select('*').maybeSingle()),
  simpan: (id, data) => jalankan(sb.from('profil').update(data).eq('id', id).select().single()),
};

export const dompet = {
  daftar: () => jalankan(sb.from('v_saldo_dompet').select('*').order('urutan').order('nama')),
  simpan: (data, id) =>
    id ? jalankan(sb.from('dompet').update(data).eq('id', id)) : jalankan(sb.from('dompet').insert(data)),
  hapus: (id) => jalankan(sb.from('dompet').delete().eq('id', id)),
};

export const kategori = {
  daftar: () => jalankan(sb.from('kategori').select('*').order('tipe').order('nama')),
  simpan: (data, id) =>
    id ? jalankan(sb.from('kategori').update(data).eq('id', id)) : jalankan(sb.from('kategori').insert(data)),
  hapus: (id) => jalankan(sb.from('kategori').delete().eq('id', id)),
};

// ---------------- TRANSAKSI ----------------
export const transaksi = {
  /** Transaksi antara dua tanggal (sampai = eksklusif) */
  rentang: (dari, sampai) =>
    jalankan(
      sb.from('transaksi').select('*')
        .gte('tanggal', dari).lt('tanggal', sampai)
        .order('tanggal', { ascending: false }).order('dibuat_pada', { ascending: false })
        .limit(5000)
    ),
  bulan: (ym) => { const r = rentangBulan(ym); return transaksi.rentang(r.dari, r.sampai); },
  /** Bulan ini + n bulan sebelumnya (untuk insight) */
  beberapaBulan: (n = 3) => transaksi.rentang(`${tambahBulan(bulanIni(), -(n - 1))}-01`, `${tambahBulan(bulanIni(), 1)}-01`),
  terakhir: (n = 5) =>
    jalankan(sb.from('transaksi').select('*').order('tanggal', { ascending: false }).order('dibuat_pada', { ascending: false }).limit(n)),
  simpan: (data, id) =>
    id ? jalankan(sb.from('transaksi').update(data).eq('id', id)) : jalankan(sb.from('transaksi').insert(data)),
  hapus: (id) => jalankan(sb.from('transaksi').delete().eq('id', id)),
  semua: () => jalankan(sb.from('transaksi').select('*').order('tanggal').limit(100000)),
};

// ---------------- HUTANG ----------------
export const hutang = {
  daftar: () => jalankan(sb.from('hutang').select('*').order('status').order('dibuat_pada')),
  simpan: (data, id) =>
    id ? jalankan(sb.from('hutang').update(data).eq('id', id)) : jalankan(sb.from('hutang').insert(data)),
  hapus: (id) => jalankan(sb.from('hutang').delete().eq('id', id)),
  bayar: (hutangId, jumlah, dompetId, tanggal, catatan) =>
    jalankan(sb.rpc('bayar_hutang', { p_hutang_id: hutangId, p_jumlah: jumlah, p_dompet_id: dompetId, p_tanggal: tanggal, p_catatan: catatan || null })),
  riwayat: (hutangId) =>
    jalankan(sb.from('pembayaran_hutang').select('*').eq('hutang_id', hutangId).order('tanggal', { ascending: false })),
};

// ---------------- TABUNGAN ----------------
export const tabungan = {
  daftar: () => jalankan(sb.from('tabungan').select('*').order('status').order('dibuat_pada')),
  simpan: (data, id) =>
    id ? jalankan(sb.from('tabungan').update(data).eq('id', id)) : jalankan(sb.from('tabungan').insert(data)),
  hapus: (id) => jalankan(sb.from('tabungan').delete().eq('id', id)),
  /** jumlah positif = setor, negatif = tarik */
  mutasi: (tabunganId, jumlah, dompetId, tanggal) =>
    jalankan(sb.rpc('mutasi_tabungan', { p_tabungan_id: tabunganId, p_jumlah: jumlah, p_dompet_id: dompetId, p_tanggal: tanggal })),
  riwayat: (tabunganId) =>
    jalankan(sb.from('mutasi_tabungan').select('*').eq('tabungan_id', tabunganId).order('tanggal', { ascending: false })),
};

// ---------------- LAPORAN ----------------
export const laporan = {
  ringkasanBulanan: (n = 6) =>
    jalankan(sb.from('v_ringkasan_bulanan').select('*').gte('bulan', `${tambahBulan(bulanIni(), -(n - 1))}-01`).order('bulan')),
};

// ---------------- DATA ----------------
export const data = {
  isiContoh: () => jalankan(sb.rpc('isi_data_contoh')),
  resetAkun: () => jalankan(sb.rpc('reset_akun')),
  async eksporSemua() {
    const [p, d, k, t, h, ph, tb, mt] = await Promise.all([
      profil.ambil(), dompet.daftar(), kategori.daftar(), transaksi.semua(), hutang.daftar(),
      jalankan(sb.from('pembayaran_hutang').select('*')), tabungan.daftar(), jalankan(sb.from('mutasi_tabungan').select('*')),
    ]);
    return { aplikasi: 'DompetKu', versi: 1, diekspor_pada: new Date().toISOString(),
      profil: p, dompet: d, kategori: k, transaksi: t, hutang: h, pembayaran_hutang: ph, tabungan: tb, mutasi_tabungan: mt };
  },
};
