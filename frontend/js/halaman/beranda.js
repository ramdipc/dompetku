// Halaman BERANDA: saldo, ringkasan bulan ini, insight teratas, budget jajan, transaksi terakhir
import * as api from '../api.js';
import { store, saldoTotal, privasi, segarkan } from '../store.js';
import { $, ikon, toast, progres, sambilMemuat } from '../ui.js';
import { esc, rupiah, ringkas, namaBulan, bulanIni, persen, jumlahkan } from '../util.js';
import { hitungInsight } from '../insight.js';
import { kartuInsight } from './analisis.js';
import { barisTransaksi } from './transaksi.js';
import { bukaFormTransaksi } from './form-transaksi.js';

export async function render(el) {
  const [trx, hutang, tabungan] = await Promise.all([api.transaksi.beberapaBulan(3), api.hutang.daftar(), api.tabungan.daftar()]);
  const { metrik: m, daftar } = hitungInsight({ trx, kategori: store.kategori, hutang, tabungan, profil: store.profil });
  const sembunyi = privasi.aktif;
  const uang = (n) => (sembunyi ? 'Rp ••••••' : rupiah(n));
  const nama = store.profil?.nama || 'kamu';
  const kosongTotal = trx.length === 0 && hutang.length === 0 && tabungan.length === 0;
  const jam = new Date().getHours();
  const salam = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 19 ? 'Selamat sore' : 'Selamat malam';

  // budget jajan
  const ini = trx.filter((t) => t.tanggal.startsWith(bulanIni()) && t.tipe === 'keluar');
  const budgetJajan = store.kategori.filter((k) => k.is_jajan && k.aktif && k.batas_bulanan > 0).map((k) => {
    const pakai = jumlahkan(ini.filter((t) => t.kategori_id === k.id), (t) => t.jumlah);
    return { ...k, pakai, p: persen(pakai, k.batas_bulanan) };
  }).sort((a, b) => b.p - a.p).slice(0, 3);

  const hutangAktif = hutang.filter((h) => h.status === 'aktif');
  const totalTabungan = jumlahkan(tabungan.filter((t) => t.status !== 'arsip'), (t) => t.terkumpul);
  const penting = daftar.filter((d) => d.level !== 'info' || daftar.length <= 2).slice(0, 2);

  el.innerHTML = `
    <header class="kepala-halaman">
      <div><p class="teks-kecil">${salam},</p><h1>${esc(nama)}</h1></div>
      <div class="aksi-kepala">
        <a class="btn-ikon" href="#/analisis" aria-label="Insight & analisis">${ikon('bulb')}</a>
        <a class="btn-ikon" href="#/pengaturan" aria-label="Pengaturan">${ikon('settings')}</a>
      </div>
    </header>

    <section class="kartu-saldo">
      <div class="baris-antara">
        <span>Total saldo</span>
        <button class="btn-ikon kecil" id="toggle-privasi" aria-label="${sembunyi ? 'Tampilkan' : 'Sembunyikan'} nominal">${ikon(sembunyi ? 'eye-off' : 'eye')}</button>
      </div>
      <p class="angka-besar">${uang(saldoTotal())}</p>
      <div class="dompet-geser">
        ${store.dompet.filter((d) => d.aktif).map((d) => `
          <div class="chip-dompet">${ikon(d.jenis === 'bank' ? 'building-bank' : d.jenis === 'ewallet' ? 'device-mobile' : d.jenis === 'tunai' ? 'cash' : 'wallet')}
          <span>${esc(d.nama)}</span><b>${sembunyi ? '••••' : ringkas(d.saldo)}</b></div>`).join('')}
      </div>
    </section>

    <section class="grid-2">
      <div class="metrik"><span>${ikon('arrow-down-left')} Masuk ${namaBulan(bulanIni()).split(' ')[0]}</span><b class="teks-sukses">${uang(m.masuk)}</b></div>
      <div class="metrik"><span>${ikon('arrow-up-right')} Keluar</span><b class="teks-bahaya">${uang(m.keluar)}</b></div>
    </section>

    ${kosongTotal ? `
      <section class="kartu sambutan">
        <h2>${ikon('sparkles')} Selamat datang!</h2>
        <p class="teks-sekunder">Mulai catat transaksi pertamamu, atau isi data contoh dulu untuk melihat semua fitur & insight bekerja.</p>
        <div class="aksi-baris">
          <button class="btn btn-sekunder" id="isi-contoh">${ikon('database-import')} Isi data contoh</button>
          <button class="btn btn-utama" id="catat-pertama">${ikon('plus')} Catat transaksi</button>
        </div>
      </section>` : ''}

    ${penting.length ? `
      <section>
        <div class="judul-seksi"><h2>Insight untukmu</h2><a href="#/analisis">Semua (${daftar.length})</a></div>
        <div class="tumpuk">${penting.map(kartuInsight).join('')}</div>
      </section>` : ''}

    <section class="grid-2">
      <a class="metrik metrik-link" href="#/hutang"><span>${ikon('file-invoice')} Sisa hutang</span>
        <b>${uang(m.totalSisaHutang)}</b><small>${hutangAktif.length} aktif · cicilan ${ringkas(m.totalCicilan)}/bln</small></a>
      <a class="metrik metrik-link" href="#/tabungan"><span>${ikon('pig-money')} Tabungan</span>
        <b>${uang(totalTabungan)}</b><small>${tabungan.filter((t) => t.status === 'aktif').length} target aktif</small></a>
    </section>

    <section>
      <div class="judul-seksi"><h2>Budget jajan</h2><a href="#/budget">Kelola</a></div>
      ${budgetJajan.length ? `<div class="kartu tumpuk-rapat">${budgetJajan.map((b) => `
        <div class="budget-mini">
          <div class="baris-antara"><span>${ikon(b.ikon)} ${esc(b.nama)}</span><span class="${b.p >= 100 ? 'teks-bahaya' : ''}">${ringkas(b.pakai)} / ${ringkas(b.batas_bulanan)}</span></div>
          ${progres(b.p, b.p >= 100 ? 'merah' : b.p >= 80 ? 'kuning' : 'hijau')}
        </div>`).join('')}</div>`
        : `<a class="kartu kartu-ajak" href="#/budget">${ikon('target')} Atur batas jajan bulanan supaya tidak kebablasan ${ikon('chevron-right')}</a>`}
    </section>

    <section>
      <div class="judul-seksi"><h2>Transaksi terakhir</h2><a href="#/transaksi">Lihat semua</a></div>
      ${trx.length ? `<div class="kartu daftar">${trx.slice(0, 6).map((t) => barisTransaksi(t, sembunyi)).join('')}</div>`
        : '<p class="teks-sekunder tengah">Belum ada transaksi.</p>'}
    </section>`;

  $('#toggle-privasi', el).onclick = () => { privasi.toggle(); window.dispatchEvent(new Event('data-berubah')); };
  $('#catat-pertama', el)?.addEventListener('click', () => bukaFormTransaksi());
  $('#isi-contoh', el)?.addEventListener('click', (e) => sambilMemuat(e.currentTarget, async () => {
    try {
      const r = await api.data.isiContoh();
      toast(`Data contoh terisi: ${r.transaksi} transaksi`, 'sukses');
      await segarkan();
    } catch (ex) { toast(api.pesanError(ex), 'error'); }
  }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trx]');
    if (b) bukaFormTransaksi(trx.find((t) => t.id === b.dataset.trx));
  });
}
