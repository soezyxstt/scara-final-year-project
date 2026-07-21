# Data eksperimen

Folder `experiments` memuat data sampel yang telah dipilih dan diseragamkan dari `tugasakhir.db`. Setiap file mewakili satu kelompok pengujian pada Bab 4.

## Daftar file

| File | Isi |
|---|---|
| `exp1_tracking_differentiator.csv` | TD mati dan nyala |
| `exp2_inertia_compensation.csv` | BASELINE dan kompensasi inersia |
| `exp3_coriolis_compensation.csv` | Coriolis mati dan nyala dengan inersia tetap nyala |
| `exp4_gravity_compensation.csv` | Kemiringan 0°, 5°, 10°, dan 15° |
| `exp5_trapezoidal_profile.csv` | Profil trapesium mati dan nyala |
| `dataset_manifest.csv` | Jumlah *run*, jumlah sampel, dan sumber setiap file |

## Kolom utama

- `experiment_id`: kelompok analisis EXP-1 sampai EXP-5.
- `source_experiment_id`: kelompok asal pada basis data.
- `source_table`: tabel sampel asal.
- `run_id` dan `run_name`: identitas *run* fisik.
- `condition`: `off` atau `on` untuk faktor yang diuji.
- `direction`: `forward` atau `return`.
- `tilt_deg`: kemiringan bidang dalam derajat.
- `shared_baseline`: bernilai 1 jika data acuan dipakai kembali untuk perbandingan lain.
- `sample_index` dan `time_s`: indeks dan waktu sampel jika tersedia.
- `phase`: fase `move` atau `settle` jika tersedia.
- `x_reference_mm`, `y_reference_mm`, `x_actual_mm`, `y_actual_mm`: posisi Kartesius.
- Kolom sudut: posisi referensi dan aktual kedua sendi dalam radian.
- Kolom galat: galat ujung lengan, lintas lintasan, sepanjang lintasan, dan sendi.
- `pwm1` dan `control_effort_j1`: data diagnosis Sendi 1 jika tersedia.

Sel kosong berarti tabel sumber memang tidak merekam besaran tersebut. Program ekspor tidak mengisi nilai yang tidak tersedia dengan perkiraan.

## Membuat ulang data

Jalankan dari folder `code`:

```powershell
python analysis/export_experiment_csv.py ..\results\tugasakhir.db
```

Program membaca basis data dalam mode baca-saja dan menulis ulang seluruh CSV pada folder `data/experiments`.
