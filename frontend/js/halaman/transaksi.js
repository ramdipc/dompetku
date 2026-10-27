// Halaman TRANSAKSI: daftar per bulan, filter, pencarian, ekspor CSV
import * as api from '../api.js';
import { kategoriById, dompetById } from '../store.js';
import { $, $$, ikon, kosong } from '../ui.js';
import { esc, rupiah, ringkas, bulanIni, tambahBulan, namaBulan, labelTanggal, kelompokkan, jumlahkan } from '../util.js';
import { bukaFormTransaksi } from './form-transaksi.js';

/** Satu baris transaksi (dipakai juga di Beranda) */
export function barisTransaksi(t, sembunyi = false) {
  const k = kategoriById(t.kategori_id);
  const d = dompetById(t.dompet_id);
  const judul = t.tipe === 'transfer' ? `Transfer ke ${dompetById(t.dompet_tujuan_id)?.nama ?? 'dompet'}` : (k?.nama ?? 'Tanpa kategori');
  const ik = t.tipe === 'transfer' ? 'arrows-exchange' : (k?.ikon ?? 'tag');
  const tanda = t.tipe === 'masuk' ? '+' : t.tipe === 'keluar' ? '−' : '';
  const kelas = t.tipe === 'masuk' ? 'teks-sukses' : t.tipe === 'keluar' ? 'teks-bahaya' : 'teks-sekunder';
  return `
    <button class="baris-trx" data-trx="${t.id}">
      <span class="ikon-bulat ${t.tipe}">${ikon(ik)}</span>
      <span class="baris-trx-teks">
        <b>${esc(judul)}${k?.is_jajan ? ' <em class="lencana">jajan</em>' : ''}</b>
        <small>${esc(t.catatan || '')}${t.catatan ? ' · ' : ''}${esc(d?.nama ?? '')}</small>
      </span>
      <span class="${kelas} nominal">${sembunyi ? '••••' : tanda + rupiah(t.jumlah).replace('Rp ', 'Rp')}</span>
    </button>`;
}

let bulan = bulanIni();
let filter = 'semua';
let cari = '';

export async function render(el) {
  const trx = await api.transaksi.bulan(bulan);

  const gambar = () => {
    const q = cari.toLowerCase();
    const terfilter = trx.filter((t) =>
      (filter === 'semua' || t.tipe === filter || (filter === 'jajan' && kategoriById(t.kategori_id)?.is_jajan)) &&
      (!q || (t.catatan || '').toLowerCase().includes(q) || (kategoriById(t.kategori_id)?.nama || '').toLowerCase().includes(q)));
    const perTanggal = kelompokkan(terfilter, (t) => t.tanggal);
    const masuk = jumlahkan(trx.filter((t) => t.tipe === 'masuk' && kategoriById(t.kategori_id)?.kode !== 'tarik_tabungan'), (t) => t.jumlah);
    const keluar = jumlahkan(trx.filter((t) => t.tipe === 'keluar'), (t) => t.jumlah);

    $('#isi-trx', el).innerHTML = `
      <section class="grid-3">
        <div class="metrik kecil"><span>Masuk</span><b class="teks-sukses">${ringkas(masuk)}</b></div>
        <div class="metrik kecil"><span>Keluar</span><b class="teks-bahaya">${ringkas(keluar)}</b></div>
        <div class="metrik kecil"><span>Selisih</span><b>${ringkas(masuk - keluar)}</b></div>
      </section>
      ${terfilter.length ? [...perTanggal.entries()].map(([tgl, list]) => {
        const net = jumlahkan(list, (t) => (t.tipe === 'masuk' ? t.jumlah : t.tipe === 'keluar' ? -t.jumlah : 0));
        return `<section class="grup-tanggal">
          <div class="judul-tanggal"><span>${labelTanggal(tgl)}</span><span class="${net >= 0 ? 'teks-sukses' : 'teks-sekunder'}">${net >= 0 ? '+' : '−'}${rupiah(Math.abs(net))}</span></div>
          <div class="kartu daftar">${list.map((t) => barisTransaksi(t)).join('')}</div></section>`;
      }).join('') : kosong('receipt-off', 'Tidak ada transaksi', cari || filter !== 'semua' ? 'Coba ubah filter atau kata kunci.' : 'Tekan tombol + untuk mencatat transaksi.')}`;
  };

  el.innerHTML = `
    <header class="kepala-halaman">
      <h1>Transaksi</h1>
      <div class="aksi-kepala"><button class="btn-ikon" id="unduh-csv" aria-label="Unduh CSV bulan ini">${ikon('file-download')}</button></div>
    </header>
    <div class="pemilih-bulan">
      <button class="btn-ikon" id="bln-mundur" aria-label="Bulan sebelumnya">${ikon('chevron-left')}</button>
      <b>${namaBulan(bulan)}</b>
      <button class="btn-ikon" id="bln-maju" aria-label="Bulan berikutnya" ${bulan >= bulanIni() ? 'disabled' : ''}>${ikon('chevron-right')}</button>
    </div>
    <label class="cari">${ikon('search')}<input id="cari" type="search" placeholder="Cari catatan atau kategori" value="${esc(cari)}" aria-label="Cari transaksi"></label>
    <div class="chip-filter" role="tablist">
      ${[['semua', 'Semua'], ['keluar', 'Keluar'], ['masuk', 'Masuk'], ['transfer', 'Transfer'], ['jajan', 'Jajan']]
        .map(([v, l]) => `<button role="tab" data-filter="${v}" aria-selected="${filter === v}">${l}</button>`).join('')}
    </div>
    <div id="isi-trx"></div>`;

  gambar();

  $('#bln-mundur', el).onclick = () => { bulan = tambahBulan(bulan, -1); window.dispatchEvent(new Event('data-berubah')); };
  $('#bln-maju', el).onclick = () => { bulan = tambahBulan(bulan, 1); window.dispatchEvent(new Event('data-berubah')); };
  $('#cari', el).oninput = (e) => { cari = e.target.value; gambar(); };
  $$('[data-filter]', el).forEach((b) => (b.onclick = () => {
    filter = b.dataset.filter;
    $$('[data-filter]', el).forEach((x) => x.setAttribute('aria-selected', x === b));
    gambar();
  }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trx]');
    if (b) bukaFormTransaksi(trx.find((t) => t.id === b.dataset.trx));
  });
  $('#unduh-csv', el).onclick = () => unduhCSV(trx, `transaksi-${bulan}.csv`);
}

export function unduhCSV(trx, namaFile) {
  const kolom = ['tanggal', 'tipe', 'kategori', 'jumlah', 'dompet', 'dompet_tujuan', 'catatan'];
  const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const baris = [...trx].sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((t) => [
    t.tanggal, t.tipe, kategoriById(t.kategori_id)?.nama ?? '', t.jumlah,
    dompetById(t.dompet_id)?.nama ?? '', dompetById(t.dompet_tujuan_id)?.nama ?? '', t.catatan ?? '',
  ].map(sel).join(';'));
  const blob = new Blob(['﻿' + [kolom.join(';'), ...baris].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: namaFile });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

