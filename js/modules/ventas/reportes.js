/* reportes.js — Reportes de ventas con Supabase
 *
 * Funcionalidades:
 *   - KPIs del período (ventas, ticket, productos)
 *   - Análisis de costos y rentabilidad (COGS + gastos operativos)
 *   - Tabla detalle por día con filtro de fechas personalizable
 *   - Gráfico Ventas vs Egresos vs Ganancia por día
 *   - Top 5 productos y ventas por método de pago
 *   - Exportación Excel (SheetJS) y PDF (window.print)
 */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast }      from '../../utils/alerts.js';
import { formatCurrency } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';
import { fechaLima, fechaLimaHaceN } from '../../utils/tiempo.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
// Almacena los datos diarios ya calculados para reutilizar en tabla y export.
let _datosDiarios = [];

// Helpers de formato
const fmtLima  = ts => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(ts));
const fmtMuest = f  => new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);

  // Inicializar el rango del filtro secundario con el período principal
  const diasIni = parseInt(el('filtro-periodo')?.value || '30');
  if (el('filtro-diario-desde')) el('filtro-diario-desde').value = fechaLimaHaceN(diasIni);
  if (el('filtro-diario-hasta')) el('filtro-diario-hasta').value = fechaLima();

  // Listeners
  el('filtro-periodo')?.addEventListener('change', cargarTodo);

  // El filtro secundario solo re-renderiza la tabla sin re-consultar la BD
  el('filtro-diario-desde')?.addEventListener('change', renderTablaDiaria);
  el('filtro-diario-hasta')?.addEventListener('change', renderTablaDiaria);

  el('btn-export-excel')?.addEventListener('click', exportarExcel);
  el('btn-export-pdf')?.addEventListener('click',   exportarPDF);

  // Carga inicial
  await cargarTodo();
});

