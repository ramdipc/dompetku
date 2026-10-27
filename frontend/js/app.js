// =====================================================================
//  APP — titik awal aplikasi: cek login, router halaman, navigasi bawah
// =====================================================================
import * as api from './api.js';
import { store, muatReferensi } from './store.js';
import { $, $$, ikon, toast, bukaSheet, tutupSheet, sambilMemuat, kosong } from './ui.js';
import { esc } from './util.js';
import { bukaFormTransaksi } from './halaman/form-transaksi.js';

const RUTE = {
  beranda:    () => import('./halaman/beranda.js'),
  transaksi:  () => import('./halaman/transaksi.js'),
  hutang:     () => import('./halaman/hutang.js'),
  tabungan:   () => import('./halaman/tabungan.js'),
  budget:     () => import('./halaman/budget.js'),
  analisis:   () => import('./halaman/analisis.js'),
  pengaturan: () => import('./halaman/pengaturan.js'),
};

const wadah = $('#app');
let renderKe = 0;

function ruteSekarang() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return RUTE[r] ? r : 'beranda';
}

async function tampilkanHalaman() {
  if (!store.user) return;
  const rute = ruteSekarang();
  const ke = ++renderKe;
  document.body.dataset.rute = rute;
  $$('.nav-bawah a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.rute === rute));
  try {
    const mod = await RUTE[rute]();
    if (ke !== renderKe) return;
    const el = document.createElement('main');
    el.className = 'halaman';
    el.id = 'halaman';
    await mod.render(el);
    if (ke !== renderKe) return;
    wadah.replaceChildren(el);
  } catch (e) {
    console.error(e);
    if (ke !== renderKe) return;
    wadah.innerHTML = `<main class="halaman">${kosong('cloud-off', 'Gagal memuat data', api.pesanError(e),
      '<button class="btn btn-utama" onclick="location.reload()">Coba lagi</button>')}</main>`;
  }
}

// ---------- Layar saat config.js belum diisi ----------
function layarBelumSetup() {
  document.body.classList.add('tanpa-nav');
  wadah.innerHTML = `
    <main class="halaman layar-tengah">
      <div class="logo-besar">${ikon('wallet')}</div>
      <h1>DompetKu belum terhubung</h1>
      <p class="teks-sekunder">Isi <code>SUPABASE_URL</code> dan <code>SUPABASE_KEY</code> di file
      <code>frontend/js/config.js</code>, lalu muat ulang halaman ini.</p>
      <p class="teks-sekunder">Panduan lengkap ada di <b>README.md</b> bagian "Langkah 3".</p>
    </main>`;
}

// ---------- Layar login / daftar ----------
function layarLogin() {
  document.body.classList.add('tanpa-nav');
  let mode = 'masuk';
  const gambar = () => {
    wadah.innerHTML = `
      <main class="halaman layar-tengah">
        <div class="logo-besar">${ikon('wallet')}</div>
        <h1>DompetKu</h1>
        <p class="teks-sekunder">Catat, pahami, dan kendalikan keuanganmu.</p>
        <div class="segmen" role="tablist">
          <button role="tab" aria-selected="${mode === 'masuk'}" data-mode="masuk">Masuk</button>
          <button role="tab" aria-selected="${mode === 'daftar'}" data-mode="daftar">Daftar</button>
        </div>
        <form id="form-auth" class="kartu form-auth" novalidate>
          ${mode === 'daftar' ? `<label class="field"><span>Nama panggilan</span><input name="nama" autocomplete="nickname" placeholder="Ramdi" required maxlength="60"></label>` : ''}
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="nama@email.com" required></label>
          <label class="field"><span>Password</span>
            <input name="password" type="password" autocomplete="${mode === 'masuk' ? 'current-password' : 'new-password'}" minlength="6" placeholder="Minimal 6 karakter" required></label>
          <p class="error-form" id="error-auth" role="alert"></p>
          <button class="btn btn-utama btn-penuh" type="submit">${mode === 'masuk' ? 'Masuk' : 'Buat akun'}</button>
          ${mode === 'masuk' ? `<button type="button" class="btn-teks" id="lupa">Lupa password?</button>` : ''}
        </form>
      </main>`;
    $$('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; gambar(); }));
    $('#lupa')?.addEventListener('click', lupaPassword);
    $('#form-auth').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, err = $('#error-auth');
      err.textContent = '';
      const email = f.email.value.trim(), password = f.password.value;
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Format email belum benar.'; return; }
      if (password.length < 6) { err.textContent = 'Password minimal 6 karakter.'; return; }
      if (mode === 'daftar' && !f.nama.value.trim()) { err.textContent = 'Isi nama panggilan dulu.'; return; }
      await sambilMemuat(f.querySelector('[type=submit]'), async () => {
        try {
          if (mode === 'masuk') await api.auth.masuk(email, password);
          else {
            const r = await api.auth.daftar(email, password, f.nama.value.trim());
            if (!r.session) {
              wadah.querySelector('.form-auth').innerHTML = `
                <div class="kosong">${ikon('mail-check')}<h3>Cek email kamu</h3>
                <p>Kami mengirim link konfirmasi ke <b>${esc(email)}</b>. Klik link itu, lalu kembali ke sini untuk masuk.</p></div>`;
            }
          }
        } catch (ex) { err.textContent = api.pesanError(ex); }
      });
    };
  };
  gambar();
}

function lupaPassword() {
  bukaSheet({
    judul: 'Atur ulang password',
    isi: `<form id="f-lupa" novalidate>
      <p class="teks-sekunder">Masukkan email akunmu. Kami kirim link untuk membuat password baru.</p>
      <label class="field"><span>Email</span><input name="email" type="email" autofocus required></label>
      <button class="btn btn-utama btn-penuh">Kirim link</button></form>`,
    saatTerbuka(el, tutup) {
      $('#f-lupa', el).onsubmit = async (e) => {
        e.preventDefault();
        const email = e.target.email.value.trim();
        if (!email) return toast('Isi email dulu', 'error');
        await sambilMemuat(e.target.querySelector('button'), async () => {
          try { await api.auth.lupaPassword(email); toast('Link terkirim. Cek email kamu.', 'sukses'); tutup(); }
          catch (ex) { toast(api.pesanError(ex), 'error'); }
        });
      };
    },
  });
}

function formPasswordBaru() {
  bukaSheet({
    judul: 'Buat password baru',
    isi: `<form id="f-pass" novalidate>
      <label class="field"><span>Password baru</span><input name="p" type="password" minlength="6" autocomplete="new-password" autofocus></label>
      <button class="btn btn-utama btn-penuh">Simpan password</button></form>`,
    saatTerbuka(el, tutup) {
      $('#f-pass', el).onsubmit = async (e) => {
        e.preventDefault();
        if (e.target.p.value.length < 6) return toast('Password minimal 6 karakter', 'error');
        await sambilMemuat(e.target.querySelector('button'), async () => {
          try { await api.auth.gantiPassword(e.target.p.value); toast('Password diperbarui', 'sukses'); tutup(); }
          catch (ex) { toast(api.pesanError(ex), 'error'); }
        });
      };
    },
  });
}

// ---------- Setelah login ----------
async function masukAplikasi(user) {
  const pertamaKali = !store.user;
  store.user = user;
  document.body.classList.remove('tanpa-nav');
  if (pertamaKali) wadah.innerHTML = `<main class="halaman"><div class="memuat">${'<div class="skeleton"></div>'.repeat(4)}</div></main>`;
  try { await muatReferensi(); }
  catch (e) {
    wadah.innerHTML = `<main class="halaman">${kosong('database-off', 'Database belum siap', api.pesanError(e) +
      ' — Pastikan file SQL di folder backend sudah dijalankan.', '<button class="btn btn-utama" onclick="location.reload()">Coba lagi</button>')}</main>`;
    return;
  }
  if (pertamaKali) tampilkanHalaman();
}

function keluarAplikasi() {
  store.user = null; store.profil = null; store.dompet = []; store.kategori = [];
  tutupSheet();
  layarLogin();
}

// ---------- Mulai ----------
async function mulai() {
  // status online/offline
  const cekOnline = () => document.body.classList.toggle('offline', !navigator.onLine);
  addEventListener('online', cekOnline); addEventListener('offline', cekOnline); cekOnline();

  if (!api.sudahDikonfigurasi) return layarBelumSetup();

  $('#fab').addEventListener('click', () => bukaFormTransaksi());
  addEventListener('hashchange', () => { tutupSheet(); tampilkanHalaman(); scrollTo(0, 0); });
  addEventListener('data-berubah', tampilkanHalaman);

  api.auth.saatBerubah((event, sesi) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(formPasswordBaru, 400);
    if (event === 'SIGNED_OUT') return keluarAplikasi();
    if (sesi?.user && (!store.user || store.user.id !== sesi.user.id)) {
      // keluar dari callback auth dulu (rekomendasi supabase-js)
      setTimeout(() => masukAplikasi(sesi.user), 0);
    }
  });

  const sesi = await api.auth.sesi();
  if (sesi?.user) masukAplikasi(sesi.user);
  else layarLogin();
}

mulai();

// ---------- PWA: daftarkan service worker (agar bisa di-install di HP) ----------
if ('serviceWorker' in navigator && isSecureContext) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.pasangPrompt = e; });
