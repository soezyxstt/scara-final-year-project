# Alat Peraga Robot SCARA Dua Derajat Kebebasan

Repositori ini memuat firmware ESP32, HMI berbasis web, skema telemetri bersama, dokumentasi teknis, dan data eksperimen terpilih untuk alat peraga robot SCARA planar dua derajat kebebasan.

Sistem memakai motor DC pada Sendi 1 dan motor stepper pada Sendi 2. Firmware menjalankan PID, *tracking differentiator* (TD), pembentukan lintasan trapesium, serta kompensasi inersia, Coriolis, dan gravitasi yang dapat diaktifkan secara terpisah. HMI berkomunikasi dengan ESP32 melalui Web Serial pada 921600 baud.

## Struktur repositori

```text
code/
├── analysis/                 # Program ekspor data eksperimen
├── data/experiments/         # CSV terpilih untuk EXP-1 sampai EXP-5
├── docs/                     # Dokumentasi firmware dan HMI
├── firmware/                 # Firmware PlatformIO untuk ESP32 DevKit V1
├── hmi/                      # Aplikasi Next.js untuk operasi dan analisis
├── shared/telemetry/         # Skema paket serial dan pembangkit tipe
├── .env.example              # Daftar variabel lingkungan tanpa rahasia
├── package-lock.json
└── package.json
```

Berkas desain PCB dipisahkan dari repositori perangkat lunak dan disimpan pada `../CAD/pcb`.

## Kebutuhan

- Node.js 20 atau lebih baru dan npm.
- Google Chrome atau Microsoft Edge yang mendukung Web Serial.
- Python 3.10 atau lebih baru untuk mengekspor data SQLite.
- PlatformIO dan kabel USB untuk membangun serta mengunggah firmware.
- ESP32 DevKit V1 dan alat peraga SCARA.

## Menjalankan HMI

1. Pasang dependensi dari folder ini.

   ```powershell
   npm install
   ```

2. Salin `.env.example` menjadi `hmi/.env.local`, lalu isi layanan yang akan digunakan. Koneksi serial dan tampilan utama tetap dapat dipelajari tanpa mengaktifkan seluruh layanan daring.

3. Bangkitkan tipe telemetri agar firmware dan HMI memakai urutan kolom yang sama.

   ```powershell
   npm run gen
   ```

4. Jalankan HMI.

   ```powershell
   npm run dev
   ```

5. Buka `http://localhost:3000` dengan Chrome atau Edge. Hubungkan ESP32 melalui tombol **Connect** dan pilih porta serial yang sesuai.

Jalur utama HMI adalah:

| Jalur | Fungsi |
|---|---|
| `/` | Operasi SCARA, pemantauan lintasan, dan analisis hasil gerak |
| `/test` | Perubahan parameter, pemeriksaan sinyal mentah, dan diagnosis |
| `/zn` | Pengujian respons langkah dan bantuan penalaan PID |
| `/dashboard` | Perbandingan data yang telah disimpan |

## Membangun firmware

Firmware berada pada folder `firmware`. Cara paling sederhana adalah membuka folder tersebut dengan PlatformIO di Visual Studio Code, lalu menjalankan **Build** atau **Upload**.

Perintah yang setara dari folder `firmware` adalah:

```powershell
scara.bat compile
scara.bat upload
scara.bat all
```

`scara.bat all` membangun firmware, mengunggahnya, lalu membuka monitor serial pada 921600 baud. Pastikan alat berada pada posisi aman sebelum mengirim perintah gerak.

## Alur replikasi pengujian

1. Bangun dan unggah firmware tanpa mengubah parameter bawaan.
2. Jalankan HMI dan pastikan paket `G`, `K`, dan `P` diterima.
3. Pilih titik awal `(140, 45)` mm dan titik akhir `(60, 155)` mm.
4. Ubah hanya satu faktor untuk setiap kelompok eksperimen.
5. Simpan semua *run* yang selesai beserta sampelnya.
6. Ekspor basis data dengan program pada folder `analysis`.
7. Periksa `dataset_manifest.csv` sebelum melakukan perbandingan.

Pemetaan perbandingan yang dipakai pada laporan adalah:

| Eksperimen | Kondisi acuan | Kondisi uji |
|---|---|---|
| EXP-1 | TD mati | TD nyala |
| EXP-2 | Semua kompensasi mati | Kompensasi inersia nyala |
| EXP-3 | Inersia nyala, Coriolis mati | Inersia dan Coriolis nyala |
| EXP-4 | Kompensasi gravitasi mati | Kompensasi gravitasi nyala |
| EXP-5 | Profil trapesium mati | Profil trapesium nyala |

BASELINE dipakai bersama sebagai kondisi acuan EXP-2 dan titik 0° EXP-4. Data EXP-2 dipakai sebagai kondisi Coriolis mati pada EXP-3 agar kompensasi inersia tetap sama pada kedua kondisi.

## Data eksperimen

CSV pada `data/experiments` hanya memuat data yang diperlukan untuk mereplikasi analisis laporan. Basis data asli tidak disertakan karena juga memuat data pengguna dan tabel internal HMI.

Untuk membuat ulang CSV:

```powershell
python analysis/export_experiment_csv.py ..\results\tugasakhir.db
```

Program tidak mengubah basis data sumber. Rincian kolom dan pemetaan data terdapat pada `data/README.md`.

## Catatan parameter torsi

Snapshot firmware dipertahankan sesuai perangkat lunak yang menghasilkan data eksperimen. Nilai referensi normalisasi torsi Sendi 1 pada pengujian sekitar 0,32 N·m dan berbeda dari torsi *stall* fisik sekitar 1,608 N·m. Jangan mengubah nilai ini ketika mereplikasi hasil lama; lakukan identifikasi dan pengujian ulang jika model atau perangkat keras diubah.

## Dokumentasi lanjutan

- `docs/firmware/readme.md`: pin, parameter, mode operasi, perintah, dan telemetri firmware.
- `docs/hmi/stack-and-architecture.md`: susunan aplikasi dan aliran koneksi serial.
- `docs/hmi/features-and-data-flow.md`: fitur HMI, basis data, dan protokol serial.
- `docs/hmi/scara-hmi-context.md`: rincian komponen dan keadaan internal HMI.

## Catatan keamanan

- Jangan memasukkan `.env`, `.env.local`, token Turso, rahasia autentikasi, atau kunci API ke Git.
- Aktifkan `E-STOP` sebelum memegang lengan atau mengubah sambungan listrik.
- Periksa arah siku dan batas ruang kerja sebelum memulai gerakan.
- Simpan basis data mentah di luar repositori publik.
