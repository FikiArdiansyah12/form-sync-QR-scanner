# FormSync — Mobile-First Attendance & Check-In Portal

FormSync adalah sistem presensi acara mandiri berbasis web yang terisolasi per workspace acara dengan integrasi dua arah Google Sheets. Didesain secara khusus untuk kemudahan petugas di lapangan melalui smartphone, serta dilengkapi modal dialog pemindai 1:1 langsung di dalam spreadsheet Google Sheets.

Domain Resmi: **[formsync.my.id](https://formsync.my.id)**

---

## Fitur Utama

1. **8-Digit Event Identifier (`XXXX-YYYY`)**:
   - Format kode acara 8-karakter alfanumerik non-ambigu (tanpa `0, O, 1, I, L`) yang dipisah dengan tanda hubung (contoh: `FS9K-7M2P`).
   - Setiap workspace spreadsheet memiliki ID acara permanen yang terkunci dan terisolasi secara multi-tenant (tiket Acara A otomatis ditolak di Acara B).

2. **Google Sheets Webhook & Modal Bridge**:
   - Menu otomatis **FormSync** di Google Sheets (`Extensions -> Apps Script`).
   - Opsi menu **FormSync > Open Attendance Scanner** untuk membuka jendela modal pemindai (500x650 px) langsung di atas spreadsheet tanpa berpindah tab.
   - Sinkronisasi dua arah via webhook `doGet` dan `doPost` (mode `no-cors` background sync).

3. **Multi-Session Cross-Check Matrix**:
   - Mendukung multi-sesi checkpoint presensi dalam satu acara: Sesi Pagi (*Morning*), Sesi Konsumsi (*Lunch Ration*), Pengambilan Souvenir (*Kit Collection*), atau sesi khusus kustom.
   - Tabel matriks cross-check interaktif untuk memverifikasi kedatangan peserta antar checkpoint.

4. **Kepatuhan Aturan Desain & UI**:
   - **Zero-Dot Policy**: Bebas dari karakter bullet dot (`•`) pada teks status rasio kehadiran.
   - **Zero Forbidden Icons**: Dilarang keras menggunakan ikon panah berputar / reload melingkar (`RefreshCw`, `RotateCcw`, dll.). Menggunakan teks status dinamis dan tombol konfirmasi yang jelas.
   - **Clean Neutral Palette**: Menggunakan palet monokromatik netral (slate/zinc) dengan kontras terukur dan tipografi nyaman dibaca.
   - **Bebas Emoticon**: Seluruh teks antarmuka dan pesan sistem bebas dari emoji/emoticon.

---

## Panduan Perintah

### Menjalankan Server Pengembangan Lokal
```powershell
npm run dev
```
Aplikasi akan berjalan di `http://localhost:5174`.

### Menjalankan Pengujian Otomatis (Vitest)
```powershell
npm test
```
Seluruh rangkaian pengujian unit (51 tests) akan dieksekusi, memverifikasi isolasi event code, multi-session, security lock, serta kepatuhan Zero-Dot Policy.

### Membangun Paket Produksi (Build)
```powershell
npm run build
```
Menghasilkan bundle statis produksi di direktori `dist/` yang siap dideploy ke Vercel.

---

## Pemasangan di Google Sheets

1. Buka spreadsheet Google Sheets data peserta.
2. Di antarmuka FormSync, buka modal **Sheets Sync** &rarr; **Sheets Script**, lalu klik **Copy Full Script**.
3. Di Google Sheets, buka menu **Extensions** &rarr; **Apps Script**.
4. Hapus isi default dan tempel (*paste*) kode yang telah disalin.
5. Simpan skrip (**Ctrl+S**), lalu muat ulang (*refresh*) halaman Google Sheets Anda.
6. Menu **FormSync** akan otomatis muncul di bilah menu Google Sheets.

---

## Pengaturan Deployment Vercel

Proyek ini telah dilengkapi file konfigurasi `vercel.json` dengan `Content-Security-Policy: frame-ancestors` yang mengizinkan penyematan iframe di domain Google Sheets (`https://docs.google.com`, `https://script.google.com`).

Konfigurasi DNS registrar domain `formsync.my.id`:
- Record A: `@` &rarr; `76.76.21.21`
- Record CNAME: `www` &rarr; `cname.vercel-dns.com`
