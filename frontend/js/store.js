// Penyimpanan data sementara di memori (profil, dompet, kategori) + pemicu muat ulang halaman
import * as api from './api.js';
import { jumlahkan } from './util.js';

export const store = {
  user: null,
  profil: null,
  dompet: [],     // dari view v_saldo_dompet (sudah ada kolom saldo)
  kategori: [],
};

export async function muatReferensi() {
  const [p, d, k] = await Promise.all([api.profil.ambil(), api.dompet.daftar(), api.kategori.daftar()]);
  store.profil = p;
  store.dompet = d;
  store.kategori = k;
}

export const kategoriById = (id) => store.kategori.find((k) => k.id === id);
export const dompetById = (id) => store.dompet.find((d) => d.id === id);
export const dompetAktif = () => store.dompet.filter((d) => d.aktif);
export const kategoriAktif = (tipe) =>
  store.kategori.filter((k) => k.aktif && (!tipe || k.tipe === tipe) && k.kode !== 'tarik_tabungan' && k.kode !== 'setor_tabungan' && k.kode !== 'bayar_hutang');
export const saldoTotal = () => jumlahkan(store.dompet.filter((d) => d.aktif), (d) => d.saldo);

/** Panggil setelah data berubah: muat ulang referensi lalu render ulang halaman aktif */
export async function segarkan() {
  await muatReferensi();
  window.dispatchEvent(new CustomEvent('data-berubah'));
}

// Sembunyikan nominal saldo (disimpan di perangkat)
export const privasi = {
  get aktif() { try { return localStorage.getItem('dk-sembunyi') === '1'; } catch { return false; } },
  toggle() { try { localStorage.setItem('dk-sembunyi', this.aktif ? '0' : '1'); } catch { /* abaikan */ } },
};
