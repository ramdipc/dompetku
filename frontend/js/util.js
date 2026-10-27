// Fungsi bantu umum: format uang, tanggal, dan keamanan teks

const fmtRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fmtAngka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** 1500000 → "Rp 1.500.000" */
export const rupiah = (n) => fmtRp.format(Math.round(Number(n) || 0)).replace(/ /g, ' ');

/** 1500000 → "1.500.000" */
export const angka = (n) => fmtAngka.format(Math.round(Number(n) || 0));

/** 1500000 → "1,5 jt"; 250000 → "250 rb" */
export function ringkas(n) {
  const v = Math.abs(Number(n) || 0);
  const s = n < 0 ? '-' : '';
  if (v >= 1e9) return s + (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (v >= 1e6) return s + (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (v >= 1e3) return s + Math.round(v / 1e3) + ' rb';
  return s + Math.round(v);
}

/** "1.250.000" / "Rp1.250.000" → 1250000 */
export const parseRupiah = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;

export const persen = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Cegah teks berbahaya (XSS) saat menaruh data ke HTML */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- Tanggal (selalu pakai tanggal lokal, bukan UTC) ----------
const pad = (n) => String(n).padStart(2, '0');
export const keISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dariISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const hariIni = () => keISO(new Date());

/** "2026-10" untuk bulan berjalan */
export const bulanIni = () => hariIni().slice(0, 7);

/** tambahBulan("2026-10", -1) → "2026-09" */
export function tambahBulan(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
/** Rentang tanggal sebuah bulan: { dari: '2026-10-01', sampai: '2026-11-01' } (sampai = eksklusif) */
export const rentangBulan = (ym) => ({ dari: `${ym}-01`, sampai: `${tambahBulan(ym, 1)}-01` });
export const jumlahHari = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

const NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
export const namaBulan = (ym) => { const [y, m] = ym.split('-').map(Number); return `${NAMA_BULAN[m - 1]} ${y}`; };
export const namaBulanPendek = (ym) => NAMA_BULAN[Number(ym.split('-')[1]) - 1].slice(0, 3);

/** "2026-10-27" → "Selasa, 27 Okt" (atau "Hari ini"/"Kemarin") */
export function labelTanggal(iso) {
  const d = dariISO(iso);
  const selisih = Math.round((dariISO(hariIni()) - d) / 864e5);
  if (selisih === 0) return 'Hari ini';
  if (selisih === 1) return 'Kemarin';
  return `${NAMA_HARI[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
export const tanggalPendek = (iso) => { const d = dariISO(iso); return `${d.getDate()} ${NAMA_BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };

/** Selisih hari dari hari ini ke tanggal iso (positif = di masa depan) */
export const hariMenuju = (iso) => Math.round((dariISO(iso) - dariISO(hariIni())) / 864e5);

/** Tanggal jatuh tempo berikutnya untuk tanggal bulanan (1–31) */
export function jatuhTempoBerikutnya(tgl) {
  if (!tgl) return null;
  const now = dariISO(hariIni());
  for (let i = 0; i < 2; i++) {
    const y = now.getFullYear(), m = now.getMonth() + i;
    const maks = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(tgl, maks));
    if (d >= now) return keISO(d);
  }
  return null;
}

/** Perkiraan jumlah bulan dari hari ini sampai tanggal iso (min 1) */
export const bulanMenuju = (iso) => Math.max(1, Math.ceil(hariMenuju(iso) / 30.44));

/** Kelompokkan array berdasarkan kunci */
export function kelompokkan(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

export const jumlahkan = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
