<p align="center">
  <img src="icons/brand-256.png" width="112" alt="MoodA">
</p>

<h1 align="center">MoodA Kasir</h1>

<p align="center">Aplikasi kasir untuk kafe. Jalan offline, data tersimpan di perangkat.</p>

<p align="center">
  <a href="https://github.com/Zdevlops/mooda-kasir/releases/latest/download/MoodA.apk">
    <img src="https://img.shields.io/badge/UNDUH%20APK-Android%20%E2%80%A2%20gratis-0F5C55?style=for-the-badge&logo=android&logoColor=white" alt="Unduh APK Android">
  </a>
  &nbsp;
  <a href="https://github.com/Zdevlops/mooda-kasir/releases/latest/download/MoodA-Single.html">
    <img src="https://img.shields.io/badge/UNDUH-HTML%20satu%20file-FF7A26?style=for-the-badge&logo=html5&logoColor=white" alt="Unduh HTML satu file">
  </a>
</p>

<p align="center">
  <a href="https://github.com/Zdevlops/mooda-kasir/releases/latest"><img src="https://img.shields.io/github/v/release/Zdevlops/mooda-kasir?style=flat-square&label=versi&color=0F5C55" alt="Versi terbaru"></a>
  <a href="https://github.com/Zdevlops/mooda-kasir/releases"><img src="https://img.shields.io/github/downloads/Zdevlops/mooda-kasir/total?style=flat-square&label=unduhan" alt="Total unduhan"></a>
  <img src="https://img.shields.io/badge/offline-siap-2EA043?style=flat-square" alt="Siap offline">
  <img src="https://img.shields.io/badge/pembaruan-otomatis-0F5C55?style=flat-square" alt="Pembaruan otomatis">
</p>

## Unduh

Tekan tombol di atas, atau buka halaman **[Rilis terbaru](../../releases/latest)**.

| Berkas | Untuk | Cara pakai |
|---|---|---|
| **`MoodA.apk`** | Android | Unduh di HP, buka, izinkan "instal dari sumber tidak dikenal" |
| **`MoodA-Single.html`** | Windows, Mac, iPhone, Android | Satu file. Klik dua kali (komputer) atau buka dengan Chrome (HP) |

Tidak perlu akun, tidak perlu internet setelah terpasang.

## Fitur

- **Kasir** — ketuk menu, atur es & gula, catatan per item, tahan pesanan, keranjang, diskon.
- **Cari menu** dan filter Makanan / Minuman.
- **Bayar** — Cash, QRIS, E-Wallet (GoPay/OVO/DANA/ShopeePay), Transfer. Uang cepat dan hitung kembalian otomatis.
- **Struk** — atas nama besar, nomor pesanan kecil, diskon tampil terpisah, catatan item ikut tercetak.
- **Cetak** — printer thermal 58/80 mm lewat Bluetooth (APK), WiFi/LAN TCP 9100, atau dialog cetak sistem.
- **Rekap** — omzet, transaksi, item terjual, rata-rata, menu terlaris, rincian per metode bayar, cari riwayat, ekspor PDF/CSV.
- **Harga & foto menu** — ubah harga, ganti ilustrasi dengan foto sendiri.
- **Info** — pengumuman yang bisa diperbarui tanpa memasang ulang aplikasi.
- **Pembaruan otomatis** — aplikasi Android memeriksa rilis terbaru di GitHub, mengunduh APK-nya, lalu membuka pemasang. Ada di **Info → Pembaruan aplikasi**.
- **Kunci PIN** — layar terkunci bila PIN dibuat.
- **Database** — IndexedDB (ratusan MB) dengan cadangan di localStorage.

## Struk

```
        MOODA
  Es Teh * Milk Tea * Cemilan
******************************
         ATAS NAMA
           DIMAS
      21/11/2026    15:39
   No. pesanan #MWQ5P8K6
******************************
1x Takoyaki          Rp15.000
   tanpa sambal
******************************
1 item
TOTAL                Rp15.000
Cash                 Rp20.000
Kembali               Rp5.000
       [ CASH ]
     Terima kasih sudah mampir
```

## Menjalankan dari sumber

```bash
node build-single.js     # dist/MoodA-Single.html
node build-www.js        # www/ untuk Capacitor
python -m http.server 8080
```

Buka `http://localhost:8080`.

## Tes

```bash
node _test_cdp.js          # 20 tes: menu, bayar, struk, rekap, responsif
node _test_struk_info.js   # 19 tes: struk baru + halaman Info
node _test_update.js       # 13 tes: cek pembaruan, banner, alur pasang
node _test_idb.js          #  7 tes: IndexedDB, migrasi, kapasitas
```

Semua tes memakai Chrome headless lewat DevTools Protocol.

## Pembaruan otomatis (APK Android)

Cara kerjanya sama seperti Zrec:

1. Saat aplikasi dibuka, ia bertanya ke `api.github.com/repos/Zdevlops/mooda-kasir/releases/latest`.
2. Nomor build rilis dibaca dari badan rilis (`<!-- mooda:versionCode=N -->`) dan dibandingkan dengan yang terpasang.
3. Bila lebih baru, muncul banner **Versi baru tersedia**. Tekan **Perbarui**.
4. APK diunduh ke cache, isinya diperiksa (nama paket + nomor build), lalu pemasang Android dibuka.
5. Android tidak pernah memasang diam-diam untuk aplikasi sideload, jadi tinggal satu ketukan konfirmasi.

Jawaban GitHub disimpan 30 menit supaya tidak kena batas 60 permintaan/jam.

**Cara merilis versi baru:**

```bash
# 1. naikkan versi di package.json (mis. 3.2.0 -> 3.3.0)
# 2. commit, lalu buat tag
git tag v3.3.0
git push origin main --tags
```

Workflow akan membangun APK bertanda tangan, menerbitkan rilis, dan menaruh nomor build di badan rilis. Aplikasi yang sudah terpasang akan menawarkan pembaruan sendiri.

APK ditandatangani dengan kunci rilis tetap yang disimpan di GitHub Secrets (`MOODA_KEYSTORE_B64` dan kawan-kawan), jadi pembaruan bisa dipasang menimpa versi lama tanpa uninstall. Salinan kuncinya ada di `%USERPROFILE%\.mooda-release\` — **jangan dihapus**, tanpa itu pembaruan berikutnya tidak bisa menimpa yang terpasang.

## Struktur

| Berkas | Isi |
|---|---|
| `app.js` | seluruh logika: kasir, struk, rekap, printer, database |
| `index.html` | kerangka halaman |
| `styles.css` | tampilan |
| `sw.js` | service worker (offline) |
| `bridge.js` | jembatan cetak lewat Node (opsional, komputer) |
| `native/plugin/` | plugin cetak Bluetooth untuk APK |
| `.github/workflows/build.yml` | bangun HTML + APK otomatis |

## Catatan data

Data tersimpan di perangkat itu saja. Ganti perangkat atau bersihkan data browser = transaksi hilang. Biasakan tekan **Backup data (JSON)** di tab Rekap.
