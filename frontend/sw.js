// =====================================================================
//  Service worker — membuat DompetKu bisa di-install & tampilan tetap
//  terbuka saat sinyal jelek. Data keuangan TIDAK disimpan di cache;
//  data selalu diambil langsung dari Supabase.
//  Naikkan VERSI setiap kali mengubah file frontend agar HP mengambil yang baru.
// =====================================================================
const VERSI = 'dompetku-v1.0.0';
const FILE_INTI = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/api.js', './js/config.js', './js/store.js', './js/ui.js', './js/util.js', './js/insight.js',
  './js/halaman/beranda.js', './js/halaman/transaksi.js', './js/halaman/form-transaksi.js', './js/halaman/hutang.js',
  './js/halaman/tabungan.js', './js/halaman/budget.js', './js/halaman/analisis.js', './js/halaman/pengaturan.js',
  './icons/icon-192.png', './icons/icon-512.png',
];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(FILE_INTI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;            // data: selalu langsung ke server

  // File aplikasi sendiri: ambil versi terbaru dulu, pakai cache jika offline
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(e.request, salin)); return res; })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Library, font & ikon dari CDN: pakai cache dulu (jarang berubah)
  if (CDN.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
        if (res.ok || res.type === 'opaque') { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(e.request, salin)); }
        return res;
      }))
    );
  }
});
