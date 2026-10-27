// Halaman ANALISIS & INSIGHT: semua rekomendasi, 50/30/20, tren 6 bulan, kategori terbesar, tips
import * as api from '../api.js';
import { store } from '../store.js';
import { ikon, kosong } from '../ui.js';
import { esc, rupiah, ringkas, persen, namaBulan, namaBulanPendek, bulanIni, tambahBulan } from '../util.js';
import { hitungInsight, TIPS } from '../insight.js';

/** Kartu insight (dipakai juga di Beranda) */
export function kartuInsight(x) {
  const isi = `${ikon(x.ikon)}<div><b>${esc(x.judul)}</b><p>${esc(x.pesan)}</p>${x.saran ? `<p class="saran">${ikon('arrow-right')} ${esc(x.saran)}</p>` : ''}</div>`;
  return x.link
    ? `<a class="insight insight-${x.level}" href="${x.link}">${isi}</a>`
    : `<div class="insight insight-${x.level}">${isi}</div>`;
}

export async function render(el) {
  const [trx, hutang, tabungan, ringkasan] = await Promise.all([
    api.transaksi.beberapaBulan(3), api.hutang.daftar(), api.tabungan.daftar(), api.laporan.ringkasanBulanan(6)]);
  const { metrik: m, daftar } = hitungInsight({ trx, kategori: store.kategori, hutang, tabungan, profil: store.profil });

  // 50/30/20
  const acuan = m.pendapatanAcuan;
  const porsi = [
    { nama: 'Kebutuhan', nilai: m.kelompok.kebutuhan, ideal: 50, kelas: 'biru', ket: 'maks 50%' },
    { nama: 'Keinginan', nilai: m.kelompok.keinginan, ideal: 30, kelas: 'kuning', ket: 'maks 30%' },
    { nama: 'Tabungan & cicilan', nilai: m.kelompok.tabungan_hutang, ideal: 20, kelas: 'hijau', ket: 'min 20%' },
  ];

  // tren 6 bulan (isi bulan kosong dengan 0)
  const bulan = Array.from({ length: 6 }, (_, i) => tambahBulan(bulanIni(), i - 5));
  const peta = new Map(ringkasan.map((r) => [r.bulan.slice(0, 7), r]));
  const tren = bulan.map((b) => ({ b, masuk: Number(peta.get(b)?.pemasukan || 0), keluar: Number(peta.get(b)?.pengeluaran || 0) }));
  const maks = Math.max(1, ...tren.flatMap((t) => [t.masuk, t.keluar]));
  const totalKeluar = m.keluar || 1;

  el.innerHTML = `
    <header class="kepala-halaman"><a class="btn-ikon" href="#/beranda" aria-label="Kembali">${ikon('arrow-left')}</a><h1>Insight & analisis</h1><span></span></header>
    <p class="teks-sekunder">${namaBulan(bulanIni())} · dihitung otomatis dari data kamu</p>

    <section>
      <div class="judul-seksi"><h2>Rekomendasi (${daftar.length})</h2></div>
      <div class="tumpuk">${daftar.length ? daftar.map(kartuInsight).join('')
        : kosong('bulb-off', 'Belum ada insight', 'Catat transaksi beberapa hari dulu, insight akan muncul otomatis.')}</div>
    </section>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('chart-pie')} Aturan 50/30/20</h2>
      ${acuan ? `<p class="teks-kecil">Dibandingkan pendapatan ${rupiah(acuan)}</p>
        ${porsi.map((p) => {
          const pct = persen(p.nilai, acuan);
          const masalah = p.ideal === 20 ? pct < 20 : pct > p.ideal;
          return `<div class="porsi">
            <div class="baris-antara"><span>${p.nama} <small class="teks-kecil">${p.ket}</small></span>
              <b class="${masalah ? 'teks-waspada' : 'teks-sukses'}">${pct}%</b></div>
            <div class="progres-wadah"><div class="progres"><div class="progres-isi ${p.kelas}" style="width:${Math.min(100, pct)}%"></div></div>
              <i class="penanda-ideal" style="left:${p.ideal}%" title="Ideal ${p.ideal}%"></i></div>
            <small class="teks-kecil">${rupiah(p.nilai)} · ideal ${rupiah((acuan * p.ideal) / 100)}</small></div>`;
        }).join('')}`
        : `<p class="teks-kecil">Isi pendapatan bulanan di <a href="#/pengaturan">Pengaturan</a> atau catat pemasukan bulan ini.</p>`}
    </section>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('chart-bar')} Tren 6 bulan</h2>
      <div class="legenda"><span><i class="titik hijau"></i>Masuk</span><span><i class="titik merah"></i>Keluar</span></div>
      <div class="grafik-batang" role="img" aria-label="Grafik pemasukan dan pengeluaran 6 bulan terakhir">
        ${tren.map((t) => `
          <div class="kolom-grafik" title="${namaBulan(t.b)}: masuk ${rupiah(t.masuk)}, keluar ${rupiah(t.keluar)}">
            <div class="pasangan">
              <div class="batang hijau" style="height:${(t.masuk / maks) * 100}%"></div>
              <div class="batang merah" style="height:${(t.keluar / maks) * 100}%"></div>
            </div>
            <small>${namaBulanPendek(t.b)}</small>
          </div>`).join('')}
      </div>
      <div class="daftar ringkas">${tren.slice().reverse().filter((t) => t.masuk || t.keluar).slice(0, 3).map((t) => `
        <div class="baris-sederhana"><span>${namaBulan(t.b)}</span>
        <span class="${t.masuk - t.keluar >= 0 ? 'teks-sukses' : 'teks-bahaya'}">${t.masuk - t.keluar >= 0 ? '+' : '−'}${rupiah(Math.abs(t.masuk - t.keluar))}</span></div>`).join('')}</div>
    </section>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('list-numbers')} Pengeluaran terbesar bulan ini</h2>
      ${m.topKategori.length ? `<div class="tumpuk-rapat">${m.topKategori.slice(0, 6).map((k) => `
        <div class="porsi"><div class="baris-antara"><span>${ikon(k.ikon)} ${esc(k.nama)}</span><b>${ringkas(k.total)}</b></div>
        <div class="progres"><div class="progres-isi biru" style="width:${persen(k.total, totalKeluar)}%"></div></div>
        <small class="teks-kecil">${persen(k.total, totalKeluar)}% dari total pengeluaran</small></div>`).join('')}</div>`
        : '<p class="teks-kecil">Belum ada pengeluaran bulan ini.</p>'}
    </section>

    <section>
      <div class="judul-seksi"><h2>Tips keuangan</h2></div>
      <div class="grid-2 tips">${TIPS.map((t) => `<div class="kartu tip">${ikon(t.ikon)}<b>${esc(t.judul)}</b><p>${esc(t.isi)}</p></div>`).join('')}</div>
    </section>`;
}
