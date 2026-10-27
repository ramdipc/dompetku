// Halaman HUTANG / LIABILITAS: daftar, strategi pelunasan, bayar cicilan, riwayat
import * as api from '../api.js';
import { store, dompetAktif, segarkan } from '../store.js';
import { $, $$, ikon, toast, bukaSheet, konfirmasi, pasangInputRupiah, ambilForm, sambilMemuat, progres, kosong } from '../ui.js';
import { esc, rupiah, ringkas, angka, persen, hariIni, jatuhTempoBerikutnya, hariMenuju, tanggalPendek, jumlahkan } from '../util.js';
import { urutkanHutang } from '../insight.js';

const JENIS = { cicilan: 'Cicilan', paylater: 'Paylater', kartu_kredit: 'Kartu kredit', pinjaman: 'Pinjaman bank', pribadi: 'Pinjaman pribadi', lainnya: 'Lainnya' };
const IKON_JENIS = { cicilan: 'motorbike', paylater: 'clock-dollar', kartu_kredit: 'credit-card', pinjaman: 'building-bank', pribadi: 'user-dollar', lainnya: 'file-invoice' };

export async function render(el) {
  const semua = await api.hutang.daftar();
  const strategi = store.profil?.strategi_hutang || 'avalanche';
  const aktif = urutkanHutang(semua.filter((h) => h.status === 'aktif'), strategi);
  const lunas = semua.filter((h) => h.status === 'lunas');
  const totalSisa = jumlahkan(aktif, (h) => h.sisa);
  const totalCicilan = jumlahkan(aktif, (h) => h.cicilan_bulanan);
  const pendapatan = Number(store.profil?.pendapatan_bulanan) || 0;
  const rasio = persen(totalCicilan, pendapatan);
  const totalAwal = jumlahkan(aktif, (h) => h.total_awal);

  el.innerHTML = `
    <header class="kepala-halaman"><h1>Hutang</h1>
      <div class="aksi-kepala"><button class="btn btn-utama kecil" id="tambah-hutang">${ikon('plus')} Tambah</button></div></header>

    <section class="kartu ringkasan-hutang">
      <span class="teks-kecil">Total sisa hutang</span>
      <p class="angka-besar">${rupiah(totalSisa)}</p>
      ${progres(persen(totalAwal - totalSisa, totalAwal), 'hijau')}
      <p class="teks-kecil">${persen(totalAwal - totalSisa, totalAwal)}% sudah terbayar dari ${rupiah(totalAwal)}</p>
      <div class="grid-2 rapat">
        <div><span class="teks-kecil">Cicilan / bulan</span><b>${rupiah(totalCicilan)}</b></div>
        <div><span class="teks-kecil">Rasio cicilan</span>
          <b class="${rasio > 30 ? 'teks-bahaya' : rasio > 20 ? 'teks-waspada' : 'teks-sukses'}">${pendapatan ? rasio + '%' : '—'}</b>
          <small class="teks-kecil">${pendapatan ? 'aman ≤ 30%' : '<a href="#/pengaturan">isi pendapatan</a>'}</small></div>
      </div>
    </section>

    ${aktif.length >= 2 ? `
    <section class="kartu">
      <div class="baris-antara"><h2 class="h-kecil">${ikon('target-arrow')} Strategi pelunasan</h2></div>
      <div class="segmen" role="tablist">
        <button role="tab" data-strategi="avalanche" aria-selected="${strategi === 'avalanche'}">Avalanche</button>
        <button role="tab" data-strategi="snowball" aria-selected="${strategi === 'snowball'}">Snowball</button>
      </div>
      <p class="teks-kecil">${strategi === 'avalanche'
        ? 'Lunasi bunga tertinggi dulu → total bunga paling hemat.'
        : 'Lunasi sisa terkecil dulu → cepat terasa ada yang lunas, bikin semangat.'} Bayar minimum untuk yang lain, sisa uang ke prioritas #1.</p>
    </section>` : ''}

    <section class="tumpuk">
      ${aktif.length ? aktif.map((h, i) => kartuHutang(h, i, aktif.length)).join('')
        : kosong('confetti', 'Tidak ada hutang aktif', 'Mantap! Kalau ada cicilan/pinjaman, catat di sini agar terpantau.')}
    </section>

    ${lunas.length ? `<details class="kartu lipat"><summary>${ikon('circle-check')} Sudah lunas (${lunas.length})</summary>
      <div class="daftar">${lunas.map((h) => `<button class="baris-sederhana" data-edit="${h.id}">
        <span>${ikon(IKON_JENIS[h.jenis])} ${esc(h.nama)}</span><span class="teks-sukses">${rupiah(h.total_awal)}</span></button>`).join('')}</div></details>` : ''}`;

  $('#tambah-hutang', el).onclick = () => formHutang();
  $$('[data-strategi]', el).forEach((b) => (b.onclick = async () => {
    try { await api.profil.simpan(store.user.id, { strategi_hutang: b.dataset.strategi }); await segarkan(); }
    catch (e) { toast(api.pesanError(e), 'error'); }
  }));
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-bayar],[data-edit],[data-riwayat]');
    if (!t) return;
    const h = semua.find((x) => x.id === (t.dataset.bayar || t.dataset.edit || t.dataset.riwayat));
    if (t.dataset.bayar) formBayar(h);
    else if (t.dataset.edit) formHutang(h);
    else riwayat(h);
  });
}

