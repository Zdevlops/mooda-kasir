# MoodA Kasir

Aplikasi kasir untuk kafe. Satu aplikasi, jalan offline, data tersimpan di perangkat.

## Unduh

Buka halaman **[Releases](../../releases/latest)** dan pilih:

| Berkas | Untuk | Cara pakai |
|---|---|---|
| `MoodA-<versi>.apk` | Android | Unduh di HP, buka, izinkan "instal dari sumber tidak dikenal" |
| `MoodA-Single.html` | Windows, Mac, iPhone, Android | Satu file. Klik dua kali (komputer) atau buka dengan Chrome (HP) |

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
node _test_idb.js          #  7 tes: IndexedDB, migrasi, kapasitas
```

Semua tes memakai Chrome headless lewat DevTools Protocol.

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
