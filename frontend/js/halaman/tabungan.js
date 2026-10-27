// Halaman TABUNGAN: target tabungan, dana darurat, setor / tarik, rekomendasi setoran
import * as api from '../api.js';
import { dompetAktif, segarkan } from '../store.js';
import { $, $$, ikon, toast, bukaSheet, konfirmasi, pasangInputRupiah, ambilForm, sambilMemuat, progres, kosong } from '../ui.js';
import { esc, rupiah, ringkas, angka, persen, hariIni, hariMenuju, bulanMenuju, tanggalPendek, jumlahkan, tambahBulan, bulanIni } from '../util.js';

const IKON_PILIHAN = ['pig-money', 'shield-check', 'device-laptop', 'beach', 'home', 'car', 'motorbike', 'school', 'heart', 'device-mobile', 'gift', 'plane'];

export async function render(el) {
  const [semua, ringkasan] = await Promise.all([api.tabungan.daftar(), api.laporan.ringkasanBulanan(4)]);
  const aktif = semua.filter((t) => t.status !== 'arsip');
  const arsip = semua.filter((t) => t.status === 'arsip');
  const total = jumlahkan(aktif, (t) => t.terkumpul);
  const target = jumlahkan(aktif, (t) => t.target);

  // biaya hidup rata-rata (kebutuhan + keinginan) dari bulan-bulan penuh sebelumnya
  const penuh = ringkasan.filter((r) => r.bulan.slice(0, 7) < bulanIni() && r.bulan.slice(0, 7) >= tambahBulan(bulanIni(), -3));
  const biayaHidup = penuh.length ? jumlahkan(penuh, (r) => Number(r.kebutuhan) + Number(r.keinginan)) / penuh.length : 0;

  const urut = [...aktif].sort((a, b) => (a.jenis === 'darurat' ? -1 : 0) - (b.jenis === 'darurat' ? -1 : 0) || (a.status === 'tercapai') - (b.status === 'tercapai'));

  el.innerHTML = `
    <header class="kepala-halaman"><h1>Tabungan</h1>
      <div class="aksi-kepala"><button class="btn btn-utama kecil" id="tambah-tab">${ikon('plus')} Target baru</button></div></header>

    <section class="kartu-saldo hijau">
      <span>Total terkumpul</span>
      <p class="angka-besar">${rupiah(total)}</p>
      ${progres(persen(total, target), 'putih')}
      <p class="teks-kecil-terang">${persen(total, target)}% dari total target ${rupiah(target)}</p>
    </section>

    ${!aktif.some((t) => t.jenis === 'darurat') ? `
      <section class="insight insight-waspada">
        ${ikon('shield-x')}<div><b>Mulai dari dana darurat</b>
        <p>Siapkan 3–6x biaya hidup${biayaHidup ? ` (±${rupiah(biayaHidup * 3)} – ${rupiah(biayaHidup * 6)})` : ''} untuk keadaan mendesak, sebelum menabung untuk keinginan.</p>
        <button class="btn btn-sekunder kecil" id="buat-darurat">${ikon('plus')} Buat dana darurat</button></div>
      </section>` : ''}

    <section class="tumpuk">
      ${urut.length ? urut.map((t) => kartuTabungan(t, biayaHidup)).join('')
        : kosong('pig-money', 'Belum ada target tabungan', 'Buat target pertama: dana darurat, laptop, liburan, atau DP rumah.')}
    </section>

    ${arsip.length ? `<details class="kartu lipat"><summary>${ikon('archive')} Arsip (${arsip.length})</summary>
      <div class="daftar">${arsip.map((t) => `<button class="baris-sederhana" data-edit="${t.id}"><span>${ikon(t.ikon)} ${esc(t.nama)}</span><span>${rupiah(t.terkumpul)}</span></button>`).join('')}</div></details>` : ''}`;

  $('#tambah-tab', el).onclick = () => formTabungan(null, {}, biayaHidup);
  $('#buat-darurat', el)?.addEventListener('click', () => formTabungan(null, { jenis: 'darurat', nama: 'Dana darurat', ikon: 'shield-check', target: Math.round((biayaHidup * 3) / 100000) * 100000 || '' }, biayaHidup));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-setor],[data-tarik],[data-edit],[data-riwayat]');
    if (!b) return;
    const t = semua.find((x) => x.id === (b.dataset.setor || b.dataset.tarik || b.dataset.edit || b.dataset.riwayat));
    if (b.dataset.setor) formMutasi(t, 1);
    else if (b.dataset.tarik) formMutasi(t, -1);
    else if (b.dataset.edit) formTabungan(t, {}, biayaHidup);
    else riwayat(t);
  });
}

