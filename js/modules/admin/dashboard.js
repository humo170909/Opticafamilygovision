/* dashboard.js — Panel principal con datos reales de Supabase */
import { supabase, TABLAS }   from '../../config/supabase.js';
import { checkAuth }          from '../../core/auth.js';
import { initUI }             from '../../core/ui.js';
import { formatCurrency, formatDate, formatDateLong, formatInitials, timeAgo } from '../../utils/formatters.js';
import { esc }                from '../../utils/validators.js';
import { fechaLima, inicioSemanaLima } from '../../utils/tiempo.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  // Fecha en header
  const hoy   = new Date();
  const larga = formatDateLong(hoy.toISOString().split('T')[0]);
  const el = (id) => document.getElementById(id);
  if (el('header-date')) el('header-date').textContent = 'Resumen del ' + larga;

  // Animación barras (se reemplazarán con datos reales si existen)
  document.querySelectorAll('.bar-fill[data-pct]').forEach(b => {
    setTimeout(() => b.style.width = b.dataset.pct + '%', 80);
  });

  // Cargar datos en paralelo
  await Promise.all([
    cargarKPIs(),
    cargarCitasHoy(),
    cargarAlertasStock(),
    cargarUltimasVentas(),
    cargarTopProductos(),
    cargarGraficoSemanal(),
    cargarCajaDelDia(),
  ]);
});

// ─── KPIs ─────────────────────────────────────────────────────────────────────
async function cargarKPIs() {
  const el           = (id) => document.getElementById(id);
  const hoy          = fechaLima();
  const inicioSemana = inicioSemanaLima();

  // Ventas hoy
  const { data: vh } = await supabase
    .from(TABLAS.VENTAS)
    .select('total')
    .gte('created_at', hoy + 'T00:00:00-05:00')
    .lte('created_at', hoy + 'T23:59:59-05:00')
    .neq('estado', 'cancelada');
  const totalHoy = (vh || []).reduce((s, v) => s + Number(v.total), 0);
  if (el('kpi-ventas-hoy')) el('kpi-ventas-hoy').textContent = formatCurrency(totalHoy);

  // Gastos hoy
  const { data: gh } = await supabase
    .from(TABLAS.GASTOS)
    .select('monto')
    .eq('fecha', hoy);
  const totalGastosHoy = (gh || []).reduce((s, g) => s + Number(g.monto), 0);
  if (el('kpi-gastos-hoy')) el('kpi-gastos-hoy').textContent = formatCurrency(totalGastosHoy);

  // Ingresos netos
  const neto = totalHoy - totalGastosHoy;
  if (el('kpi-neto-hoy')) {
    el('kpi-neto-hoy').textContent = formatCurrency(neto);
    el('kpi-neto-hoy').style.color = neto >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
  }

  // Ventas semana
  const { data: vs } = await supabase
    .from(TABLAS.VENTAS)
    .select('total')
    .gte('created_at', inicioSemana + 'T00:00:00-05:00')
    .neq('estado', 'cancelada');
  const totalSem = (vs || []).reduce((s, v) => s + Number(v.total), 0);
  if (el('kpi-ventas-semana')) el('kpi-ventas-semana').textContent = formatCurrency(totalSem);

  // Stock bajo: productos activos donde stock_actual <= stock_minimo
  const { data: prods } = await supabase
    .from(TABLAS.PRODUCTOS)
    .select('stock_actual, stock_minimo')
    .eq('activo', true);
  const alertas = (prods || []).filter(p => p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo).length;
  if (el('kpi-alertas-stock')) el('kpi-alertas-stock').textContent = alertas;
  if (el('badge-stock'))       el('badge-stock').textContent       = alertas || '';
}

// ─── Citas de hoy ─────────────────────────────────────────────────────────────
async function cargarCitasHoy() {
  const contenedor = document.getElementById('citas-hoy');
  if (!contenedor) return;

  const hoy = fechaLima();
  const { data: citas, error } = await supabase
    .from('citas')
    .select('id, hora, tipo, estado, pacientes(nombres, apellidos)')
    .eq('fecha', hoy)
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
    contenedor.innerHTML = '<p style="text-align:center;color:#2e9e6b;font-size:.82rem;padding:20px 0;">✓ Todos los productos tienen stock suficiente.</p>';
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

// ─── Últimas ventas ────────────────────────────────────────────────────────────
async function cargarUltimasVentas() {
  const tbody = document.getElementById('tabla-ventas-recientes');
  if (!tbody) return;

  const { data: ventas, error } = await supabase
    .from('ventas')
    .select('total, metodo_pago, created_at, pacientes(nombres, apellidos)')
    .neq('estado', 'anulada')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !ventas?.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--c-ink-muted);font-size:.82rem;">Sin ventas recientes.</td></tr>';
    return;
  }

  tbody.innerHTML = ventas.map(v => {
    const nombre = v.pacientes ? `${esc(v.pacientes.apellidos)}, ${esc(v.pacientes.nombres?.split(' ')[0])}` : '—';
    const badge  = { efectivo:'bs', yape:'bi', tarjeta:'bn', transferencia:'bw' }[v.metodo_pago?.toLowerCase()] || 'bn';
    return `
      <tr>
        <td style="padding-left:18px;">
          <div class="td-main">${nombre}</div>
          <div class="td-time">${timeAgo(v.created_at)}</div>
        </td>
        <td><span class="badge ${badge}">${esc(v.metodo_pago || '—')}</span></td>
        <td class="td-money" style="text-align:right;padding-right:18px;">${formatCurrency(v.total)}</td>
      </tr>`;
  }).join('');
}