// ─── FUNCIÓN MAESTRA: carga y renderiza todo ──────────────────────────────────
async function cargarTodo() {
  const el       = (id) => document.getElementById(id);
  const dias     = parseInt(el('filtro-periodo')?.value || '30');
  const desdeFecha = fechaLimaHaceN(dias);
  const hastaFecha = fechaLima();
  const desdeStr   = desdeFecha + 'T00:00:00-05:00';

  // Sincronizar filtro secundario con el período principal
  if (el('filtro-diario-desde')) el('filtro-diario-desde').value = desdeFecha;
  if (el('filtro-diario-hasta')) el('filtro-diario-hasta').value = hastaFecha;

  // ── 1. Ventas del período ──────────────────────────────────────────────────
  const baseSelect = 'id, total, created_at, metodo_pago, detalle_ventas(cantidad, producto_id, productos(nombre))';

  let { data: ventas, error: errV } = await supabase
    .from('ventas')
    .select(baseSelect + ', venta_pagos(metodo, monto)')
    .eq('estado', 'completada')
    .gte('created_at', desdeStr)
    .order('created_at');

  // Fallback: tabla venta_pagos pendiente de migración
  if (errV) {
    ({ data: ventas, error: errV } = await supabase
      .from('ventas')
      .select(baseSelect)
      .eq('estado', 'completada')
      .gte('created_at', desdeStr)
      .order('created_at'));
  }

  if (errV) { showToast('Error al cargar reportes.', 'error'); return; }
  const data     = ventas || [];
  const ventaIds = data.map(v => v.id);

  // ── 2. COGS desde detalle_ventas.costo_unitario ────────────────────────────
  // cogsMap: venta_id → costo total de esa venta
  const cogsMap  = {};
  if (ventaIds.length) {
    let { data: detalles, error: errD } = await supabase
      .from('detalle_ventas')
      .select('venta_id, cantidad, costo_unitario')
      .in('venta_id', ventaIds);

    // Fallback: columna costo_unitario pendiente de migración
    if (errD) {
      ({ data: detalles } = await supabase
        .from('detalle_ventas')
        .select('venta_id, cantidad')
        .in('venta_id', ventaIds));
    }

    (detalles || []).forEach(d => {
      cogsMap[d.venta_id] = (cogsMap[d.venta_id] || 0) +
        (Number(d.costo_unitario) || 0) * (d.cantidad || 0);
    });
  }

  // ── 3. Gastos operativos del período (tabla gastos, campo DATE) ────────────
  const { data: gastosData } = await supabase
    .from('gastos')
    .select('fecha, monto')
    .gte('fecha', desdeFecha)
    .lte('fecha', hastaFecha);

  const gastosPorDia = {};
  (gastosData || []).reduce((_, g) => {
    gastosPorDia[g.fecha] = (gastosPorDia[g.fecha] || 0) + Number(g.monto);
  }, {});

  // ── 4. Agrupar por día Lima ────────────────────────────────────────────────
  const porDia = {};

  data.forEach(v => {
    const dia = v.created_at ? fmtLima(v.created_at) : null;
    if (!dia) return;
    if (!porDia[dia]) porDia[dia] = { ventas: 0, cogs: 0, numVentas: 0, numProductos: 0 };

    porDia[dia].ventas       += Number(v.total) || 0;
    porDia[dia].cogs         += cogsMap[v.id]   || 0;
    porDia[dia].numVentas    += 1;
    porDia[dia].numProductos += (v.detalle_ventas || [])
      .reduce((a, d) => a + (d.cantidad || 0), 0);
  });

  // Incorporar días con gastos pero sin ventas
  Object.keys(gastosPorDia).forEach(dia => {
    if (!porDia[dia]) porDia[dia] = { ventas: 0, cogs: 0, numVentas: 0, numProductos: 0 };
  });

  // Calcular gastos y ganancia neta
  Object.keys(porDia).forEach(dia => {
    const d   = porDia[dia];
    d.gastos  = gastosPorDia[dia] || 0;
    // Ganancia neta = Ventas − Costo de ventas − Gastos operativos
    d.ganancia = d.ventas - d.cogs - d.gastos;
  });

  // Array ordenado cronológicamente para renderizado y exportación
  _datosDiarios = Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, d]) => ({ fecha, ...d }));

  // ── 5. KPIs del período ────────────────────────────────────────────────────
  const totalSoles  = data.reduce((s, v) => s + (v.total || 0), 0);
  const countVentas = data.length;
  const ticketProm  = countVentas ? totalSoles / countVentas : 0;
  const totalProds  = data.reduce((s, v) =>
    s + (v.detalle_ventas || []).reduce((a, d) => a + d.cantidad, 0), 0);

  if (el('kpi-total'))     el('kpi-total').textContent     = formatCurrency(totalSoles);
  if (el('kpi-count'))     el('kpi-count').textContent     = countVentas;
  if (el('kpi-ticket'))    el('kpi-ticket').textContent    = formatCurrency(ticketProm);
  if (el('kpi-productos')) el('kpi-productos').textContent = totalProds;

  // ── 6. Bloque Análisis de costos y rentabilidad ────────────────────────────
  const totalCogs     = _datosDiarios.reduce((s, d) => s + d.cogs,    0);
  const totalGastos   = _datosDiarios.reduce((s, d) => s + d.gastos,  0);
  const totalEgresos  = totalCogs + totalGastos;
  const totalGanancia = totalSoles - totalEgresos;

  if (el('rep-cogs'))         el('rep-cogs').textContent         = formatCurrency(totalCogs);
  if (el('rep-gastos-op'))    el('rep-gastos-op').textContent    = formatCurrency(totalGastos);
  if (el('rep-total-costos')) el('rep-total-costos').textContent = formatCurrency(totalEgresos);
  if (el('rep-ganancia-real')) {
    el('rep-ganancia-real').textContent = formatCurrency(totalGanancia);
    el('rep-ganancia-real').style.color = totalGanancia >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
  }

  const compEl = el('rep-composicion-costos');
  if (compEl && totalEgresos > 0) {
    const pctCogs = Math.round((totalCogs / totalEgresos) * 100);
    if (el('rep-bar-cogs'))   el('rep-bar-cogs').style.width   = pctCogs + '%';
    if (el('rep-pct-cogs'))   el('rep-pct-cogs').textContent   = pctCogs;
    if (el('rep-pct-gastos')) el('rep-pct-gastos').textContent = 100 - pctCogs;
    compEl.style.display = 'block';
  } else if (compEl) {
    compEl.style.display = 'none';
  }

  // ── 7. Tabla detalle por día ───────────────────────────────────────────────
  renderTablaDiaria();

  // ── 8. Gráfico: Ventas vs Egresos vs Ganancia ─────────────────────────────
  renderChart();

  // ── 9. Top 5 productos ────────────────────────────────────────────────────
  const contadorProd = {};
  data.forEach(v => {
    (v.detalle_ventas || []).forEach(d => {
      const nombre = d.productos?.nombre || `Producto ${d.producto_id}`;
      contadorProd[nombre] = (contadorProd[nombre] || 0) + d.cantidad;
    });
  });
  const top5   = Object.entries(contadorProd).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxTop = top5[0]?.[1] || 1;
  const topEl  = el('top-productos');
  if (topEl) {
    topEl.innerHTML = top5.length
      ? top5.map(([nombre, qty], i) => `
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

  // ── 10. Ventas por método de pago ─────────────────────────────────────────
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
  const coloresPago  = { efectivo: '#4a90d9', tarjeta: '#2e9e6b', transferencia: '#d97a0f', yape: '#8b5cf6', plin: '#10b981' };

  const pagoEl = el('ventas-por-pago');
  if (pagoEl) {
    pagoEl.innerHTML = Object.entries(porPago).sort((a, b) => b[1] - a[1]).map(([m, v]) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px;">
          <span style="font-weight:600;">${esc(metodosLabel[m] || m)}</span>
          <span style="color:var(--c-ink-muted);">${Math.round((v / totalPago) * 100)}% · ${formatCurrency(v)}</span>
        </div>
        <div style="height:6px;background:var(--c-border);border-radius:3px;overflow:hidden;">
          <div style="width:${Math.round((v / totalPago) * 100)}%;height:100%;background:${coloresPago[m] || '#4a90d9'};border-radius:3px;"></div>
        </div>
      </div>`).join('') || '<p style="color:var(--c-ink-muted);font-size:.82rem;">Sin datos.</p>';
  }
}

