const http = require('node:http');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function sendJson(response, status, payload) {
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Payload terlalu besar'));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Format JSON tidak valid'));
      }
    });
    request.on('error', reject);
  });
}

function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi');
  }
}

async function supabaseRequest(path, options = {}) {
  assertSupabaseConfigured();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.method === 'POST' ? 'return=representation' : 'count=exact',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const error = new Error(data?.message || 'Supabase request gagal');
    error.status = response.status;
    throw error;
  }
  return data;
}

function limitFrom(url) {
  const value = Number(url.searchParams.get('limit') || 8);
  return Math.min(Math.max(value, 1), 50);
}

function parseLocalizedNumber(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return NaN;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    return lastComma > lastDot
      ? Number(text.replace(/\./g, '').replace(',', '.'))
      : Number(text.replace(/,/g, ''));
  }
  if (lastComma !== -1) return Number(text.replace(',', '.'));
  if ((text.match(/\./g) || []).length > 1) return Number(text.replace(/\./g, ''));
  if (lastDot !== -1 && text.length - lastDot - 1 === 3) return Number(text.replace('.', ''));
  return Number(text);
}

async function dashboardData() {
  const [shifts, sales, cash] = await Promise.all([
    supabaseRequest('shift?select=*,petugas(nama)&order=mulai_pada.desc&limit=8'),
    supabaseRequest('penjualan_bbm?select=*,shift(petugas(nama))&order=terjadi_pada.desc&limit=8'),
    supabaseRequest('transaksi_kas?select=*,shift(petugas(nama))&order=terjadi_pada.desc&limit=8')
  ]);
  const activeShift = shifts.find((shift) => shift.status === 'aktif') || null;
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todaySales = sales.filter((sale) => sale.terjadi_pada >= startOfDay);
  const todayCash = cash.filter((item) => item.terjadi_pada >= startOfDay);
  const salesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cashSalesTotal = todaySales.filter((sale) => sale.metode_pembayaran === 'Tunai').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cashIn = todayCash.filter((item) => item.jenis === 'masuk').reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const cashOut = todayCash.filter((item) => item.jenis === 'keluar').reduce((sum, item) => sum + Number(item.nominal || 0), 0);

  return {
    summary: {
      salesToday: salesTotal,
      cashBalance: Number(activeShift?.modal_awal || 0) + cashSalesTotal + cashIn - cashOut,
      transactionCount: todaySales.length,
      activeShift
    },
    shifts,
    sales,
    cash
  };
}

function validateSale(payload) {
  const required = ['shift_id', 'jenis_bbm', 'volume_liter', 'harga_per_liter', 'metode_pembayaran'];
  if (required.some((key) => payload[key] === undefined || payload[key] === '')) throw new Error('Data penjualan belum lengkap');
  const volume = parseLocalizedNumber(payload.volume_liter);
  const price = parseLocalizedNumber(payload.harga_per_liter);
  if (!Number.isFinite(volume) || !Number.isFinite(price) || volume <= 0 || price <= 0) throw new Error('Volume dan harga harus berupa angka yang valid');
  return { volume, price };
}

function validateCash(payload) {
  const required = ['shift_id', 'jenis', 'kategori', 'nominal'];
  if (required.some((key) => payload[key] === undefined || payload[key] === '')) throw new Error('Data transaksi kas belum lengkap');
  const nominal = parseLocalizedNumber(payload.nominal);
  if (!Number.isFinite(nominal) || nominal <= 0) throw new Error('Nominal harus berupa angka yang valid');
  return nominal;
}

async function openShift(payload) {
  const nama = String(payload.nama_petugas || 'Sari Utami').trim();
  const modalAwal = parseLocalizedNumber(payload.modal_awal || 0);
  if (!nama || !Number.isFinite(modalAwal) || modalAwal < 0) throw new Error('Nama petugas dan modal awal harus valid');

  const existing = await supabaseRequest(`petugas?nama=eq.${encodeURIComponent(nama)}&select=id&limit=1`);
  let petugas = existing?.[0];
  if (!petugas) {
    const created = await supabaseRequest('petugas', { method: 'POST', body: JSON.stringify({ nama, peran: 'operator' }) });
    petugas = created?.[0];
  }
  const shifts = await supabaseRequest('shift?status=eq.aktif&select=id&limit=1');
  if (shifts?.length) throw new Error('Masih ada shift aktif. Tutup shift tersebut sebelum membuka shift baru.');
  const createdShift = await supabaseRequest('shift', { method: 'POST', body: JSON.stringify({ petugas_id: petugas.id, modal_awal: modalAwal, status: 'aktif' }) });
  return createdShift?.[0] || createdShift;
}

async function handle(request, response) {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true, configured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) });
    if (request.method === 'GET' && url.pathname === '/api/dashboard') return sendJson(response, 200, await dashboardData());
    if (request.method === 'GET' && url.pathname === '/api/shifts') return sendJson(response, 200, await supabaseRequest(`shift?select=*,petugas(nama)&order=mulai_pada.desc&limit=${limitFrom(url)}`));
    if (request.method === 'GET' && url.pathname === '/api/sales') return sendJson(response, 200, await supabaseRequest(`penjualan_bbm?select=*,shift(petugas(nama))&order=terjadi_pada.desc&limit=${limitFrom(url)}`));
    if (request.method === 'GET' && url.pathname === '/api/cash-transactions') return sendJson(response, 200, await supabaseRequest(`transaksi_kas?select=*,shift(petugas(nama))&order=terjadi_pada.desc&limit=${limitFrom(url)}`));

    if (request.method === 'POST' && url.pathname === '/api/shifts/open') {
      const payload = await parseBody(request);
      return sendJson(response, 201, await openShift(payload));
    }

    if (request.method === 'POST' && url.pathname === '/api/sales') {
      const payload = await parseBody(request);
      const { volume, price } = validateSale(payload);
      const sale = await supabaseRequest('penjualan_bbm', { method: 'POST', body: JSON.stringify({
        shift_id: payload.shift_id,
        jenis_bbm: payload.jenis_bbm,
        volume_liter: volume,
        harga_per_liter: price,
        metode_pembayaran: payload.metode_pembayaran
      }) });
      return sendJson(response, 201, sale?.[0] || sale);
    }

    if (request.method === 'POST' && url.pathname === '/api/cash-transactions') {
      const payload = await parseBody(request);
      const nominal = validateCash(payload);
      const transaction = await supabaseRequest('transaksi_kas', { method: 'POST', body: JSON.stringify({
        shift_id: payload.shift_id,
        jenis: payload.jenis,
        kategori: payload.kategori,
        nominal,
        catatan: payload.catatan || null
      }) });
      return sendJson(response, 201, transaction?.[0] || transaction);
    }

    return sendJson(response, 404, { message: 'Endpoint tidak ditemukan' });
  } catch (error) {
    console.error(error);
    return sendJson(response, error.status || 500, { message: error.message || 'Terjadi kesalahan server' });
  }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`API Sistem Kas Pom Bensin berjalan di http://localhost:${PORT}`);
});
