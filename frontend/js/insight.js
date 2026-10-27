// =====================================================================
//  MESIN INSIGHT & REKOMENDASI
//  Fungsi murni (tanpa tampilan) → mudah diuji & dikembangkan.
//  Input : transaksi 3 bulan terakhir, kategori, hutang, tabungan, profil
//  Output: { metrik, daftar }   daftar = insight terurut dari yang paling penting
// =====================================================================
import { rupiah, ringkas, persen, tambahBulan, jumlahHari, dariISO, hariMenuju,
         jatuhTempoBerikutnya, bulanMenuju, jumlahkan, namaBulan, hariIni as hariIniDefault } from './util.js';

const BOBOT = { bahaya: 3, waspada: 2, info: 1, bagus: 0 };
// Angka perkiraan dibulatkan ke ribuan supaya enak dibaca
const kira = (n) => rupiah(Math.round((Number(n) || 0) / 1000) * 1000);
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function hitungInsight({ trx = [], kategori = [], hutang = [], tabungan = [], profil = {}, hariIni = hariIniDefault() }) {
  const ym = hariIni.slice(0, 7);
  const ymLalu = tambahBulan(ym, -1);
  const hariKe = Number(hariIni.slice(8, 10));
  const totalHari = jumlahHari(ym);
  const porsiBulan = hariKe / totalHari;

  const kat = new Map(kategori.map((k) => [k.id, k]));
  const bulanDari = (t) => t.tanggal.slice(0, 7);
  const isPendapatan = (t) => t.tipe === 'masuk' && kat.get(t.kategori_id)?.kode !== 'tarik_tabungan';
  const isKeluar = (t) => t.tipe === 'keluar';
  const kelompokDari = (t) => kat.get(t.kategori_id)?.kelompok ?? 'kebutuhan';
  const isJajan = (t) => isKeluar(t) && kat.get(t.kategori_id)?.is_jajan;

  const ini = trx.filter((t) => bulanDari(t) === ym && t.tanggal <= hariIni);
  const lalu = trx.filter((t) => bulanDari(t) === ymLalu);
  const sebelumnya = trx.filter((t) => bulanDari(t) < ym);

  // ---------------- METRIK UTAMA ----------------
  const masuk = jumlahkan(ini.filter(isPendapatan), (t) => t.jumlah);
  const keluar = jumlahkan(ini.filter(isKeluar), (t) => t.jumlah);
  const kelompok = { kebutuhan: 0, keinginan: 0, tabungan_hutang: 0 };
  for (const t of ini.filter(isKeluar)) kelompok[kelompokDari(t)] = (kelompok[kelompokDari(t)] || 0) + Number(t.jumlah);
  const pendapatanAcuan = Math.max(masuk, Number(profil.pendapatan_bulanan) || 0);
  const biayaHidupIni = kelompok.kebutuhan + kelompok.keinginan;

  // Rata-rata biaya hidup (kebutuhan + keinginan) bulan-bulan penuh sebelumnya
  const bulanSebelumnya = [...new Set(sebelumnya.map(bulanDari))];
  const biayaHidupRata = bulanSebelumnya.length
    ? jumlahkan(sebelumnya.filter((t) => isKeluar(t) && kelompokDari(t) !== 'tabungan_hutang'), (t) => t.jumlah) / bulanSebelumnya.length
    : biayaHidupIni / Math.max(porsiBulan, 0.1);

  // Proyeksi pengeluaran sampai akhir bulan (yang rutin tetap, yang harian diproyeksikan)
  const proyeksiKeluar = hariKe >= 3 ? keluar + (biayaHidupIni / hariKe) * (totalHari - hariKe) * 0.6 : keluar;

  const jajanIni = ini.filter(isJajan);
  const jajan = { total: jumlahkan(jajanIni, (t) => t.jumlah), n: jajanIni.length };

  const hutangAktif = hutang.filter((h) => h.status === 'aktif');
  const totalCicilan = jumlahkan(hutangAktif, (h) => h.cicilan_bulanan);
  const totalSisaHutang = jumlahkan(hutangAktif, (h) => h.sisa);
  const rasioCicilan = persen(totalCicilan, pendapatanAcuan);

  // Pengeluaran per kategori bulan ini
  const perKategori = new Map();
  for (const t of ini.filter(isKeluar)) perKategori.set(t.kategori_id, (perKategori.get(t.kategori_id) || 0) + Number(t.jumlah));
  const topKategori = [...perKategori.entries()]
    .map(([id, total]) => ({ id, nama: kat.get(id)?.nama ?? 'Tanpa kategori', ikon: kat.get(id)?.ikon ?? 'tag', total }))
    .sort((a, b) => b.total - a.total);

  const metrik = { ym, masuk, keluar, sisa: masuk - keluar, kelompok, pendapatanAcuan, biayaHidupRata,
    proyeksiKeluar, jajan, totalCicilan, totalSisaHutang, rasioCicilan, topKategori, hariKe, totalHari };

  // ---------------- DAFTAR INSIGHT ----------------
  const daftar = [];
  const tambah = (x) => daftar.push(x);

  // 1. Arus kas bulan ini
  if (masuk > 0 && keluar > masuk) {
    tambah({ id: 'minus', level: 'bahaya', ikon: 'trending-down', judul: 'Pengeluaran melebihi pemasukan',
      pesan: `Bulan ini keluar ${rupiah(keluar)}, padahal masuk ${rupiah(masuk)}. Defisit ${rupiah(keluar - masuk)}.`,
      saran: 'Tahan dulu belanja keinginan (jajan, belanja online) sampai gajian berikutnya.', link: '#/budget' });
  } else if (pendapatanAcuan > 0 && proyeksiKeluar > pendapatanAcuan && hariKe < totalHari) {
    tambah({ id: 'proyeksi', level: 'waspada', ikon: 'chart-arrows-vertical', judul: 'Diproyeksikan minus akhir bulan',
      pesan: `Dengan pola sekarang, pengeluaran bisa mencapai ±${kira(proyeksiKeluar)} — di atas pendapatan ${rupiah(pendapatanAcuan)}.`,
      saran: `Batasi pengeluaran harian sekitar ${kira(Math.max(0, (pendapatanAcuan - keluar) / Math.max(1, totalHari - hariKe)))} sampai akhir bulan.` });
  }

  // 2. Aturan 50/30/20
  if (pendapatanAcuan > 0) {
    const pKeinginan = persen(kelompok.keinginan, pendapatanAcuan);
    const pKebutuhan = persen(kelompok.kebutuhan, pendapatanAcuan);
    const pTabungan = persen(kelompok.tabungan_hutang + Math.max(0, masuk - keluar), pendapatanAcuan);
    if (pKeinginan > 30) {
      tambah({ id: '503020-keinginan', level: 'waspada', ikon: 'scale', judul: `Keinginan sudah ${pKeinginan}% dari pendapatan`,
        pesan: `Aturan 50/30/20 menyarankan keinginan maksimal 30% (${rupiah(pendapatanAcuan * 0.3)}). Kelebihan ${rupiah(kelompok.keinginan - pendapatanAcuan * 0.3)}.`,
        saran: 'Pindahkan kelebihan itu ke tabungan atau pelunasan hutang.', link: '#/analisis' });
    }
    if (pKebutuhan > 60) {
      tambah({ id: '503020-kebutuhan', level: 'info', ikon: 'home-dollar', judul: `Kebutuhan pokok ${pKebutuhan}% dari pendapatan`,
        pesan: 'Idealnya kebutuhan maksimal 50%. Biaya tetap yang tinggi membuat ruang menabung sempit.',
        saran: 'Cek biaya tetap (sewa, langganan, paket data) yang bisa dinegosiasi atau diganti yang lebih murah.' });
    }
    if (hariKe >= 20 && pTabungan < 20) {
      tambah({ id: '503020-tabungan', level: 'waspada', ikon: 'pig-money', judul: `Porsi tabungan & hutang baru ${pTabungan}%`,
        pesan: `Targetnya minimal 20% (${rupiah(pendapatanAcuan * 0.2)}) per bulan untuk tabungan, investasi, dan cicilan.`,
        saran: 'Coba "bayar diri sendiri dulu": langsung sisihkan 20% begitu gaji masuk.', link: '#/tabungan' });
    } else if (hariKe >= 20 && pTabungan >= 20 && masuk >= keluar && !daftar.some((d) => d.id === 'minus' || d.id === 'proyeksi')) {
      tambah({ id: '503020-bagus', level: 'bagus', ikon: 'trophy', judul: `Mantap! ${pTabungan}% pendapatan untuk masa depan`,
        pesan: 'Porsi tabungan, investasi, dan cicilan kamu sudah memenuhi target 20%. Pertahankan!' });
    }
  }

  // 3. Kategori yang naik dibanding bulan lalu (dibandingkan sampai tanggal yang sama)
  const lalSampaiHariIni = lalu.filter((t) => isKeluar(t) && Number(t.tanggal.slice(8, 10)) <= hariKe);
  const lalPerKat = new Map();
  for (const t of lalSampaiHariIni) lalPerKat.set(t.kategori_id, (lalPerKat.get(t.kategori_id) || 0) + Number(t.jumlah));
  const kenaikan = topKategori
    .filter((k) => !kat.get(k.id)?.kode && lalPerKat.get(k.id) > 0)
    .map((k) => ({ ...k, sebelum: lalPerKat.get(k.id), naik: (k.total - lalPerKat.get(k.id)) / lalPerKat.get(k.id) }))
    .filter((k) => k.naik >= 0.3 && k.total - k.sebelum >= 100000)
    .sort((a, b) => (b.total - b.sebelum) - (a.total - a.sebelum))
    .slice(0, 2);
  for (const k of kenaikan) {
    tambah({ id: 'naik-' + k.id, level: 'waspada', ikon: 'arrow-big-up-lines', judul: `${k.nama} naik ${Math.round(k.naik * 100)}%`,
      pesan: `Sampai tanggal ${hariKe}, ${k.nama.toLowerCase()} ${rupiah(k.total)} vs ${rupiah(k.sebelum)} di periode yang sama bulan lalu.`,
      saran: `Kembali ke pola bulan lalu bisa hemat ±${kira(((k.total - k.sebelum) / hariKe) * totalHari)} sebulan.` });
  }

  // 4. Kebocoran jajan kecil-kecil
  if (jajan.n >= 10) {
    const rata = jajan.total / jajan.n;
    const proyeksiTahun = (jajan.total / hariKe) * 365;
    tambah({ id: 'jajan', level: jajan.total > pendapatanAcuan * 0.2 ? 'waspada' : 'info', ikon: 'coffee', judul: `Jajan ${jajan.n}x bulan ini`,
      pesan: `Total ${rupiah(jajan.total)}, rata-rata ${kira(rata)} sekali jajan. Kalau polanya sama, setahun ≈ ${kira(proyeksiTahun)}.`,
      saran: `Kurangi sepertiganya saja = hemat ±${kira(proyeksiTahun / 3)} per tahun.`, link: '#/budget' });
  }

  // 5. Budget per kategori
  for (const k of kategori.filter((k) => k.batas_bulanan > 0)) {
    const pakai = perKategori.get(k.id) || 0;
    const p = persen(pakai, k.batas_bulanan);
    if (p >= 100) {
      tambah({ id: 'budget-' + k.id, level: 'bahaya', ikon: 'alert-octagon', judul: `Budget ${k.nama} terlewati`,
        pesan: `Terpakai ${rupiah(pakai)} dari ${rupiah(k.batas_bulanan)} (${p}%).`, saran: 'Stop dulu kategori ini sampai bulan depan.', link: '#/budget' });
    } else if (p >= 80 || (p > persen(hariKe, totalHari) + 25 && p >= 50)) {
      tambah({ id: 'budget-' + k.id, level: 'waspada', ikon: 'alert-triangle', judul: `Budget ${k.nama} tinggal ${100 - p}%`,
        pesan: `Sudah terpakai ${p}% padahal bulan baru berjalan ${persen(hariKe, totalHari)}%.`,
        saran: `Sisa ${rupiah(k.batas_bulanan - pakai)} → maksimal ${kira((k.batas_bulanan - pakai) / Math.max(1, totalHari - hariKe + 1))}/hari.`, link: '#/budget' });
    }
  }

  // 6. Rasio cicilan terhadap pendapatan
  if (hutangAktif.length && pendapatanAcuan > 0) {
    if (rasioCicilan > 30) {
      tambah({ id: 'rasio-cicilan', level: 'bahaya', ikon: 'file-alert', judul: `Cicilan ${rasioCicilan}% dari pendapatan`,
        pesan: `Total cicilan ${rupiah(totalCicilan)}/bulan. Batas aman maksimal 30% (${rupiah(pendapatanAcuan * 0.3)}).`,
        saran: 'Jangan ambil cicilan/paylater baru dulu. Fokus lunasi satu per satu.', link: '#/hutang' });
    } else if (rasioCicilan > 20) {
      tambah({ id: 'rasio-cicilan', level: 'waspada', ikon: 'file-invoice', judul: `Cicilan ${rasioCicilan}% dari pendapatan`,
        pesan: 'Masih di bawah batas 30%, tapi ruang untuk cicilan baru sudah tipis.', link: '#/hutang' });
    }
  }

  // 7. Strategi pelunasan hutang
  if (hutangAktif.length >= 2) {
    const strategi = profil.strategi_hutang || 'avalanche';
    const urut = urutkanHutang(hutangAktif, strategi);
    const p = urut[0];
    tambah({ id: 'strategi-hutang', level: 'info', ikon: 'target-arrow',
      judul: `Prioritas lunasi: ${p.nama}`,
      pesan: strategi === 'avalanche'
        ? `Metode avalanche: bunga tertinggi dulu (${p.bunga_persen_tahun}%/th) supaya total bunga yang dibayar paling kecil.`
        : `Metode snowball: sisa terkecil dulu (${rupiah(p.sisa)}) supaya cepat merasakan hutang lunas.`,
      saran: 'Bayar minimum untuk hutang lain, lalu semua uang lebih dialihkan ke hutang prioritas ini.', link: '#/hutang' });
  }
  const bungaTinggi = hutangAktif.filter((h) => h.bunga_persen_tahun >= 20).sort((a, b) => b.bunga_persen_tahun - a.bunga_persen_tahun)[0];
  if (bungaTinggi) {
    tambah({ id: 'bunga-tinggi', level: 'waspada', ikon: 'flame', judul: `Bunga ${bungaTinggi.nama} ${bungaTinggi.bunga_persen_tahun}%/tahun`,
      pesan: `Dengan sisa ${rupiah(bungaTinggi.sisa)}, bunganya bisa ±${kira((bungaTinggi.sisa * bungaTinggi.bunga_persen_tahun) / 100 / 12)} per bulan.`,
      saran: 'Hutang berbunga tinggi (paylater, kartu kredit) sebaiknya dilunasi sebelum menabung untuk keinginan.', link: '#/hutang' });
  }

  // 8. Jatuh tempo dekat
  for (const h of hutangAktif) {
    const jt = jatuhTempoBerikutnya(h.tgl_jatuh_tempo);
    if (!jt) continue;
    const sisaHari = hariMenuju(jt);
    if (sisaHari >= 0 && sisaHari <= 5) {
      tambah({ id: 'jt-' + h.id, level: sisaHari <= 2 ? 'bahaya' : 'waspada', ikon: 'calendar-due',
        judul: sisaHari === 0 ? `${h.nama} jatuh tempo hari ini` : `${h.nama} jatuh tempo ${sisaHari} hari lagi`,
        pesan: `Siapkan ${rupiah(h.cicilan_bulanan || h.sisa)} supaya tidak kena denda.`, link: '#/hutang' });
    }
  }

  // 9. Dana darurat
  const darurat = tabungan.filter((t) => t.jenis === 'darurat' && t.status !== 'arsip');
  const totalDarurat = jumlahkan(darurat, (t) => t.terkumpul);
  if (biayaHidupRata > 0) {
    const cukup = totalDarurat / biayaHidupRata;
    if (!darurat.length) {
      tambah({ id: 'darurat-belum', level: 'waspada', ikon: 'shield-x', judul: 'Belum punya dana darurat',
        pesan: `Idealnya 3–6x biaya hidup bulanan: ${kira(biayaHidupRata * 3)} – ${kira(biayaHidupRata * 6)}.`,
        saran: 'Buat target tabungan jenis "Dana darurat" dan isi pelan-pelan setiap gajian.', link: '#/tabungan' });
    } else if (cukup < 3) {
      tambah({ id: 'darurat-kurang', level: 'waspada', ikon: 'shield-half', judul: `Dana darurat baru cukup ${cukup.toLocaleString('id-ID', { maximumFractionDigits: 1 })} bulan`,
        pesan: `Biaya hidup kamu ±${kira(biayaHidupRata)}/bulan. Minimal 3 bulan = ${kira(biayaHidupRata * 3)}.`,
        saran: `Kurang ${kira(biayaHidupRata * 3 - totalDarurat)}. Dahulukan ini sebelum target tabungan lain.`, link: '#/tabungan' });
    } else if (cukup >= 6) {
      tambah({ id: 'darurat-aman', level: 'bagus', ikon: 'shield-check', judul: 'Dana darurat sudah aman',
        pesan: `Cukup untuk ±${Math.floor(cukup)} bulan biaya hidup. Uang lebih bisa mulai diinvestasikan.` });
    }
  }

  // 10. Target tabungan dengan tenggat
  for (const t of tabungan.filter((t) => t.status === 'aktif' && t.jenis === 'tujuan' && t.tenggat)) {
    const kurang = t.target - t.terkumpul;
    if (kurang <= 0) continue;
    if (hariMenuju(t.tenggat) < 0) {
      tambah({ id: 'tab-lewat-' + t.id, level: 'waspada', ikon: 'calendar-x', judul: `Tenggat ${t.nama} sudah lewat`,
        pesan: `Masih kurang ${rupiah(kurang)}. Perbarui tenggatnya supaya rencana tetap realistis.`, link: '#/tabungan' });
    } else {
      const bln = bulanMenuju(t.tenggat);
      tambah({ id: 'tab-' + t.id, level: 'info', ikon: t.ikon || 'pig-money', judul: `${t.nama}: setor ${ringkas(kurang / bln)}/bulan`,
        pesan: `Kurang ${rupiah(kurang)} dalam ±${bln} bulan. Setor ${kira(kurang / bln)} tiap bulan agar tercapai tepat waktu.`, link: '#/tabungan' });
    }
  }

  // 11. Belum menabung bulan ini
  const setorIni = ini.filter((t) => isKeluar(t) && kat.get(t.kategori_id)?.kode === 'setor_tabungan');
  if (masuk > 0 && !setorIni.length && tabungan.some((t) => t.status === 'aktif')) {
    tambah({ id: 'bayar-diri', level: 'info', ikon: 'hand-finger-right', judul: 'Belum ada setoran tabungan bulan ini',
      pesan: `Sisihkan 10–20% (${kira(masuk * 0.1)} – ${kira(masuk * 0.2)}) di awal bulan, bukan dari sisa.`, link: '#/tabungan' });
  }

  // 12. Hari paling boros untuk jajan (pakai 3 bulan data)
  const jajanSemua = trx.filter(isJajan);
  if (jajanSemua.length >= 15) {
    const perHari = Array(7).fill(0);
    for (const t of jajanSemua) perHari[dariISO(t.tanggal).getDay()] += Number(t.jumlah);
    const maks = perHari.indexOf(Math.max(...perHari));
    const rataHari = jumlahkan(perHari) / 7;
    if (perHari[maks] > rataHari * 1.5) {
      tambah({ id: 'hari-boros', level: 'info', ikon: 'calendar-stats', judul: `Hari ${NAMA_HARI[maks]} paling boros`,
        pesan: `Jajan di hari ${NAMA_HARI[maks]} ${Math.round(perHari[maks] / rataHari * 10) / 10}x lipat rata-rata hari lain.`,
        saran: `Rencanakan kegiatan ${NAMA_HARI[maks]} yang lebih hemat, atau tetapkan uang jajan khusus hari itu.` });
    }
  }

  // 13. Kebiasaan mencatat
  const terakhir = trx.map((t) => t.tanggal).sort().at(-1);
  if (terakhir && hariMenuju(terakhir) <= -3) {
    tambah({ id: 'lupa-catat', level: 'info', ikon: 'pencil-exclamation', judul: `${-hariMenuju(terakhir)} hari tidak mencatat`,
      pesan: 'Insight hanya akurat kalau semua transaksi tercatat. Yuk catat yang terlewat.', link: '#/transaksi' });
  }

  // Kalau semuanya baik
  if (!daftar.some((d) => d.level === 'bahaya' || d.level === 'waspada') && masuk > 0) {
    tambah({ id: 'aman', level: 'bagus', ikon: 'mood-happy', judul: `Keuangan ${namaBulan(ym)} terkendali`,
      pesan: `Sisa sementara ${rupiah(masuk - keluar)}. Pertahankan kebiasaan mencatat!` });
  }

  daftar.sort((a, b) => BOBOT[b.level] - BOBOT[a.level]);
  return { metrik, daftar };
}