// ─── Gráfico: barras agrupadas Ventas / Egresos / Ganancia ───────────────────
function renderChart() {
  const barEl = document.getElementById('bar-ventas');
  if (!barEl) return;

  if (!_datosDiarios.length) {
    barEl.innerHTML = '<p style="color:var(--c-ink-muted);font-size:.82rem;">Sin datos.</p>';
    return;
  }

  // Mostrar máximo los últimos 20 días para no saturar visualmente
  const datos = _datosDiarios.slice(-20);

  // El valor de referencia para escalar es el máximo de ventas
  const maxVal = Math.max(...datos.map(d => d.ventas), 1);
  // Altura del área de barras en px (bar-chart tiene 160px, 24 de padding-bottom para labels)
  const BAR_H = 130;

  barEl.innerHTML = datos.map(d => {
    const egresos = d.cogs + d.gastos;
    const pxV = Math.round((d.ventas / maxVal) * BAR_H);
    const pxE = Math.round((egresos  / maxVal) * BAR_H);
    const pxG = d.ganancia > 0 ? Math.round((d.ganancia / maxVal) * BAR_H) : 0;
    const label = new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    const tip = `${label}\nVentas: ${formatCurrency(d.ventas)}\nEgresos: ${formatCurrency(egresos)}\nGanancia: ${formatCurrency(d.ganancia)}`;

    return `
      <div class="bar-col" title="${esc(tip)}"
           style="align-items:stretch;min-width:24px;padding:0 2px;">
        <div style="display:flex;gap:2px;align-items:flex-end;flex:1;overflow:hidden;">
          <div style="flex:1;height:${pxV}px;background:var(--c-accent);border-radius:2px 2px 0 0;min-height:${pxV > 0 ? 2 : 0}px;"></div>
          <div style="flex:1;height:${pxE}px;background:var(--c-danger);border-radius:2px 2px 0 0;min-height:${pxE > 0 ? 2 : 0}px;"></div>
          <div style="flex:1;height:${pxG}px;background:var(--c-success);border-radius:2px 2px 0 0;min-height:${pxG > 0 ? 2 : 0}px;"></div>
        </div>
        <div class="bar-label">${esc(label)}</div>
      </div>`;
  }).join('');
}

