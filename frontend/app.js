const API_BASE = window.KASFLOW_API_BASE || 'http://localhost:3000/api';

const demoShift = { id: 'demo-shift', status: 'aktif', modal_awal: 1500000, mulai_pada: new Date().toISOString(), petugas: { nama: 'Sari Utami' } };
const demoSales = [
  { id: '1', terjadi_pada: new Date(Date.now() - 12 * 60000).toISOString(), jenis_bbm: 'Pertamax', volume_liter: 32, total: 448000, metode_pembayaran: 'QRIS' },
  { id: '2', terjadi_pada: new Date(Date.now() - 37 * 60000).toISOString(), jenis_bbm: 'Pertalite', volume_liter: 20, total: 200000, metode_pembayaran: 'Tunai' },
  { id: '3', terjadi_pada: new Date(Date.now() - 71 * 60000).toISOString(), jenis_bbm: 'Solar', volume_liter: 45, total: 337500, metode_pembayaran: 'Kartu Debit' }
];
const demoCash = [{ id: 'c1', terjadi_pada: new Date(Date.now() - 25 * 60000).toISOString(), jenis: 'keluar', kategori: 'Pembelian ATK', nominal: 75000 }];
let state = { shifts: [demoShift], sales: demoSales, cash: demoCash, demo: false };

const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const parseLocalizedNumber = (value) => {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return NaN;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma !== -1 && dot !== -1) return comma > dot ? Number(text.replace(/\./g, '').replace(',', '.')) : Number(text.replace(/,/g, ''));
  if (comma !== -1) return Number(text.replace(',', '.'));
  if ((text.match(/\./g) || []).length > 1 || (dot !== -1 && text.length - dot - 1 === 3)) return Number(text.replace(/\./g, ''));
  return Number(text);
};
const dateTime = (value) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request gagal');
  return data;
}

function activeShift() { return state.shifts.find((shift) => shift.status === 'aktif') || state.shifts[0]; }
function refreshShiftOptions() {
  const options = state.shifts.filter((shift) => shift.status === 'aktif').map((shift) => `<option value="${shift.id}">${escapeHtml(shift.petugas?.nama || 'Petugas')} - ${dateTime(shift.mulai_pada)}</option>`).join('');
  document.querySelectorAll('#saleShift, #cashShift').forEach((select) => { select.innerHTML = options || '<option value="">Belum ada shift aktif</option>'; });
}
function render() {
  const shift = activeShift();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySales = state.sales.filter((sale) => new Date(sale.terjadi_pada) >= todayStart);
  const salesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cashIn = state.cash.filter((item) => item.jenis === 'masuk').reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const cashOut = state.cash.filter((item) => item.jenis === 'keluar').reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const cashSalesTotal = todaySales.filter((sale) => sale.metode_pembayaran === 'Tunai').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  document.querySelector('#salesToday').textContent = money(salesTotal);
  document.querySelector('#cashBalance').textContent = money(Number(shift?.modal_awal || 0) + cashSalesTotal + cashIn - cashOut);
  document.querySelector('#transactionCount').textContent = todaySales.length;
  document.querySelector('#salesTrend').textContent = todaySales.length ? `${todaySales.length} transaksi masuk hari ini` : 'Belum ada transaksi';
  document.querySelector('#shiftName').textContent = shift ? `${shift.petugas?.nama || 'Petugas'} / Shift aktif` : 'Belum ada shift aktif';
  document.querySelector('#shiftMeta').textContent = shift ? `Dimulai ${dateTime(shift.mulai_pada)} - modal awal ${money(shift.modal_awal)}` : 'Buka shift untuk mulai mencatat transaksi.';
  document.querySelector('#shiftStatus').textContent = shift ? 'Berjalan' : 'Belum aktif';
  document.querySelector('#openShiftButton').hidden = Boolean(shift);
  document.querySelector('#salesTable').innerHTML = state.sales.length ? state.sales.slice(0, 8).map((sale) => `<tr><td>${dateTime(sale.terjadi_pada)}</td><td><strong>${escapeHtml(sale.jenis_bbm)}</strong></td><td>${Number(sale.volume_liter).toLocaleString('id-ID')} L</td><td>${escapeHtml(sale.metode_pembayaran)}</td><td class="align-right"><strong>${money(sale.total)}</strong></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">Belum ada penjualan.</td></tr>';
  const activities = [...state.sales.map((sale) => ({ ...sale, label: `Penjualan ${sale.jenis_bbm}`, detail: money(sale.total), green: true })), ...state.cash.map((item) => ({ ...item, label: `${item.jenis === 'masuk' ? 'Kas masuk' : 'Kas keluar'} - ${item.kategori}`, detail: money(item.nominal) }))].sort((a, b) => new Date(b.terjadi_pada) - new Date(a.terjadi_pada)).slice(0, 5);
  document.querySelector('#activityList').innerHTML = activities.length ? activities.map((item) => `<div class="activity-item"><span class="activity-marker ${item.green ? 'green' : ''}"></span><div class="activity-copy"><strong>${escapeHtml(item.label)}</strong><span>${dateTime(item.terjadi_pada)} &middot; ${item.detail}</span></div></div>`).join('') : '<div class="empty-state">Belum ada aktivitas.</div>';
  refreshShiftOptions();
}
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
function setConnection(isOnline) { const status = document.querySelector('#connectionStatus'); status.classList.toggle('online', isOnline); status.innerHTML = `<i></i>${isOnline ? 'Supabase tersambung' : 'Mode demo lokal'}`; document.querySelector('#apiNote').textContent = isOnline ? 'Terhubung ke Supabase melalui API' : 'Frontend siap, API belum dikonfigurasi'; }

async function loadDashboard() {
  try {
    const data = await request('/dashboard');
    state = { ...state, ...data, demo: false };
    setConnection(true);
  } catch (error) {
    state.demo = true;
    setConnection(false);
  }
  render();
}
async function submitForm(event, endpoint, form) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  try {
    const result = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    showToast('Data berhasil disimpan.');
    form.reset();
    await loadDashboard();
    return result;
  } catch (error) {
    if (!state.demo) { showToast(error.message); return; }
    const item = { ...payload, id: `demo-${Date.now()}`, terjadi_pada: new Date().toISOString(), total: endpoint === '/sales' ? parseLocalizedNumber(payload.volume_liter) * parseLocalizedNumber(payload.harga_per_liter) : undefined, nominal: endpoint === '/cash-transactions' ? parseLocalizedNumber(payload.nominal) : undefined };
    if (endpoint === '/sales') state.sales.unshift(item); else state.cash.unshift(item);
    form.reset(); render(); showToast('Disimpan di mode demo browser.');
  }
}

async function openShift() {
  const namaPetugas = window.prompt('Nama petugas', 'Sari Utami');
  if (!namaPetugas) return;
  const modalAwal = window.prompt('Modal awal kas (boleh 1.500.000 atau 1500000)', '1500000');
  if (modalAwal === null) return;
  try {
    await request('/shifts/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama_petugas: namaPetugas, modal_awal: modalAwal }) });
    showToast('Shift berhasil dibuka.');
    await loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector('#saleFormElement').addEventListener('submit', (event) => submitForm(event, '/sales', event.currentTarget));
document.querySelector('#cashFormElement').addEventListener('submit', (event) => submitForm(event, '/cash-transactions', event.currentTarget));
document.querySelector('#openShiftButton').addEventListener('click', openShift);
document.querySelectorAll('[data-scroll-to]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth' })));
loadDashboard();
