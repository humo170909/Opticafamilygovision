/* dashboard-vendedor.js — Panel principal para rol vendedor */
import { supabase }                          from '../../config/supabase.js';
import { checkAuth }                         from '../../core/auth.js';
import { initUI, getCurrentUser }            from '../../core/ui.js';
import { formatCurrency, formatDateLong, timeAgo } from '../../utils/formatters.js';
import { esc }                               from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const usuario = await checkAuth(['vendedor']);
  await initUI(usuario);

  const hoy   = new Date().toISOString().split('T')[0];
  const larga = formatDateLong(hoy);
  const el    = (id) => document.getElementById(id);

  if (el('header-date')) el('header-date').textContent = 'Resumen del ' + larga;

  await Promise.all([
    cargarKPIs(usuario, hoy),
    cargarCitasHoy(hoy),
    cargarMisVentas(usuario),
    cargarAlertasStock(),
  ]);
});

// ─── KPIs ─────────────────────────────────────────────────────────────────────
async function cargarKPIs(usuario, hoy) {
  const el = (id) => document.getElementById(id);

  // Ventas de hoy del vendedor actual
  const query = supabase
    .from('ventas')
    .select('total')
    .gte('created_at', hoy + 'T00:00:00')
    .lte('created_at', hoy + 'T23:59:59')
    .neq('estado', 'cancelada');

  if (usuario?.id) query.eq('usuario_id', usuario.id);

  const { data: vh } = await query;
  const ventas = vh || [];
  if (el('kpi-count-hoy'))  el('kpi-count-hoy').textContent  = ventas.length;
  if (el('kpi-total-hoy'))  el('kpi-total-hoy').textContent  = formatCurrency(ventas.reduce((s, v) => s + Number(v.total), 0));

  // Citas hoy
  const { count: citasHoy } = await supabase
    .from('citas')
    .select('*', { count: 'exact', head: true })
    .eq('fecha', hoy)
    .neq('estado', 'cancelada');
  if (el('kpi-citas-hoy')) el('kpi-citas-hoy').textContent = citasHoy || 0;
}

// ─── Citas de hoy ─────────────────────────────────────────────────────────────
async function cargarCitasHoy(hoy) {
  const contenedor = document.getElementById('citas-hoy');
  if (!contenedor) return;

  const { data: citas, error } = await supabase
    .from('citas')
    .select('id, hora, tipo, estado, pacientes(nombres, apellidos)')
    .eq('fecha', hoy)
    .neq('estado', 'cancelada')
    .order('hora');

  if (error || !citas?.length) {
    contenedor.innerHTML = '<p style="text-align:center;color:var(--c-ink-muted);font-size:.82rem;padding:20px 0;">Sin citas agendadas para hoy.</p>';
    return;
  }

  const estadoBadge = { confirmada:'bs', pendiente:'bw', cancelada:'bd', completada:'bn', 'en camino':'bi' };
  contenedor.innerHTML = citas.slice(0, 6).map(c => {
    const nombre = c.pacientes ? `${esc(c.pacientes.nombres)} ${esc(c.pacientes.apellidos)}` : '—';
    const badge  = estadoBadge[c.estado] || 'bn';
    return `
      <div class="apt-item">
        <span class="apt-time">${esc(c.hora?.slice(0,5) || '')}</span>
        <div class="apt-info">
          <div class="apt-name">${nombre}</div>
          <div class="apt-reason">${esc(c.tipo || '')}</div>
        </div>
        <span class="badge ${badge}">${esc(c.estado || '')}</span>
      </div>`;
  }).join('');
}

// ─── Mis últimas ventas ────────────────────────────────────────────────────────
async function cargarMisVentas(usuario) {
  const tbody = document.getElementById('tabla-mis-ventas');
  if (!tbody) return;

  const query = supabase
    .from('ventas')
    .select('total, metodo_pago, created_at, pacientes(nombres, apellidos)')
    .neq('estado', 'anulada')
    .order('created_at', { ascending: false })
    .limit(6);

  if (usuario?.id) query.eq('usuario_id', usuario.id);

  const { data: ventas, error } = await query;

  if (error || !ventas?.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--c-ink-muted);font-size:.82rem;">Sin ventas registradas.</td></tr>';
    return;
  }

  const metodoBadge = { efectivo:'bs', yape:'bi', plin:'bi', tarjeta:'bn', transferencia:'bw' };
  tbody.innerHTML = ventas.map(v => {
    const nombre = v.pacientes ? `${esc(v.pacientes.apellidos)}, ${esc(v.pacientes.nombres?.split(' ')[0])}` : '—';
    const badge  = metodoBadge[v.metodo_pago?.toLowerCase()] || 'bn';
    return `
      <tr>
        <td>
          <div>${nombre}</div>
          <div class="td-sub">${timeAgo(v.created_at)}</div>
        </td>
        <td><span class="badge ${badge}">${esc(v.metodo_pago || '—')}</span></td>
        <td class="td-money">${formatCurrency(v.total)}</td>
      </tr>`;
  }).join('');
}

// ─── Alertas de stock ─────────────────────────────────────────────────────────
async function cargarAlertasStock() {
  const contenedor = document.getElementById('alertas-stock');
  if (!contenedor) return;

  const { data: prods, error } = await supabase
    .from('productos')
    .select('nombre, stock_actual, stock_minimo')
    .eq('activo', true)
    .order('stock_actual');

  const alertas = (prods || []).filter(p => p.stock_actual <= p.stock_minimo).slice(0, 5);

  if (error || !alertas.length) {
    contenedor.innerHTML = '<p style="text-align:center;color:var(--c-success);font-size:.82rem;padding:20px 0;">✓ Todos los productos tienen stock suficiente.</p>';
    return;
  }

  contenedor.innerHTML = alertas.map(p => `
    <div class="stock-item">
      <div class="stock-ico">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
        </svg>
      </div>
      <div class="stock-info">
        <div class="stock-name">${esc(p.nombre)}</div>
        <div class="stock-detail">Mín: ${p.stock_minimo} · Actual: <strong>${p.stock_actual}</strong></div>
      </div>
      <span class="stock-qty">${p.stock_actual}</span>
    </div>`).join('');
}
