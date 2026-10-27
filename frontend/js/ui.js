// Komponen tampilan yang dipakai ulang: ikon, toast, bottom sheet, konfirmasi, input rupiah
import { esc, angka, parseRupiah } from './util.js';

export const ikon = (nama, kelas = '') => `<i class="ti ti-${esc(nama)} ${kelas}" aria-hidden="true"></i>`;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Toast (pesan singkat di bawah layar) ----------
export function toast(pesan, jenis = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${jenis}`;
  el.setAttribute('role', jenis === 'error' ? 'alert' : 'status');
  el.innerHTML = `${ikon(jenis === 'error' ? 'alert-circle' : jenis === 'sukses' ? 'circle-check' : 'info-circle')}<span>${esc(pesan)}</span>`;
  $('#toast-wadah').appendChild(el);
  setTimeout(() => el.classList.add('keluar'), jenis === 'error' ? 4500 : 2600);
  setTimeout(() => el.remove(), jenis === 'error' ? 5000 : 3000);
}

// ---------- Bottom sheet (form yang muncul dari bawah) ----------
let sheetAktif = null;

/**
 * Buka sheet. `isi` = HTML. `saatTerbuka(el, tutup)` dipanggil setelah sheet tampil.
 * Mengembalikan fungsi tutup().
 */
export function bukaSheet({ judul, isi, saatTerbuka }) {
  tutupSheet();
  const latar = document.createElement('div');
  latar.className = 'sheet-latar';
  latar.innerHTML = `
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(judul)}">
      <div class="sheet-pegangan" aria-hidden="true"></div>
      <header class="sheet-kepala">
        <h2>${esc(judul)}</h2>
        <button class="btn-ikon" data-tutup aria-label="Tutup">${ikon('x')}</button>
      </header>
      <div class="sheet-isi">${isi}</div>
    </section>`;
  document.body.appendChild(latar);
  document.body.classList.add('terkunci');
  requestAnimationFrame(() => latar.classList.add('tampil'));

  const tutup = () => {
    if (sheetAktif !== latar) return;
    sheetAktif = null;
    latar.classList.remove('tampil');
    document.body.classList.remove('terkunci');
    document.removeEventListener('keydown', esc_);
    setTimeout(() => latar.remove(), 220);
  };
  const esc_ = (e) => { if (e.key === 'Escape') tutup(); };
  document.addEventListener('keydown', esc_);
  latar.addEventListener('click', (e) => { if (e.target === latar || e.target.closest('[data-tutup]')) tutup(); });
  sheetAktif = latar;
  latar.tutup = tutup;
  saatTerbuka?.($('.sheet', latar), tutup);
  setTimeout(() => $('[autofocus]', latar)?.focus(), 250);
  return tutup;
}
export const tutupSheet = () => sheetAktif?.tutup();

// ---------- Konfirmasi ----------
export function konfirmasi({ judul, pesan, tombol = 'Ya, lanjutkan', bahaya = false, ketik = null }) {
  return new Promise((resolve) => {
    let hasil = false;
    bukaSheet({
      judul,
      isi: `
        <p class="teks-sekunder">${pesan}</p>
        ${ketik ? `<label class="field"><span>Ketik <b>${esc(ketik)}</b> untuk melanjutkan</span><input id="konf-ketik" autocomplete="off" autofocus></label>` : ''}
        <div class="aksi-baris">
          <button class="btn btn-sekunder" data-tutup>Batal</button>
          <button class="btn ${bahaya ? 'btn-bahaya' : 'btn-utama'}" id="konf-ya">${esc(tombol)}</button>
        </div>`,
      saatTerbuka(el, tutup) {
        $('#konf-ya', el).onclick = () => {
          if (ketik && $('#konf-ketik', el).value.trim().toUpperCase() !== ketik) {
            toast(`Ketik ${ketik} dulu`, 'error'); return;
          }
          hasil = true; tutup();
        };
        const obs = new MutationObserver(() => { if (!document.body.contains(el)) { obs.disconnect(); resolve(hasil); } });
        obs.observe(document.body, { childList: true });
      },
    });
  });
}

// ---------- Input rupiah: otomatis titik ribuan ----------
export function pasangInputRupiah(input) {
  const format = () => {
    const pos = input.value.length - input.selectionStart;
    const n = parseRupiah(input.value);
    input.value = n ? angka(n) : '';
    const baru = Math.max(0, input.value.length - pos);
    try { input.setSelectionRange(baru, baru); } catch { /* abaikan */ }
  };
  input.addEventListener('input', format);
  if (input.value) input.value = angka(parseRupiah(input.value));
}

/** Kumpulkan isi form menjadi objek. Field dengan data-rupiah diubah ke angka. */
export function ambilForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.dataset.rupiah !== undefined) o[el.name] = parseRupiah(el.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}

/** Tombol jadi "memuat" selama proses async berjalan */
export async function sambilMemuat(tombol, fn) {
  if (tombol.disabled) return;
  const asli = tombol.innerHTML;
  tombol.disabled = true;
  tombol.innerHTML = `<span class="spinner" aria-hidden="true"></span> Menyimpan…`;
  try { return await fn(); }
  finally { tombol.disabled = false; tombol.innerHTML = asli; }
}

export const progres = (pct, warna = '') =>
  `<div class="progres" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(pct))}"><div class="progres-isi ${warna}" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;

export const kosong = (ik, judul, teks, tombolHtml = '') => `
  <div class="kosong">${ikon(ik)}<h3>${esc(judul)}</h3><p>${esc(teks)}</p>${tombolHtml}</div>`;

export const memuat = () => `<div class="memuat" aria-label="Memuat">${'<div class="skeleton"></div>'.repeat(3)}</div>`;