function kartuHutang(h, i, n) {
  const jt = jatuhTempoBerikutnya(h.tgl_jatuh_tempo);
  const sisaHari = jt ? hariMenuju(jt) : null;
  const p = persen(h.total_awal - h.sisa, h.total_awal);
  const estBulan = h.cicilan_bulanan > 0 ? Math.ceil(h.sisa / h.cicilan_bulanan) : null;
  const bungaBulan = (h.sisa * h.bunga_persen_tahun) / 100 / 12;
  return `
    <article class="kartu kartu-hutang ${h.bunga_persen_tahun >= 20 ? 'garis-bahaya' : ''}">
      <header class="baris-antara">
        <div class="judul-ikon">${ikon(IKON_JENIS[h.jenis] || 'file-invoice')}
          <div><b>${esc(h.nama)}</b><small>${esc(JENIS[h.jenis])}${h.pemberi && h.pemberi !== JENIS[h.jenis] ? ' · ' + esc(h.pemberi) : ''}</small></div></div>
        ${n >= 2 ? `<span class="lencana ${i === 0 ? 'lencana-utama' : ''}">#${i + 1}${i === 0 ? ' prioritas' : ''}</span>` : ''}
      </header>
      <div class="baris-antara"><span class="teks-kecil">Sisa</span><b class="angka-sedang">${rupiah(h.sisa)}</b></div>
      ${progres(p, 'biru')}
      <div class="info-grid">
        <span>${ikon('percentage')} ${p}% terbayar</span>
        <span>${ikon('calendar-repeat')} ${h.cicilan_bulanan ? ringkas(h.cicilan_bulanan) + '/bln' : 'tanpa cicilan tetap'}</span>
        <span>${ikon('flame')} bunga ${angka(h.bunga_persen_tahun)}%/th${bungaBulan >= 1000 ? ` (±${ringkas(bungaBulan)}/bln)` : ''}</span>
        <span class="${sisaHari !== null && sisaHari <= 3 ? 'teks-bahaya' : ''}">${ikon('calendar-due')} ${jt ? (sisaHari === 0 ? 'jatuh tempo hari ini' : `tempo ${tanggalPendek(jt)} (${sisaHari} hr)`) : 'tanpa tempo'}</span>
      </div>
      ${estBulan ? `<p class="teks-kecil">${ikon('hourglass')} Perkiraan lunas ±${estBulan} bulan lagi jika bayar ${ringkas(h.cicilan_bulanan)}/bulan.</p>` : ''}
      <div class="aksi-baris">
        <button class="btn btn-sekunder kecil" data-riwayat="${h.id}">${ikon('history')} Riwayat</button>
        <button class="btn btn-sekunder kecil" data-edit="${h.id}">${ikon('edit')} Ubah</button>
        <button class="btn btn-utama kecil" data-bayar="${h.id}">${ikon('cash')} Bayar</button>
      </div>
    </article>`;
}

function formHutang(h = null) {
  bukaSheet({
    judul: h ? 'Ubah hutang' : 'Tambah hutang',
    isi: `<form id="f-hutang" novalidate>
      <label class="field"><span>Nama hutang</span><input name="nama" maxlength="60" value="${esc(h?.nama || '')}" placeholder="mis. Cicilan motor" autofocus></label>
      <div class="dua-kolom">
        <label class="field"><span>Jenis</span><select name="jenis">${Object.entries(JENIS).map(([v, l]) => `<option value="${v}" ${h?.jenis === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Kepada (opsional)</span><input name="pemberi" maxlength="60" value="${esc(h?.pemberi || '')}" placeholder="Leasing / bank / teman"></label>
      </div>
      <div class="dua-kolom">
        <label class="field"><span>Total pinjaman awal</span><div class="input-rp"><b>Rp</b><input name="total_awal" inputmode="numeric" data-rupiah value="${h ? angka(h.total_awal) : ''}"></div></label>
        <label class="field"><span>Sisa saat ini</span><div class="input-rp"><b>Rp</b><input name="sisa" inputmode="numeric" data-rupiah value="${h ? angka(h.sisa) : ''}" placeholder="sama dgn total"></div></label>
      </div>
      <div class="dua-kolom">
        <label class="field"><span>Cicilan / bulan</span><div class="input-rp"><b>Rp</b><input name="cicilan_bulanan" inputmode="numeric" data-rupiah value="${h?.cicilan_bulanan ? angka(h.cicilan_bulanan) : ''}"></div></label>
        <label class="field"><span>Bunga % per tahun</span><input name="bunga_persen_tahun" inputmode="decimal" value="${h ? String(h.bunga_persen_tahun).replace('.', ',') : ''}" placeholder="0"></label>
      </div>
      <label class="field"><span>Tanggal jatuh tempo tiap bulan</span><input name="tgl_jatuh_tempo" type="number" min="1" max="31" value="${h?.tgl_jatuh_tempo || ''}" placeholder="1–31"></label>
      <label class="field"><span>Catatan (opsional)</span><input name="catatan" maxlength="200" value="${esc(h?.catatan || '')}"></label>
      <p class="teks-kecil">${ikon('info-circle')} Tidak tahu bunganya? Paylater & kartu kredit umumnya 20–40%/tahun. Cek di aplikasi/tagihannya.</p>
      <p class="error-form" id="err-h" role="alert"></p>
      <div class="aksi-baris">
        ${h ? `<button type="button" class="btn btn-bahaya-garis" id="hapus-h">${ikon('trash')} Hapus</button>` : ''}
        <button class="btn btn-utama" type="submit">${ikon('check')} Simpan</button>
      </div></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-hutang', el);
      $$('[data-rupiah]', f).forEach(pasangInputRupiah);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = ambilForm(f), err = $('#err-h', el);
        d.bunga_persen_tahun = Number(String(d.bunga_persen_tahun || '0').replace(',', '.'));
        d.tgl_jatuh_tempo = d.tgl_jatuh_tempo ? Number(d.tgl_jatuh_tempo) : null;
        if (!d.sisa && !h) d.sisa = d.total_awal;
        d.pemberi = d.pemberi || null; d.catatan = d.catatan || null;
        if (!d.nama) return (err.textContent = 'Isi nama hutang.');
        if (d.total_awal <= 0) return (err.textContent = 'Isi total pinjaman awal.');
        if (d.sisa > d.total_awal) return (err.textContent = 'Sisa tidak boleh lebih besar dari total awal.');
        if (isNaN(d.bunga_persen_tahun) || d.bunga_persen_tahun < 0) return (err.textContent = 'Bunga tidak valid.');
        if (d.tgl_jatuh_tempo && (d.tgl_jatuh_tempo < 1 || d.tgl_jatuh_tempo > 31)) return (err.textContent = 'Tanggal jatuh tempo 1–31.');
        d.status = d.sisa === 0 ? 'lunas' : 'aktif';
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try { await api.hutang.simpan(d, h?.id); tutup(); toast('Hutang disimpan', 'sukses'); await segarkan(); }
          catch (ex) { err.textContent = api.pesanError(ex); }
        });
      };
      $('#hapus-h', el)?.addEventListener('click', async () => {
        if (!(await konfirmasi({ judul: `Hapus ${h.nama}?`, pesan: 'Riwayat pembayarannya ikut terhapus. Transaksi pengeluaran yang sudah tercatat tetap ada.', tombol: 'Hapus', bahaya: true }))) return;
        try { await api.hutang.hapus(h.id); toast('Hutang dihapus', 'sukses'); await segarkan(); }
        catch (ex) { toast(api.pesanError(ex), 'error'); }
      });
    },
  });
}

function formBayar(h) {
  const dompets = dompetAktif();
  const saran = Math.min(h.cicilan_bulanan || h.sisa, h.sisa);
  bukaSheet({
    judul: `Bayar ${h.nama}`,
    isi: `<form id="f-bayar" novalidate>
      <p class="teks-sekunder">Sisa hutang <b>${rupiah(h.sisa)}</b>. Pembayaran otomatis tercatat sebagai pengeluaran.</p>
      <label class="field field-jumlah"><span>Jumlah bayar</span>
        <div class="input-rp"><b>Rp</b><input name="jumlah" inputmode="numeric" data-rupiah value="${angka(saran)}" autofocus></div></label>
      <div class="chip-filter">
        ${h.cicilan_bulanan ? `<button type="button" data-isi="${Math.min(h.cicilan_bulanan, h.sisa)}">Cicilan ${ringkas(h.cicilan_bulanan)}</button>` : ''}
        <button type="button" data-isi="${h.sisa}">Lunasi ${ringkas(h.sisa)}</button>
      </div>
      <div class="dua-kolom">
        <label class="field"><span>Dari dompet</span><select name="dompet_id">${dompets.map((d) => `<option value="${d.id}">${esc(d.nama)} · ${rupiah(d.saldo)}</option>`).join('')}</select></label>
        <label class="field"><span>Tanggal</span><input type="date" name="tanggal" value="${hariIni()}"></label>
      </div>
      <p class="error-form" id="err-b" role="alert"></p>
      <button class="btn btn-utama btn-penuh" type="submit">${ikon('check')} Catat pembayaran</button></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-bayar', el);
      pasangInputRupiah(f.jumlah);
      $$('[data-isi]', el).forEach((b) => (b.onclick = () => { f.jumlah.value = angka(b.dataset.isi); }));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = ambilForm(f), err = $('#err-b', el);
        if (d.jumlah <= 0) return (err.textContent = 'Isi jumlah pembayaran.');
        if (d.jumlah > h.sisa) return (err.textContent = `Maksimal ${rupiah(h.sisa)}.`);
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try {
            const r = await api.hutang.bayar(h.id, d.jumlah, d.dompet_id, d.tanggal);
            tutup();
            toast(r.lunas ? `🎉 ${h.nama} LUNAS!` : `Tercatat. Sisa ${rupiah(r.sisa)}`, 'sukses');
            await segarkan();
          } catch (ex) { err.textContent = api.pesanError(ex); }
        });
      };
    },
  });
}

async function riwayat(h) {
  let list = [];
  try { list = await api.hutang.riwayat(h.id); } catch (e) { return toast(api.pesanError(e), 'error'); }
  bukaSheet({
    judul: `Riwayat ${h.nama}`,
    isi: list.length ? `<div class="daftar">${list.map((p) => `<div class="baris-sederhana"><span>${tanggalPendek(p.tanggal)}</span><b>${rupiah(p.jumlah)}</b></div>`).join('')}</div>
      <p class="teks-kecil">Total dibayar lewat aplikasi: <b>${rupiah(jumlahkan(list, (p) => p.jumlah))}</b>. Untuk membatalkan, hapus transaksinya di menu Transaksi.</p>`
      : kosong('history', 'Belum ada pembayaran', 'Pembayaran yang dicatat lewat tombol Bayar akan muncul di sini.'),
  });
}
