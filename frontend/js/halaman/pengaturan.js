// Halaman PENGATURAN: profil, dompet, kategori, data (contoh/ekspor/reset), akun
import * as api from '../api.js';
import { store, segarkan } from '../store.js';
import { $, $$, ikon, toast, bukaSheet, konfirmasi, pasangInputRupiah, ambilForm, sambilMemuat } from '../ui.js';
import { esc, rupiah, angka, hariIni } from '../util.js';
import { unduhCSV } from './transaksi.js';

const JENIS_DOMPET = { tunai: ['Tunai', 'cash'], bank: ['Rekening bank', 'building-bank'], ewallet: ['E-wallet', 'device-mobile'], lainnya: ['Lainnya', 'wallet'] };
const KELOMPOK = { kebutuhan: 'Kebutuhan (50%)', keinginan: 'Keinginan (30%)', tabungan_hutang: 'Tabungan & hutang (20%)' };
const IKON_KAT = ['tag', 'bowl', 'coffee', 'shopping-cart', 'shopping-bag', 'gas-station', 'bus', 'bolt', 'wifi', 'home', 'first-aid-kit', 'school',
  'device-tv', 'device-gamepad-2', 'shirt', 'gift', 'heart-handshake', 'baby-carriage', 'paw', 'tools-kitchen-2', 'users-group', 'briefcase', 'coins', 'building-store', 'chart-line', 'plane'];

