// Halaman BUDGET & JAJAN: batas pengeluaran per kategori + analisis kebiasaan jajan
import * as api from '../api.js';
import { store, segarkan } from '../store.js';
import { $, ikon, toast, bukaSheet, pasangInputRupiah, sambilMemuat, progres, kosong } from '../ui.js';
import { esc, rupiah, ringkas, angka, persen, parseRupiah, bulanIni, namaBulan, jumlahHari, jumlahkan } from '../util.js';

export async function render(el) {
  const ym = bulanIni();
  const trx = (await api.transaksi.bulan(ym)).filter((t) => t.tipe === 'keluar');
  const hariKe = new Date().getDate();
  const totalHari = jumlahHari(ym);
  const pakai = new Map();
  for (const t of trx) pakai.set(t.kategori_id, (pakai.get(t.kategori_id) || 0) + Number(t.jumlah));

  const keluar = store.kategori.filter((k) => k.tipe === 'keluar' && k.aktif && !k.kode);
  const denganBatas = keluar.filter((k) => k.batas_bulanan > 0)
    .map((k) => ({ ...k, pakai: pakai.get(k.id) || 0 }))
    .sort((a, b) => b.pakai / b.batas_bulanan - a.pakai / a.batas_bulanan);
  const tanpaBatas = keluar.filter((k) => !(k.batas_bulanan > 0))
    .map((k) => ({ ...k, pakai: pakai.get(k.id) || 0 }))
    .sort((a, b) => b.is_jajan - a.is_jajan || b.pakai - a.pakai);

  const totalBatas = jumlahkan(denganBatas, (k) => k.batas_bulanan);
  const totalPakai = jumlahkan(denganBatas, (k) => k.pakai);

  // analisis jajan
  const idJajan = new Set(store.kategori.filter((k) => k.is_jajan).map((k) => k.id));
  const jajan = trx.filter((t) => idJajan.has(t.kategori_id));
  const totalJajan = jumlahkan(jajan, (t) => t.jumlah);
  const proyeksi = (totalJajan / Math.max(1, hariKe)) * totalHari;
  const perKatJajan = [...idJajan].map((id) => ({ k: store.kategori.find((x) => x.id === id), n: jajan.filter((t) => t.kategori_id === id).length, total: pakai.get(id) || 0 }))
    .filter((x) => x.total > 0).sort((a, b) => b.total - a.total);

  el.innerHTML = `
    <header class="kepala-halaman"><a class="btn-ikon" href="#/beranda" aria-label="Kembali">${ikon('arrow-left')}</a><h1>Budget & jajan</h1><span></span></header>
    <p class="teks-sekunder">${namaBulan(ym)} · hari ke-${hariKe} dari ${totalHari} (${persen(hariKe, totalHari)}%)</p>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('coffee')} List jajan bulan ini</h2>
      <div class="grid-3 rapat">
        <div><span class="teks-kecil">Total</span><b>${ringkas(totalJajan)}</b></div>
        <div><span class="teks-kecil">Frekuensi</span><b>${jajan.length}x</b></div>
        <div><span class="teks-kecil">Proyeksi</span><b>${ringkas(proyeksi)}</b></div>
      </div>
      ${perKatJajan.length ? `<div class="daftar">${perKatJajan.map((x) => `
        <div class="baris-sederhana"><span>${ikon(x.k.ikon)} ${esc(x.k.nama)} <small class="teks-kecil">${x.n}x · rata² ${ringkas(x.total / x.n)}</small></span><b>${rupiah(x.total)}</b></div>`).join('')}</div>`
        : '<p class="teks-kecil">Belum ada jajan bulan ini. Hebat!</p>'}
      ${jajan.length >= 8 ? `<p class="catatan-info">${ikon('bulb')} Kurangi jajan 2x seminggu (±${ringkas((totalJajan / Math.max(1, jajan.length)) * 8)}/bulan) lalu pindahkan ke tabungan → setahun terkumpul ±${ringkas((totalJajan / jajan.length) * 8 * 12)}.</p>` : ''}
    </section>

    <section>
      <div class="judul-seksi"><h2>Budget per kategori</h2><span class="teks-kecil">${ringkas(totalPakai)} / ${ringkas(totalBatas)}</span></div>
      ${denganBatas.length ? `<div class="kartu tumpuk-rapat">${denganBatas.map((k) => barisBudget(k, hariKe, totalHari)).join('')}</div>`
        : kosong('target', 'Belum ada budget', 'Pilih kategori di bawah lalu tentukan batas maksimal per bulan.')}
    </section>

    <section>
      <div class="judul-seksi"><h2>Atur batas kategori lain</h2></div>
      <div class="kartu daftar">${tanpaBatas.map((k) => `
        <button class="baris-sederhana" data-atur="${k.id}">
          <span>${ikon(k.ikon)} ${esc(k.nama)}${k.is_jajan ? ' <em class="lencana">jajan</em>' : ''}</span>
          <span class="teks-kecil">${k.pakai ? ringkas(k.pakai) + ' bln ini · ' : ''}${ikon('plus')}</span></button>`).join('')}</div>
    </section>`;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-atur]');
    if (b) formBatas(store.kategori.find((k) => k.id === b.dataset.atur), pakai.get(b.dataset.atur) || 0);
  });
}