/** Urutkan hutang aktif sesuai strategi pelunasan */
export function urutkanHutang(hutang, strategi = 'avalanche') {
  return [...hutang].sort((a, b) =>
    strategi === 'snowball'
      ? a.sisa - b.sisa || b.bunga_persen_tahun - a.bunga_persen_tahun
      : b.bunga_persen_tahun - a.bunga_persen_tahun || a.sisa - b.sisa);
}

/** Tips umum keuangan pribadi (ditampilkan di halaman Analisis) */
export const TIPS = [
  { ikon: 'percentage', judul: 'Aturan 50/30/20', isi: '50% kebutuhan, 30% keinginan, 20% tabungan & cicilan. Pakai sebagai patokan, bukan aturan mati.' },
  { ikon: 'shield-check', judul: 'Dana darurat dulu', isi: 'Kumpulkan 3–6 bulan biaya hidup di rekening terpisah sebelum investasi berisiko.' },
  { ikon: 'flame', judul: 'Lunasi bunga tinggi', isi: 'Paylater & kartu kredit bisa berbunga >20%/tahun. Melunasinya = "untung" pasti sebesar bunganya.' },
  { ikon: 'calendar-repeat', judul: 'Otomatiskan tabungan', isi: 'Atur auto-debet tabungan di tanggal gajian supaya tidak tergoda membelanjakan.' },
  { ikon: 'clock-pause', judul: 'Aturan 24 jam', isi: 'Untuk belanja keinginan di atas Rp 300 rb, tunggu 24 jam. Sering kali keinginannya hilang.' },
  { ikon: 'receipt-refund', judul: 'Audit langganan', isi: 'Cek langganan streaming/aplikasi tiap 3 bulan. Batalkan yang jarang dipakai.' },
];