// ─── Top productos ─────────────────────────────────────────────────────────────
async function cargarTopProductos() {
  const contenedor = document.getElementById('top-productos');
  if (!contenedor) return;

  const desde = new Date();
  desde.setDate(1);
  const { data, error } = await supabase
    .from('detalle_ventas')
    .select('producto_id, cantidad, productos(nombre, categorias(nombre))')
    .gte('created_at', desde.toISOString());

  if (error || !data?.length) return;

  // Agrupar por producto
  const map = {};
  data.forEach(d => {
    const key = d.producto_id;
    if (!map[key]) map[key] = { nombre: d.productos?.nombre || '—', cat: d.productos?.categorias?.nombre || '—', total: 0 };
    map[key].total += d.cantidad;
  });

  const top = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  if (!top.length) return;

  const max    = top[0].total;
  const ranks  = ['g', 's', 'b', '', ''];
  contenedor.innerHTML = top.map((p, i) => `
    <div class="top-item">
      <span class="rank ${ranks[i]}">${i + 1}</span>
      <div class="top-info">
        <div class="top-name">${esc(p.nombre)}</div>
        <div class="top-cat">${esc(p.cat)}</div>
      </div>
      <div class="top-bar"><div class="top-fill" style="width:${Math.round((p.total / max) * 100)}%"></div></div>
      <span class="top-cnt">${p.total}</span>
    </div>`).join('');
}

// ─── Caja del día (resumen ventas − gastos) ───────────────────────────────────
async function cargarCajaDelDia() {
  const el  = (id) => document.getElementById(id);
  const hoy = fechaLima();

  const [{ data: ventas }, { data: gastos }] = await Promise.all([
    supabase.from(TABLAS.VENTAS).select('total')
      .gte('created_at', hoy + 'T00:00:00')
      .lte('created_at', hoy + 'T23:59:59')
      .neq('estado', 'cancelada'),
    supabase.from(TABLAS.GASTOS).select('monto').eq('fecha', hoy),
  ]);

  const tv = (ventas  || []).reduce((s, v) => s + Number(v.total), 0);
  const tg = (gastos  || []).reduce((s, g) => s + Number(g.monto), 0);
  const td = tv - tg;

  if (el('caja-ventas-hoy'))     el('caja-ventas-hoy').textContent     = formatCurrency(tv);
  if (el('caja-gastos-hoy'))     el('caja-gastos-hoy').textContent     = formatCurrency(tg);
  if (el('caja-disponible-hoy')) {
    el('caja-disponible-hoy').textContent = formatCurrency(td);
    el('caja-disponible-hoy').style.color = td >= 0 ? 'var(--c-ink)' : 'var(--c-danger)';
  }
}

// ─── Gráfico semanal (últimos 7 días) ─────────────────────────────────────────
async function cargarGraficoSemanal() {
  const barList = document.getElementById('bar-ventas');
  if (!barList) return;

  const dias   = [];
  const labels = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const hoyLima = fechaLima();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoyLima + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    const fecha = d.toISOString().split('T')[0];
    dias.push({ fecha, label: i === 0 ? 'Hoy' : labels[d.getUTCDay()] });
  }

  const { data: ventas } = await supabase
    .from('ventas')
    .select('created_at, total')
    .gte('created_at', dias[0].fecha + 'T00:00:00')
    .neq('estado', 'cancelada');

  const porDia = {};
  dias.forEach(d => { porDia[d.fecha] = 0; });
  (ventas || []).forEach(v => {
    const fecha = v.created_at?.split('T')[0];
    if (porDia[fecha] !== undefined) porDia[fecha] += Number(v.total);
  });

  const max = Math.max(...Object.values(porDia), 1);

  barList.innerHTML = dias.map(d => {
    const total = porDia[d.fecha];
    const pct   = Math.round((total / max) * 100);
    return `
      <div class="bar-item">
        <span class="bar-label">${d.label}</span>
        <div class="bar-track"><div class="bar-fill" data-pct="${pct}" style="width:0%"></div></div>
        <span class="bar-val">${formatCurrency(total)}</span>
      </div>`;
  }).join('');

  setTimeout(() => {
    barList.querySelectorAll('.bar-fill[data-pct]').forEach(b => {
      b.style.width = b.dataset.pct + '%';
    });
  }, 80);
}