function barisBudget(k, hariKe, totalHari) {
  const p = persen(k.pakai, k.batas_bulanan);
  const ideal = persen(hariKe, totalHari);
  const warna = p >= 100 ? 'merah' : p >= 80 || p > ideal + 20 ? 'kuning' : 'hijau';
  const sisa = k.batas_bulanan - k.pakai;
  return `
    <button class="budget-baris" data-atur="${k.id}">
      <div class="baris-antara"><span>${ikon(k.ikon)} <b>${esc(k.nama)}</b></span><span class="${p >= 100 ? 'teks-bahaya' : ''}">${p}%</span></div>
      <div class="progres-wadah">${progres(p, warna)}<i class="penanda-ideal" style="left:${Math.min(100, ideal)}%" title="Posisi ideal hari ini"></i></div>
      <div class="baris-antara teks-kecil"><span>${rupiah(k.pakai)} dari ${rupiah(k.batas_bulanan)}</span>
        <span>${sisa >= 0 ? `sisa ${ringkas(sisa)} · ${ringkas(sisa / Math.max(1, totalHari - hariKe + 1))}/hari` : `lebih ${ringkas(-sisa)}`}</span></div>
    </button>`;
}

function formBatas(k, terpakai) {
  bukaSheet({
    judul: `Budget ${k.nama}`,
    isi: `<form id="f-batas" novalidate>
      <p class="teks-sekunder">Terpakai bulan ini: <b>${rupiah(terpakai)}</b>. Kosongkan untuk menghapus batas.</p>
      <label class="field field-jumlah"><span>Batas per bulan</span>
        <div class="input-rp"><b>Rp</b><input name="batas" inputmode="numeric" value="${k.batas_bulanan ? angka(k.batas_bulanan) : ''}" autofocus></div></label>
      <label class="cek"><input type="checkbox" name="jajan" ${k.is_jajan ? 'checked' : ''}> Masukkan ke list jajan</label>
      <button class="btn btn-utama btn-penuh" type="submit">${ikon('check')} Simpan</button></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-batas', el);
      pasangInputRupiah(f.batas);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const batas = parseRupiah(f.batas.value);
        await sambilMemuat(f.querySelector('button'), async () => {
          try {
            await api.kategori.simpan({ batas_bulanan: batas > 0 ? batas : null, is_jajan: f.jajan.checked }, k.id);
            tutup(); toast('Budget disimpan', 'sukses'); await segarkan();
          } catch (ex) { toast(api.pesanError(ex), 'error'); }
        });
      };
    },
  });
}
