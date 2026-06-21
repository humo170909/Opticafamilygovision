/* reportes.js — Reportes de ventas con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast }      from '../../utils/alerts.js';
import { formatCurrency } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);

  async function cargarReportes() {
    const dias    = parseInt(el('filtro-periodo')?.value || '30');
    const desde   = new Date();
    desde.setDate(desde.getDate() - dias);
    const desdeStr = desde.toISOString();

    const baseSelect = 'id, total, created_at, metodo_pago, detalle_ventas(cantidad, precio_unitario, producto_id, productos(nombre))';

    let { data: ventas, error } = await supabase
      .from('ventas')
      .select(baseSelect + ', venta_pagos(metodo, monto)')
      .eq('estado', 'completada')
      .gte('created_at', desdeStr)
      .order('created_at');

    // Fallback: tabla venta_pagos aún no existe (migración pendiente)
    if (error) {
      ({ data: ventas, error } = await supabase
        .from('ventas')
        .select(baseSelect)
        .eq('estado', 'completada')
        .gte('created_at', desdeStr)
        .order('created_at'));
    }

    if (error) { showToast('Error al cargar reportes.', 'error'); return; }

    const data = ventas || [];

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalSoles    = data.reduce((s, v) => s + (v.total || 0), 0);
    const countVentas   = data.length;
    const ticketProm    = countVentas ? totalSoles / countVentas : 0;
    const totalProductos = data.reduce((s, v) => s + (v.detalle_ventas || []).reduce((a, d) => a + d.cantidad, 0), 0);

    if (el('kpi-total'))     el('kpi-total').textContent     = formatCurrency(totalSoles);
    if (el('kpi-count'))     el('kpi-count').textContent     = countVentas;
    if (el('kpi-ticket'))    el('kpi-ticket').textContent    = formatCurrency(ticketProm);
    if (el('kpi-productos')) el('kpi-productos').textContent = totalProductos;

    // ── Gráfico por día ───────────────────────────────────────────────────────
    const porDia = {};
    data.forEach(v => {
      const dia = v.created_at?.split('T')[0] || '';
      porDia[dia] = (porDia[dia] || 0) + (v.total || 0);
    });

    const diasOrdenados = Object.keys(porDia).sort();
    const maxVal        = Math.max(...Object.values(porDia), 1);

    const barVentas = el('bar-ventas');
    if (barVentas) {
      barVentas.innerHTML = diasOrdenados.slice(-Math.min(diasOrdenados.length, 30)).map(dia => {
        const val = porDia[dia];
        const pct = Math.round((val / maxVal) * 100);
        const label = new Date(dia + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
        return `
          <div class="bar-col">
            <div class="bar-value">${formatCurrency(val).replace('S/ ', '')}</div>
            <div class="bar" style="height:${pct}%;background:var(--c-accent);"></div>
            <div class="bar-label">${esc(label)}</div>
          </div>`;
      }).join('') || '<p style="color:var(--c-ink-muted);font-size:.82rem;">Sin datos.</p>';
    }

    // ── Top 5 productos ───────────────────────────────────────────────────────
    const contadorProd = {};
    data.forEach(v => {
      (v.detalle_ventas || []).forEach(d => {
        const nombre = d.productos?.nombre || `Producto ${d.producto_id}`;
        contadorProd[nombre] = (contadorProd[nombre] || 0) + d.cantidad;
      });
    });
    const top5 = Object.entries(contadorProd).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxTop = top5[0]?.[1] || 1;

    const topEl = el('top-productos');
    if (topEl) {
      topEl.innerHTML = top5.length ? top5.map(([nombre, qty], i) => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px;">
            <span style="font-weight:600;">${i + 1}. ${esc(nombre)}</span>
            <span style="color:var(--c-ink-muted);">${qty} uds.</span>
          </div>
          <div style="height:6px;background:var(--c-border);border-radius:3px;overflow:hidden;">
            <div style="width:${Math.round((qty / maxTop) * 100)}%;height:100%;background:var(--c-accent);border-radius:3px;"></div>
          </div>
        </div>`).join('')
        : '<p style="color:var(--c-ink-muted);font-size:.82rem;">Sin datos.</p>';
    }

    // ── Ventas por método de pago ──────────────────────────────────────────────
    // Usar venta_pagos para reflejar correctamente pagos divididos.
    const porPago = {};
    data.forEach(v => {
      const pagos = v.venta_pagos || [];
      if (pagos.length > 0) {
        pagos.forEach(p => { porPago[p.metodo] = (porPago[p.metodo] || 0) + Number(p.monto); });
      } else {
        const m = v.metodo_pago || 'efectivo';
        porPago[m] = (porPago[m] || 0) + Number(v.total);
      }
    });
    const totalPago    = Object.values(porPago).reduce((a, b) => a + b, 0) || 1;
    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yape: 'Yape', plin: 'Plin' };
    const colores      = { efectivo: '#4a90d9', tarjeta: '#2e9e6b', transferencia: '#d97a0f', yape: '#8b5cf6', plin: '#10b981' };

    const pagoEl = el('ventas-por-pago');
    if (pagoEl) {
      pagoEl.innerHTML = Object.entries(porPago).sort((a, b) => b[1] - a[1]).map(([m, v]) => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px;">
            <span style="font-weight:600;">${esc(metodosLabel[m] || m)}</span>
            <span style="color:var(--c-ink-muted);">${Math.round((v / totalPago) * 100)}% · ${formatCurrency(v)}</span>
          </div>
          <div style="height:6px;background:var(--c-border);border-radius:3px;overflow:hidden;">
            <div style="width:${Math.round((v / totalPago) * 100)}%;height:100%;background:${colores[m] || '#4a90d9'};border-radius:3px;"></div>
          </div>
        </div>`).join('') || '<p style="color:var(--c-ink-muted);font-size:.82rem;">Sin datos.</p>';
    }
  }

  // Al cambiar período: recargar ventas Y análisis de costos
  el('filtro-periodo')?.addEventListener('change', () => {
    const dias = parseInt(el('filtro-periodo')?.value || '30');
    cargarReportes();
    cargarCostosRentabilidad(dias);
  });

  // Carga inicial en paralelo
  const diasInicial = parseInt(el('filtro-periodo')?.value || '30');
  await Promise.all([
    cargarReportes(),
    cargarCostosRentabilidad(diasInicial),
  ]);
});

// ─── Análisis de costos y rentabilidad (función independiente) ─────────────────
// Consulta separada del query principal para no interferir con el resto
// de la lógica existente de reportes.
async function cargarCostosRentabilidad(dias) {
  const el = (id) => document.getElementById(id);

  const desde   = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeStr   = desde.toISOString();
  const desdeFecha = desdeStr.split('T')[0];
  const hastaFecha = new Date().toISOString().split('T')[0];

  // Ventas del período
  const { data: ventas } = await supabase
    .from('ventas')
    .select('id, total')
    .eq('estado', 'completada')
    .gte('created_at', desdeStr);

  const totalVentas = (ventas || []).reduce((s, v) => s + Number(v.total), 0);

  // COGS: costo_unitario × cantidad por cada línea de venta.
  // Si la columna no existe aún (migración pendiente), queda en 0 sin romper nada.
  let cogsPeriodo = 0;
  const ids = (ventas || []).map(v => v.id);
  if (ids.length) {
    const { data: detalles, error: errCosto } = await supabase
      .from('detalle_ventas')
      .select('costo_unitario, cantidad')
      .in('venta_id', ids);
    if (!errCosto && detalles) {
      cogsPeriodo = detalles.reduce((s, d) => s + (Number(d.costo_unitario) || 0) * (d.cantidad || 0), 0);
    }
  }

  // Gastos operativos del período (filtro por fecha DATE de la tabla gastos)
  const { data: gastosOp } = await supabase
    .from('gastos')
    .select('monto')
    .gte('fecha', desdeFecha)
    .lte('fecha', hastaFecha);
  const totalGastosOp = (gastosOp || []).reduce((s, g) => s + Number(g.monto), 0);

  const totalEgresos = cogsPeriodo + totalGastosOp;
  const gananciaReal = totalVentas - totalEgresos;

  if (el('rep-cogs'))         el('rep-cogs').textContent         = formatCurrency(cogsPeriodo);
  if (el('rep-gastos-op'))    el('rep-gastos-op').textContent    = formatCurrency(totalGastosOp);
  if (el('rep-total-costos')) el('rep-total-costos').textContent = formatCurrency(totalEgresos);
  if (el('rep-ganancia-real')) {
    el('rep-ganancia-real').textContent = formatCurrency(gananciaReal);
    el('rep-ganancia-real').style.color = gananciaReal >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
  }

  // Composición de egresos: barras proporcionales
  const compEl = el('rep-composicion-costos');
  if (compEl && totalEgresos > 0) {
    const pctCogs   = Math.round((cogsPeriodo / totalEgresos) * 100);
    const pctGastos = 100 - pctCogs;
    const barCogs   = el('rep-bar-cogs');
    const barGastos = el('rep-bar-gastos');
    if (barCogs)                 barCogs.style.width              = pctCogs + '%';
    if (barGastos)               barGastos.style.flex             = '1';
    if (el('rep-pct-cogs'))      el('rep-pct-cogs').textContent   = pctCogs;
    if (el('rep-pct-gastos'))    el('rep-pct-gastos').textContent = pctGastos;
    compEl.style.display = 'block';
  } else if (compEl) {
    compEl.style.display = 'none';
  }
}
