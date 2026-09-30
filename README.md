# KasFlow | Sistem Kas Pom Bensin

Aplikasi pencatatan penjualan BBM, shift petugas, dan transaksi kas. Frontend statis berada di `frontend/`; API Node.js berada di `backend/` dan menggunakan Supabase.

## Publikasi GitHub Pages

Workflow pada `.github/workflows/pages.yml` menerbitkan isi folder `frontend/` secara otomatis setiap ada push ke branch `main`.

1. Buka **Settings > Pages** pada repository.
2. Pada **Build and deployment > Source**, pilih **GitHub Actions**.
3. Pastikan seluruh file proyek sudah di-commit dan di-push ke branch `main`.
4. Lihat status workflow di tab **Actions**. Setelah selesai, buka URL yang ditampilkan di **Settings > Pages**.

GitHub Pages hanya menjalankan frontend statis. Backend Node.js perlu di-deploy ke layanan hosting backend secara terpisah.

## Menjalankan backend lokal

Persyaratan: Node.js 20.6 atau lebih baru dan proyek Supabase.

1. Salin `.env.example` menjadi `.env` dan isi URL Supabase serta service role key.
2. Jalankan `backend/schema.sql` di Supabase SQL Editor.
3. Dari root repository, jalankan `npm start`.
4. Buka `frontend/index.html` melalui ekstensi Live Server atau server statis lokal.

Untuk memakai API yang sudah di-host dari frontend, isi `window.KASFLOW_API_BASE` di `frontend/config.js` dengan URL API publik yang berakhiran `/api`, misalnya `https://api.example.com/api`.

## Keamanan

Jangan commit `.env` atau memasukkan `SUPABASE_SERVICE_ROLE_KEY` ke frontend. Atur rahasia tersebut sebagai environment variables pada layanan backend. `.gitignore` mengecualikan file `.env`.

API saat ini belum memiliki autentikasi pengguna. Jangan membuka API untuk transaksi nyata sebelum autentikasi dan pembatasan akses produksi diterapkan.