export async function render(el) {
  const p = store.profil || {};
  const masuk = store.kategori.filter((k) => k.tipe === 'masuk' && !k.kode);
  const keluar = store.kategori.filter((k) => k.tipe === 'keluar' && !k.kode);

  el.innerHTML = `
    <header class="kepala-halaman"><a class="btn-ikon" href="#/beranda" aria-label="Kembali">${ikon('arrow-left')}</a><h1>Pengaturan</h1><span></span></header>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('user')} Profil</h2>
      <form id="f-profil" novalidate>
        <label class="field"><span>Nama panggilan</span><input name="nama" maxlength="60" value="${esc(p.nama || '')}"></label>
        <label class="field"><span>Pendapatan rutin per bulan</span>
          <div class="input-rp"><b>Rp</b><input name="pendapatan_bulanan" inputmode="numeric" data-rupiah value="${p.pendapatan_bulanan ? angka(p.pendapatan_bulanan) : ''}"></div>
          <small class="teks-kecil">Dipakai untuk menghitung rasio cicilan & aturan 50/30/20.</small></label>
        <button class="btn btn-utama" type="submit">${ikon('check')} Simpan profil</button>
      </form>
    </section>

    <section class="kartu">
      <div class="baris-antara"><h2 class="h-kecil">${ikon('wallet')} Dompet</h2><button class="btn btn-sekunder kecil" id="tambah-dompet">${ikon('plus')} Tambah</button></div>
      <div class="daftar">${store.dompet.map((d) => `
        <button class="baris-sederhana ${d.aktif ? '' : 'redup'}" data-dompet="${d.id}">
          <span>${ikon(JENIS_DOMPET[d.jenis][1])} ${esc(d.nama)}${d.aktif ? '' : ' <em class="lencana">nonaktif</em>'}</span><b>${rupiah(d.saldo)}</b></button>`).join('')}</div>
    </section>

    <section class="kartu">
      <div class="baris-antara"><h2 class="h-kecil">${ikon('category')} Kategori</h2><button class="btn btn-sekunder kecil" id="tambah-kat">${ikon('plus')} Tambah</button></div>
      <p class="teks-kecil">Pemasukan</p>
      <div class="daftar-chip">${masuk.map((k) => chipKat(k)).join('')}</div>
      <p class="teks-kecil">Pengeluaran</p>
      <div class="daftar-chip">${keluar.map((k) => chipKat(k)).join('')}</div>
    </section>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('database')} Data</h2>
      <div class="daftar">
        <button class="baris-sederhana" id="isi-contoh"><span>${ikon('database-import')} Isi data contoh (3 bulan)</span>${ikon('chevron-right')}</button>
        <button class="baris-sederhana" id="ekspor-json"><span>${ikon('file-type-json')} Backup semua data (JSON)</span>${ikon('download')}</button>
        <button class="baris-sederhana" id="ekspor-csv"><span>${ikon('file-spreadsheet')} Unduh semua transaksi (CSV/Excel)</span>${ikon('download')}</button>
        <button class="baris-sederhana teks-bahaya" id="reset"><span>${ikon('trash-x')} Reset semua data</span>${ikon('chevron-right')}</button>
      </div>
      <p class="teks-kecil">${ikon('info-circle')} Paket gratis Supabase tidak punya backup otomatis. Unduh backup JSON minimal sebulan sekali.</p>
    </section>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('device-mobile')} Pasang di HP</h2>
      <p class="teks-kecil"><b>Android (Chrome):</b> menu ⋮ → <i>Tambahkan ke layar utama / Instal aplikasi</i>.<br>
      <b>iPhone (Safari):</b> tombol Bagikan → <i>Tambah ke Layar Utama</i>.</p>
      <button class="btn btn-sekunder" id="pasang" hidden>${ikon('download')} Pasang aplikasi</button>
    </section>

    <section class="kartu">
      <h2 class="h-kecil">${ikon('lock')} Akun</h2>
      <p class="teks-kecil">Masuk sebagai <b>${esc(store.user?.email || '')}</b></p>
      <div class="aksi-baris">
        <button class="btn btn-sekunder" id="ganti-pass">${ikon('key')} Ganti password</button>
        <button class="btn btn-bahaya-garis" id="keluar">${ikon('logout')} Keluar</button>
      </div>
    </section>
    <p class="teks-kecil tengah">DompetKu v1.0 · Frontend GitHub Pages · Backend Supabase</p>`;

  const fp = $('#f-profil', el);
  pasangInputRupiah(fp.pendapatan_bulanan);
  fp.onsubmit = async (e) => {
    e.preventDefault();
    const d = ambilForm(fp);
    if (!d.nama) return toast('Nama tidak boleh kosong', 'error');
    await sambilMemuat(fp.querySelector('button'), async () => {
      try { await api.profil.simpan(store.user.id, d); toast('Profil disimpan', 'sukses'); await segarkan(); }
      catch (ex) { toast(api.pesanError(ex), 'error'); }
    });
  };

  $('#tambah-dompet', el).onclick = () => formDompet();
  $('#tambah-kat', el).onclick = () => formKategori();
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dompet]');
    if (d) formDompet(store.dompet.find((x) => x.id === d.dataset.dompet));
    const k = e.target.closest('[data-kat]');
    if (k) formKategori(store.kategori.find((x) => x.id === k.dataset.kat));
  });

  $('#isi-contoh', el).onclick = async (e) => {
    const btn = e.currentTarget;
    if (!(await konfirmasi({ judul: 'Isi data contoh?', pesan: 'Menambahkan 3 bulan transaksi, 3 hutang, 3 tabungan, dan budget jajan. Hanya bisa jika belum ada transaksi.', tombol: 'Isi data' }))) return;
    await sambilMemuat(btn, async () => {
      try { const r = await api.data.isiContoh(); toast(`Data contoh terisi: ${r.transaksi} transaksi`, 'sukses'); await segarkan(); location.hash = '#/beranda'; }
      catch (ex) { toast(api.pesanError(ex), 'error'); }
    });
  };
  $('#ekspor-json', el).onclick = (e) => sambilMemuat(e.currentTarget, async () => {
    try {
      const data = await api.data.eksporSemua();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `backup-dompetku-${hariIni()}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Backup diunduh', 'sukses');
    } catch (ex) { toast(api.pesanError(ex), 'error'); }
  });
  $('#ekspor-csv', el).onclick = (e) => sambilMemuat(e.currentTarget, async () => {
    try { unduhCSV(await api.transaksi.semua(), `semua-transaksi-${hariIni()}.csv`); }
    catch (ex) { toast(api.pesanError(ex), 'error'); }
  });
  $('#reset', el).onclick = async () => {
    if (!(await konfirmasi({ judul: 'Reset semua data?', bahaya: true, ketik: 'HAPUS', tombol: 'Hapus semuanya',
      pesan: 'Semua transaksi, hutang, tabungan, dompet, dan kategori akan dihapus permanen lalu diganti data awal. Unduh backup dulu jika perlu.' }))) return;
    try { await api.data.resetAkun(); toast('Data direset', 'sukses'); await segarkan(); location.hash = '#/beranda'; }
    catch (ex) { toast(api.pesanError(ex), 'error'); }
  };

  const tombolPasang = $('#pasang', el);
  if (window.pasangPrompt) {   // tersedia di Chrome Android/desktop (lihat app.js)
    tombolPasang.hidden = false;
    tombolPasang.onclick = async () => { window.pasangPrompt.prompt(); await window.pasangPrompt.userChoice; window.pasangPrompt = null; tombolPasang.hidden = true; };
  }
  $('#ganti-pass', el).onclick = () => bukaSheet({
    judul: 'Ganti password',
    isi: `<form id="f-gp" novalidate><label class="field"><span>Password baru</span><input name="p" type="password" minlength="6" autocomplete="new-password" autofocus></label>
      <button class="btn btn-utama btn-penuh">Simpan</button></form>`,
    saatTerbuka(s, tutup) {
      $('#f-gp', s).onsubmit = async (e) => {
        e.preventDefault();
        if (e.target.p.value.length < 6) return toast('Password minimal 6 karakter', 'error');
        await sambilMemuat(e.target.querySelector('button'), async () => {
          try { await api.auth.gantiPassword(e.target.p.value); tutup(); toast('Password diganti', 'sukses'); }
          catch (ex) { toast(api.pesanError(ex), 'error'); }
        });
      };
    },
  });
  $('#keluar', el).onclick = async () => {
    if (await konfirmasi({ judul: 'Keluar dari akun?', pesan: 'Kamu perlu login lagi untuk membuka data.', tombol: 'Keluar' })) api.auth.keluar();
  };
}

const chipKat = (k) => `<button class="chip-kategori kecil ${k.aktif ? '' : 'redup'}" data-kat="${k.id}">${ikon(k.ikon)}<span>${esc(k.nama)}</span>${k.is_jajan ? '<em>jajan</em>' : ''}</button>`;

function formDompet(d = null) {
  bukaSheet({
    judul: d ? 'Ubah dompet' : 'Dompet baru',
    isi: `<form id="f-dompet" novalidate>
      <label class="field"><span>Nama</span><input name="nama" maxlength="50" value="${esc(d?.nama || '')}" placeholder="mis. BCA, GoPay, Dompet" autofocus></label>
      <div class="dua-kolom">
        <label class="field"><span>Jenis</span><select name="jenis">${Object.entries(JENIS_DOMPET).map(([v, [l]]) => `<option value="${v}" ${d?.jenis === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Saldo awal</span><div class="input-rp"><b>Rp</b><input name="saldo_awal" inputmode="numeric" data-rupiah value="${d ? angka(d.saldo_awal) : ''}"></div></label>
      </div>
      <p class="teks-kecil">${ikon('info-circle')} Saldo awal = isi dompet saat mulai memakai aplikasi. Saldo sekarang dihitung otomatis dari transaksi.</p>
      ${d ? `<label class="cek"><input type="checkbox" name="aktif" ${d.aktif ? 'checked' : ''}> Aktif (tampil di pilihan & total saldo)</label>` : ''}
      <div class="aksi-baris">
        ${d ? `<button type="button" class="btn btn-bahaya-garis" id="hapus-d">${ikon('trash')} Hapus</button>` : ''}
        <button class="btn btn-utama" type="submit">${ikon('check')} Simpan</button></div></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-dompet', el);
      pasangInputRupiah(f.saldo_awal);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const v = ambilForm(f);
        if (!v.nama) return toast('Isi nama dompet', 'error');
        const data = { nama: v.nama, jenis: v.jenis, saldo_awal: v.saldo_awal };
        if (d) data.aktif = v.aktif;
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try { await api.dompet.simpan(data, d?.id); tutup(); toast('Dompet disimpan', 'sukses'); await segarkan(); }
          catch (ex) { toast(api.pesanError(ex), 'error'); }
        });
      };
      $('#hapus-d', el)?.addEventListener('click', async () => {
        if (!(await konfirmasi({ judul: `Hapus ${d.nama}?`, pesan: 'Hanya bisa jika belum ada transaksi di dompet ini. Kalau sudah ada, nonaktifkan saja.', tombol: 'Hapus', bahaya: true }))) return;
        try { await api.dompet.hapus(d.id); toast('Dompet dihapus', 'sukses'); await segarkan(); }
        catch (ex) { toast(api.pesanError(ex), 'error'); }
      });
    },
  });
}

function formKategori(k = null) {
  let tipe = k?.tipe || 'keluar';
  bukaSheet({
    judul: k ? 'Ubah kategori' : 'Kategori baru',
    isi: `<form id="f-kat" novalidate>
      ${k ? '' : `<div class="segmen" role="radiogroup">
        <label><input type="radio" name="tipe" value="keluar" checked> Pengeluaran</label>
        <label><input type="radio" name="tipe" value="masuk"> Pemasukan</label></div>`}
      <label class="field"><span>Nama</span><input name="nama" maxlength="40" value="${esc(k?.nama || '')}" autofocus></label>
      <div id="blok-keluar" ${tipe === 'masuk' ? 'hidden' : ''}>
        <label class="field"><span>Kelompok (aturan 50/30/20)</span><select name="kelompok">${Object.entries(KELOMPOK).map(([v, l]) => `<option value="${v}" ${(k?.kelompok || 'keinginan') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="cek"><input type="checkbox" name="is_jajan" ${k?.is_jajan ? 'checked' : ''}> Termasuk jajan</label>
      </div>
      <div class="field"><span>Ikon</span><div class="pilih-ikon">${IKON_KAT.map((i) => `<label><input type="radio" name="ikon" value="${i}" ${(k?.ikon || 'tag') === i ? 'checked' : ''}><span>${ikon(i)}</span></label>`).join('')}</div></div>
      ${k ? `<label class="cek"><input type="checkbox" name="aktif" ${k.aktif ? 'checked' : ''}> Aktif (tampil di form transaksi)</label>` : ''}
      <div class="aksi-baris">
        ${k ? `<button type="button" class="btn btn-bahaya-garis" id="hapus-k">${ikon('trash')} Hapus</button>` : ''}
        <button class="btn btn-utama" type="submit">${ikon('check')} Simpan</button></div></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-kat', el);
      $$('[name=tipe]', f).forEach((r) => (r.onchange = () => { tipe = r.value; $('#blok-keluar', el).hidden = tipe === 'masuk'; }));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const v = ambilForm(f);
        if (!v.nama) return toast('Isi nama kategori', 'error');
        const data = { nama: v.nama, ikon: v.ikon,
          kelompok: tipe === 'masuk' ? 'pendapatan' : v.kelompok, is_jajan: tipe === 'masuk' ? false : v.is_jajan };
        if (!k) data.tipe = tipe; else data.aktif = v.aktif;
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try { await api.kategori.simpan(data, k?.id); tutup(); toast('Kategori disimpan', 'sukses'); await segarkan(); }
          catch (ex) { toast(api.pesanError(ex), 'error'); }
        });
      };
      $('#hapus-k', el)?.addEventListener('click', async () => {
        if (!(await konfirmasi({ judul: `Hapus ${k.nama}?`, pesan: 'Transaksi lama tetap ada, tapi kategorinya jadi "Tanpa kategori". Nonaktifkan saja jika ingin menyembunyikan.', tombol: 'Hapus', bahaya: true }))) return;
        try { await api.kategori.hapus(k.id); toast('Kategori dihapus', 'sukses'); await segarkan(); }
        catch (ex) { toast(api.pesanError(ex), 'error'); }
      });
    },
  });
}
