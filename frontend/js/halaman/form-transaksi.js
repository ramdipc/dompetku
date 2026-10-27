// Form tambah / ubah transaksi (dipakai tombol + dan saat transaksi diketuk)
import * as api from '../api.js';
import { store, kategoriAktif, dompetAktif, kategoriById, segarkan } from '../store.js';
import { $, $$, ikon, toast, bukaSheet, konfirmasi, pasangInputRupiah, sambilMemuat } from '../ui.js';
import { esc, angka, parseRupiah, hariIni, rupiah } from '../util.js';

const JUDUL_TIPE = { keluar: 'Pengeluaran', masuk: 'Pemasukan', transfer: 'Transfer' };

export function bukaFormTransaksi(trx = null, bawaan = {}) {
  if (!store.user) return;
  const ubah = !!trx;
  const terkunci = ubah && trx.sumber !== 'manual';   // dari pembayaran hutang / tabungan
  let tipe = trx?.tipe || bawaan.tipe || 'keluar';
  let kategoriId = trx?.kategori_id || bawaan.kategori_id || null;
  const dompets = dompetAktif();
  if (!dompets.length) return toast('Buat dompet dulu di Pengaturan', 'error');

  const opsiDompet = (pilih, kecuali) => store.dompet
    .filter((d) => (d.aktif || d.id === pilih) && d.id !== kecuali)
    .map((d) => `<option value="${d.id}" ${d.id === pilih ? 'selected' : ''}>${esc(d.nama)} · ${rupiah(d.saldo)}</option>`).join('');

  const gridKategori = () => {
    const daftar = kategoriAktif(tipe);
    const sekarang = kategoriById(kategoriId);
    if (sekarang && !daftar.includes(sekarang) && sekarang.tipe === tipe) daftar.unshift(sekarang);
    if (!daftar.length) return `<p class="teks-sekunder">Belum ada kategori ${tipe}. Tambahkan di Pengaturan.</p>`;
    return daftar.map((k) => `
      <button type="button" class="chip-kategori ${k.id === kategoriId ? 'aktif' : ''}" data-kat="${k.id}" aria-pressed="${k.id === kategoriId}">
        ${ikon(k.ikon)}<span>${esc(k.nama)}</span>${k.is_jajan ? '<em>jajan</em>' : ''}
      </button>`).join('');
  };

  bukaSheet({
    judul: ubah ? 'Ubah transaksi' : 'Catat transaksi',
    isi: `
      <form id="f-trx" novalidate>
        ${terkunci ? `<p class="catatan-info">${ikon('lock')} Transaksi ini dibuat otomatis dari ${trx.sumber === 'hutang' ? 'pembayaran hutang' : 'tabungan'}.
          Hanya bisa dihapus — menghapusnya akan membatalkan ${trx.sumber === 'hutang' ? 'pembayaran & sisa hutang dikembalikan' : 'setoran/tarikan'}.</p>` : ''}
        <div class="segmen" role="tablist" ${terkunci ? 'hidden' : ''}>
          ${['keluar', 'masuk', 'transfer'].map((t) => `<button type="button" role="tab" data-tipe="${t}" aria-selected="${t === tipe}">${JUDUL_TIPE[t]}</button>`).join('')}
        </div>
        <label class="field field-jumlah">
          <span>Jumlah</span>
          <div class="input-rp"><b>Rp</b><input name="jumlah" inputmode="numeric" autocomplete="off" placeholder="0"
            value="${trx ? angka(trx.jumlah) : bawaan.jumlah ? angka(bawaan.jumlah) : ''}" ${terkunci ? 'disabled' : 'autofocus'} data-rupiah></div>
        </label>
        <div class="field" id="blok-kategori" ${tipe === 'transfer' || terkunci ? 'hidden' : ''}>
          <span>Kategori</span>
          <div class="grid-kategori" id="grid-kat">${gridKategori()}</div>
        </div>
        <div class="dua-kolom">
          <label class="field"><span id="label-dompet">${tipe === 'transfer' ? 'Dari dompet' : 'Dompet'}</span>
            <select name="dompet_id" ${terkunci ? 'disabled' : ''}>${opsiDompet(trx?.dompet_id || bawaan.dompet_id || dompets[0].id)}</select></label>
          <label class="field" id="blok-tujuan" ${tipe === 'transfer' ? '' : 'hidden'}><span>Ke dompet</span>
            <select name="dompet_tujuan_id">${opsiDompet(trx?.dompet_tujuan_id || dompets[1]?.id || dompets[0].id)}</select></label>
        </div>
        <label class="field"><span>Tanggal</span>
          <input type="date" name="tanggal" value="${trx?.tanggal || bawaan.tanggal || hariIni()}" max="2100-12-31" ${terkunci ? 'disabled' : ''}></label>
        <label class="field"><span>Catatan (opsional)</span>
          <input name="catatan" maxlength="200" placeholder="mis. Kopi susu gula aren" value="${esc(trx?.catatan || '')}" ${terkunci ? 'disabled' : ''}></label>
        <p class="error-form" id="err-trx" role="alert"></p>
        <div class="aksi-baris">
          ${ubah ? `<button type="button" class="btn btn-bahaya-garis" id="hapus-trx">${ikon('trash')} Hapus</button>` : ''}
          ${terkunci ? '' : `<button class="btn btn-utama" type="submit">${ikon('check')} Simpan</button>`}
        </div>
      </form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-trx', el);
      pasangInputRupiah(f.jumlah);

      $$('[data-tipe]', el).forEach((b) => (b.onclick = () => {
        tipe = b.dataset.tipe;
        if (kategoriById(kategoriId)?.tipe !== tipe) kategoriId = null;
        $$('[data-tipe]', el).forEach((x) => x.setAttribute('aria-selected', x === b));
        $('#blok-kategori', el).hidden = tipe === 'transfer';
        $('#blok-tujuan', el).hidden = tipe !== 'transfer';
        $('#label-dompet', el).textContent = tipe === 'transfer' ? 'Dari dompet' : 'Dompet';
        $('#grid-kat', el).innerHTML = gridKategori();
      }));
      $('#grid-kat', el).addEventListener('click', (e) => {
        const b = e.target.closest('[data-kat]');
        if (!b) return;
        kategoriId = b.dataset.kat;
        $$('[data-kat]', el).forEach((x) => { x.classList.toggle('aktif', x === b); x.setAttribute('aria-pressed', x === b); });
      });

      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#err-trx', el);
        err.textContent = '';
        const jumlah = parseRupiah(f.jumlah.value);
        const tanggal = f.tanggal.value;
        if (jumlah <= 0) { err.textContent = 'Isi jumlahnya dulu.'; f.jumlah.focus(); return; }
        if (jumlah > 999999999999) { err.textContent = 'Jumlah terlalu besar.'; return; }
        if (!tanggal) { err.textContent = 'Pilih tanggal.'; return; }
        if (tipe !== 'transfer' && !kategoriId) { err.textContent = 'Pilih kategorinya.'; return; }
        if (tipe === 'transfer' && f.dompet_id.value === f.dompet_tujuan_id.value) { err.textContent = 'Dompet asal dan tujuan harus berbeda.'; return; }
        const data = {
          tipe, jumlah, tanggal,
          dompet_id: f.dompet_id.value,
          dompet_tujuan_id: tipe === 'transfer' ? f.dompet_tujuan_id.value : null,
          kategori_id: tipe === 'transfer' ? null : kategoriId,
          catatan: f.catatan.value.trim() || null,
        };
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try {
            await api.transaksi.simpan(data, trx?.id);
            tutup();
            toast(ubah ? 'Transaksi diperbarui' : `${JUDUL_TIPE[tipe]} ${rupiah(jumlah)} tercatat`, 'sukses');
            await segarkan();
          } catch (ex) { err.textContent = api.pesanError(ex); }
        });
      };

      $('#hapus-trx', el)?.addEventListener('click', async () => {
        const yakin = await konfirmasi({
          judul: 'Hapus transaksi?',
          pesan: terkunci ? 'Pembayaran/setoran yang terkait ikut dibatalkan.' : 'Transaksi ini akan dihapus permanen.',
          tombol: 'Hapus', bahaya: true,
        });
        if (!yakin) return;
        try {
          await api.transaksi.hapus(trx.id);
          toast('Transaksi dihapus', 'sukses');
          await segarkan();
        } catch (ex) { toast(api.pesanError(ex), 'error'); }
      });
    },
  });
}