// ─── Tabla: Detalle por día (filtra sobre _datosDiarios ya cargado) ──────────
function renderTablaDiaria() {
  const el   = (id) => document.getElementById(id);
  const tbody = el('tbody-diaria');
  const thead = el('thead-diaria');
  if (!tbody) return;

  // Filtro de fechas personalizado (independiente del período principal)
  const desde = el('filtro-diario-desde')?.value;
  const hasta  = el('filtro-diario-hasta')?.value;

  let datos = _datosDiarios;
  if (desde) datos = datos.filter(d => d.fecha >= desde);
  if (hasta) datos = datos.filter(d => d.fecha <= hasta);

  // Cabecera
  const TH = 'padding:10px 12px;font-size:.72rem;font-family:var(--font-display);font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--c-ink-muted);border-bottom:1px solid var(--c-border-soft);white-space:nowrap;';
  if (thead) thead.innerHTML = `
    <tr style="background:rgba(74,144,217,.05);">
      <th style="${TH}text-align:left;">Fecha</th>
      <th style="${TH}text-align:right;">Ventas</th>
      <th style="${TH}text-align:right;">Costo ventas</th>
      <th style="${TH}text-align:right;">Gastos op.</th>
      <th style="${TH}text-align:right;">Ganancia neta</th>
      <th style="${TH}text-align:right;">N° ventas</th>
    </tr>`;

  if (!datos.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.82rem;">Sin datos para el período seleccionado.</td></tr>';
    return;
  }

  // Totales
  const tot = datos.reduce((acc, d) => ({
    ventas  : acc.ventas   + d.ventas,
    cogs    : acc.cogs     + d.cogs,
    gastos  : acc.gastos   + d.gastos,
    ganancia: acc.ganancia + d.ganancia,
    numVentas: acc.numVentas + d.numVentas,
  }), { ventas: 0, cogs: 0, gastos: 0, ganancia: 0, numVentas: 0 });

  const RB = 'padding:9px 12px;font-size:.83rem;text-align:right;border-bottom:1px solid var(--c-border-soft);';
  const RL = RB.replace('text-align:right', 'text-align:left');

  // Más reciente primero
  const filas = [...datos].reverse().map(d => `
    <tr style="transition:background .15s;"
        onmouseover="this.style.background='var(--c-accent-bg)'"
        onmouseout="this.style.background=''">
      <td style="${RL}font-weight:600;">${esc(fmtMuest(d.fecha))}</td>
      <td style="${RB}color:var(--c-accent);font-weight:600;">${formatCurrency(d.ventas)}</td>
      <td style="${RB}color:var(--c-warning);">${formatCurrency(d.cogs)}</td>
      <td style="${RB}color:var(--c-danger);">${formatCurrency(d.gastos)}</td>
      <td style="${RB}color:${d.ganancia >= 0 ? 'var(--c-success)' : 'var(--c-danger)'};font-weight:700;">${formatCurrency(d.ganancia)}</td>
      <td style="${RB}">${d.numVentas}</td>
    </tr>`).join('');

  const RBT = RB.replace('border-bottom:1px solid var(--c-border-soft);', '').replace('font-size:.83rem;', 'font-size:.83rem;font-weight:700;');
  const RLT = RL.replace('border-bottom:1px solid var(--c-border-soft);', '').replace('font-size:.83rem;', 'font-size:.83rem;font-weight:700;');

  const filaTotales = `
    <tr style="background:rgba(74,144,217,.04);border-top:2px solid var(--c-border);">
      <td style="${RLT}font-family:var(--font-display);">TOTAL</td>
      <td style="${RBT}color:var(--c-accent);">${formatCurrency(tot.ventas)}</td>
      <td style="${RBT}color:var(--c-warning);">${formatCurrency(tot.cogs)}</td>
      <td style="${RBT}color:var(--c-danger);">${formatCurrency(tot.gastos)}</td>
      <td style="${RBT}color:${tot.ganancia >= 0 ? 'var(--c-success)' : 'var(--c-danger)'};">${formatCurrency(tot.ganancia)}</td>
      <td style="${RBT}">${tot.numVentas}</td>
    </tr>`;

  tbody.innerHTML = filas + filaTotales;
}

// ─── Exportar Excel ───────────────────────────────────────────────────────────
function exportarExcel() {
  const XLSX = window.XLSX;
  if (!XLSX) {
    showToast('Librería XLSX no disponible. Verifica la conexión a internet.', 'error');
    return;
  }

  const el    = (id) => document.getElementById(id);
  const desde = el('filtro-diario-desde')?.value;
  const hasta  = el('filtro-diario-hasta')?.value;

  let datos = _datosDiarios;
  if (desde) datos = datos.filter(d => d.fecha >= desde);
  if (hasta) datos = datos.filter(d => d.fecha <= hasta);

  if (!datos.length) { showToast('Sin datos para exportar.', 'warning'); return; }

  const filas = datos.map(d => ({
    'Fecha'                : fmtMuest(d.fecha),
    'Ventas del día (S/)'  : Number(d.ventas.toFixed(2)),
    'Costo ventas (S/)'    : Number(d.cogs.toFixed(2)),
    'Gastos operativos (S/)': Number(d.gastos.toFixed(2)),
    'Ganancia neta (S/)'   : Number(d.ganancia.toFixed(2)),
    'N° ventas'            : d.numVentas,
  }));

  // Fila de totales
  const tot = datos.reduce((a, d) => ({
    ventas  : a.ventas   + d.ventas,
    cogs    : a.cogs     + d.cogs,
    gastos  : a.gastos   + d.gastos,
    ganancia: a.ganancia + d.ganancia,
    numVentas: a.numVentas + d.numVentas,
  }), { ventas: 0, cogs: 0, gastos: 0, ganancia: 0, numVentas: 0 });

  filas.push({
    'Fecha'                : 'TOTAL',
    'Ventas del día (S/)'  : Number(tot.ventas.toFixed(2)),
    'Costo ventas (S/)'    : Number(tot.cogs.toFixed(2)),
    'Gastos operativos (S/)': Number(tot.gastos.toFixed(2)),
    'Ganancia neta (S/)'   : Number(tot.ganancia.toFixed(2)),
    'N° ventas'            : tot.numVentas,
  });

  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Detalle diario');
  XLSX.writeFile(wb, `reporte_${desde || 'todo'}_${hasta || 'todo'}.xlsx`);
  showToast('Excel exportado correctamente.', 'success');
}

// ─── Exportar PDF (impresión del navegador) ───────────────────────────────────
function exportarPDF() {
  // Los estilos @media print en reportes.html ocultan sidebar, topbar y botones
  window.print();
}