function kartuTabungan(t, biayaHidup) {
  const p = persen(t.terkumpul, t.target);
  const kurang = Math.max(0, t.target - t.terkumpul);
  let saran = '';
  if (t.status === 'tercapai') saran = `${ikon('confetti')} Target tercapai! Arsipkan atau naikkan targetnya.`;
  else if (t.jenis === 'darurat' && biayaHidup) saran = `${ikon('shield-half')} Cukup untuk ±${(t.terkumpul / biayaHidup).toLocaleString('id-ID', { maximumFractionDigits: 1 })} bulan biaya hidup (ideal 3–6 bulan).`;
  else if (t.tenggat && hariMenuju(t.tenggat) >= 0) saran = `${ikon('calendar-dollar')} Setor <b>${rupiah(kurang / bulanMenuju(t.tenggat))}/bulan</b> agar tercapai ${tanggalPendek(t.tenggat)}.`;
  else if (t.tenggat) saran = `<span class="teks-bahaya">${ikon('calendar-x')} Tenggat ${tanggalPendek(t.tenggat)} sudah lewat. Perbarui tenggatnya.</span>`;
  return `
    <article class="kartu kartu-tabungan ${t.status === 'tercapai' ? 'tercapai' : ''}">
      <header class="baris-antara">
        <div class="judul-ikon">${ikon(t.ikon)}<div><b>${esc(t.nama)}</b>
          <small>${t.jenis === 'darurat' ? 'Cadangan 3–6 bulan biaya hidup' : 'Tujuan'}${t.tenggat ? ' · ' + tanggalPendek(t.tenggat) : ''}</small></div></div>
        <span class="lencana ${p >= 100 ? 'lencana-sukses' : ''}">${p}%</span>
      </header>
      <div class="baris-antara"><b class="angka-sedang">${rupiah(t.terkumpul)}</b><span class="teks-kecil">dari ${ringkas(t.target)}</span></div>
      ${progres(p, 'hijau')}
      ${saran ? `<p class="teks-kecil">${saran}</p>` : ''}
      <div class="aksi-baris">
        <button class="btn-ikon" data-riwayat="${t.id}" aria-label="Riwayat">${ikon('history')}</button>
        <button class="btn-ikon" data-edit="${t.id}" aria-label="Ubah">${ikon('edit')}</button>
        <button class="btn btn-sekunder kecil" data-tarik="${t.id}" ${t.terkumpul <= 0 ? 'disabled' : ''}>${ikon('arrow-up')} Tarik</button>
        <button class="btn btn-utama kecil" data-setor="${t.id}">${ikon('arrow-down')} Setor</button>
      </div>
    </article>`;
}

