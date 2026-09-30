-- Sistem Kas Pom Bensin
-- ERD: petugas 1--N shift 1--N penjualan_bbm
--      shift 1--N transaksi_kas
-- Jalankan seluruh file ini di Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.petugas (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  peran text not null default 'operator' check (peran in ('admin', 'operator', 'supervisor')),
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now()
);

create table if not exists public.shift (
  id uuid primary key default gen_random_uuid(),
  petugas_id uuid not null references public.petugas(id) on delete restrict,
  mulai_pada timestamptz not null default now(),
  selesai_pada timestamptz,
  modal_awal numeric(14, 2) not null default 0 check (modal_awal >= 0),
  kas_akhir numeric(14, 2) check (kas_akhir >= 0),
  status text not null default 'aktif' check (status in ('aktif', 'selesai')),
  catatan text,
  dibuat_pada timestamptz not null default now()
);

create table if not exists public.penjualan_bbm (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shift(id) on delete restrict,
  jenis_bbm text not null check (jenis_bbm in ('Pertalite', 'Pertamax', 'Pertamax Turbo', 'Solar', 'Dexlite')),
  volume_liter numeric(10, 2) not null check (volume_liter > 0),
  harga_per_liter numeric(12, 2) not null check (harga_per_liter > 0),
  total numeric(14, 2) generated always as (volume_liter * harga_per_liter) stored,
  metode_pembayaran text not null check (metode_pembayaran in ('Tunai', 'QRIS', 'Kartu Debit')),
  terjadi_pada timestamptz not null default now()
);

create table if not exists public.transaksi_kas (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shift(id) on delete restrict,
  jenis text not null check (jenis in ('masuk', 'keluar')),
  kategori text not null,
  nominal numeric(14, 2) not null check (nominal > 0),
  catatan text,
  terjadi_pada timestamptz not null default now()
);

create index if not exists idx_shift_status on public.shift(status);
create index if not exists idx_penjualan_shift on public.penjualan_bbm(shift_id);
create index if not exists idx_penjualan_waktu on public.penjualan_bbm(terjadi_pada desc);
create index if not exists idx_kas_shift on public.transaksi_kas(shift_id);
create index if not exists idx_kas_waktu on public.transaksi_kas(terjadi_pada desc);

-- Seed minimal agar dashboard langsung punya konteks saat demo.
insert into public.petugas (nama, peran)
select 'Sari Utami', 'supervisor'
where not exists (select 1 from public.petugas);

insert into public.shift (petugas_id, modal_awal, status, catatan)
select id, 1500000, 'aktif', 'Shift pagi - demo'
from public.petugas
where nama = 'Sari Utami'
  and not exists (select 1 from public.shift);

-- View ringkas untuk laporan dashboard.
create or replace view public.ringkasan_shift as
select
  s.id,
  s.mulai_pada,
  s.selesai_pada,
  s.status,
  s.modal_awal,
  s.kas_akhir,
  p.nama as nama_petugas,
  coalesce(penjualan.total_penjualan, 0) as total_penjualan,
  coalesce(kas.kas_masuk, 0) as kas_masuk,
  coalesce(kas.kas_keluar, 0) as kas_keluar
from public.shift s
join public.petugas p on p.id = s.petugas_id
left join (
  select shift_id, sum(total) as total_penjualan
  from public.penjualan_bbm
  group by shift_id
) penjualan on penjualan.shift_id = s.id
left join (
  select
    shift_id,
    sum(case when jenis = 'masuk' then nominal else 0 end) as kas_masuk,
    sum(case when jenis = 'keluar' then nominal else 0 end) as kas_keluar
  from public.transaksi_kas
  group by shift_id
) kas on kas.shift_id = s.id;

-- Untuk produksi, aktifkan RLS sesuai strategi autentikasi Supabase yang dipilih.
-- API internal di backend menggunakan service role key dan tidak mengekspos key ke browser.