function formTabungan(t = null, bawaan = {}, biayaHidup = 0) {
  const v = { ...bawaan, ...(t || {}) };
  bukaSheet({
    judul: t ? 'Ubah tabungan' : 'Target tabungan baru',
    isi: `<form id="f-tab" novalidate>
      <label class="field"><span>Nama target</span><input name="nama" maxlength="60" value="${esc(v.nama || '')}" placeholder="mis. Laptop baru" autofocus></label>
      <div class="segmen" role="radiogroup">
        <label><input type="radio" name="jenis" value="tujuan" ${v.jenis !== 'darurat' ? 'checked' : ''}> Tujuan</label>
        <label><input type="radio" name="jenis" value="darurat" ${v.jenis === 'darurat' ? 'checked' : ''}> Dana darurat</label>
      </div>
      <div class="dua-kolom">
        <label class="field"><span>Target</span><div class="input-rp"><b>Rp</b><input name="target" inputmode="numeric" data-rupiah value="${v.target ? angka(v.target) : ''}"></div></label>
        <label class="field"><span>Tenggat (opsional)</span><input type="date" name="tenggat" value="${v.tenggat || ''}" min="${hariIni()}"></label>
      </div>
      ${!t ? `<label class="field"><span>Sudah terkumpul (saldo awal)</span><div class="input-rp"><b>Rp</b><input name="terkumpul" inputmode="numeric" data-rupiah placeholder="0"></div></label>` : ''}
      ${biayaHidup ? `<p class="teks-kecil">${ikon('bulb')} Untuk dana darurat: 3 bulan = ${rupiah(biayaHidup * 3)}, 6 bulan = ${rupiah(biayaHidup * 6)}.</p>` : ''}
      <div class="field"><span>Ikon</span><div class="pilih-ikon">${IKON_PILIHAN.map((i) => `
        <label><input type="radio" name="ikon" value="${i}" ${(v.ikon || 'pig-money') === i ? 'checked' : ''}><span>${ikon(i)}</span></label>`).join('')}</div></div>
      ${t ? `<label class="cek"><input type="checkbox" name="arsip" ${t.status === 'arsip' ? 'checked' : ''}> Arsipkan (sembunyikan dari daftar)</label>` : ''}
      <p class="error-form" id="err-t" role="alert"></p>
      <div class="aksi-baris">
        ${t ? `<button type="button" class="btn btn-bahaya-garis" id="hapus-t">${ikon('trash')} Hapus</button>` : ''}
        <button class="btn btn-utama" type="submit">${ikon('check')} Simpan</button>
      </div></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-tab', el);
      $$('[data-rupiah]', f).forEach(pasangInputRupiah);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = ambilForm(f), err = $('#err-t', el);
        if (!d.nama) return (err.textContent = 'Isi nama target.');
        if (d.target <= 0) return (err.textContent = 'Isi jumlah target.');
        const data = { nama: d.nama, jenis: d.jenis, target: d.target, tenggat: d.tenggat || null, ikon: d.ikon };
        if (!t) { data.terkumpul = d.terkumpul || 0; data.status = data.terkumpul >= d.target ? 'tercapai' : 'aktif'; }
        else data.status = d.arsip ? 'arsip' : t.terkumpul >= d.target ? 'tercapai' : 'aktif';
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try { await api.tabungan.simpan(data, t?.id); tutup(); toast('Tabungan disimpan', 'sukses'); await segarkan(); }
          catch (ex) { err.textContent = api.pesanError(ex); }
        });
      };
      $('#hapus-t', el)?.addEventListener('click', async () => {
        if (!(await konfirmasi({ judul: `Hapus ${t.nama}?`, pesan: 'Target & riwayat setorannya dihapus. Transaksi yang sudah tercatat tetap ada.', tombol: 'Hapus', bahaya: true }))) return;
        try { await api.tabungan.hapus(t.id); toast('Tabungan dihapus', 'sukses'); await segarkan(); }
        catch (ex) { toast(api.pesanError(ex), 'error'); }
      });
    },
  });
}

function formMutasi(t, arah) {
  const setor = arah > 0;
  const dompets = dompetAktif();
  const kurang = Math.max(0, t.target - t.terkumpul);
  bukaSheet({
    judul: `${setor ? 'Setor ke' : 'Tarik dari'} ${t.nama}`,
    isi: `<form id="f-mut" novalidate>
      <p class="teks-sekunder">${setor ? `Kurang ${rupiah(kurang)} lagi untuk mencapai target.` : `Saldo tabungan ${rupiah(t.terkumpul)}.`}
        Otomatis tercatat sebagai transaksi ${setor ? 'keluar dari' : 'masuk ke'} dompet.</p>
      <label class="field field-jumlah"><span>Jumlah</span>
        <div class="input-rp"><b>Rp</b><input name="jumlah" inputmode="numeric" data-rupiah autofocus></div></label>
      ${setor ? `<div class="chip-filter">${[100000, 250000, 500000].map((n) => `<button type="button" data-isi="${n}">${ringkas(n)}</button>`).join('')}
        ${kurang ? `<button type="button" data-isi="${kurang}">Sisa ${ringkas(kurang)}</button>` : ''}</div>` : ''}
      <div class="dua-kolom">
        <label class="field"><span>${setor ? 'Dari' : 'Ke'} dompet</span><select name="dompet_id">${dompets.map((d) => `<option value="${d.id}">${esc(d.nama)} · ${rupiah(d.saldo)}</option>`).join('')}</select></label>
        <label class="field"><span>Tanggal</span><input type="date" name="tanggal" value="${hariIni()}"></label>
      </div>
      <p class="error-form" id="err-m" role="alert"></p>
      <button class="btn btn-utama btn-penuh" type="submit">${ikon('check')} ${setor ? 'Setor' : 'Tarik'}</button></form>`,
    saatTerbuka(el, tutup) {
      const f = $('#f-mut', el);
      pasangInputRupiah(f.jumlah);
      $$('[data-isi]', el).forEach((b) => (b.onclick = () => { f.jumlah.value = angka(b.dataset.isi); }));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = ambilForm(f), err = $('#err-m', el);
        if (d.jumlah <= 0) return (err.textContent = 'Isi jumlahnya.');
        if (!setor && d.jumlah > t.terkumpul) return (err.textContent = `Maksimal ${rupiah(t.terkumpul)}.`);
        await sambilMemuat(f.querySelector('[type=submit]'), async () => {
          try {
            const r = await api.tabungan.mutasi(t.id, d.jumlah * arah, d.dompet_id, d.tanggal);
            tutup();
            toast(r.tercapai && setor ? `🎉 Target ${t.nama} tercapai!` : `${setor ? 'Setoran' : 'Penarikan'} tercatat`, 'sukses');
            await segarkan();
          } catch (ex) { err.textContent = api.pesanError(ex); }
        });
      };
    },
  });
}

async function riwayat(t) {
  let list = [];
  try { list = await api.tabungan.riwayat(t.id); } catch (e) { return toast(api.pesanError(e), 'error'); }
  bukaSheet({
    judul: `Riwayat ${t.nama}`,
    isi: list.length ? `<div class="daftar">${list.map((m) => `<div class="baris-sederhana"><span>${tanggalPendek(m.tanggal)} · ${m.jumlah > 0 ? 'Setor' : 'Tarik'}</span>
      <b class="${m.jumlah > 0 ? 'teks-sukses' : 'teks-bahaya'}">${m.jumlah > 0 ? '+' : '−'}${rupiah(Math.abs(m.jumlah))}</b></div>`).join('')}</div>`
      : kosong('history', 'Belum ada riwayat', 'Setoran & penarikan lewat aplikasi akan muncul di sini.'),
  });
}
