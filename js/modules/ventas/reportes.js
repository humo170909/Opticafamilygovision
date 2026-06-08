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

    const { data: ventas, error } = await supabase
      .from('ventas')
      .select('id, total, created_at, metodo_pago, detalle_ventas(cantidad, precio_unitario, producto_id, productos(nombre))')
      .eq('estado', 'completada')
      .gte('created_at', desdeStr)
      .order('created_at');

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
    const porPago = {};
    data.forEach(v => { const m = v.metodo_pago || 'efectivo'; porPago[m] = (porPago[m] || 0) + v.total; });
    const totalPago   = Object.values(porPago).reduce((a, b) => a + b, 0) || 1;
    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yape: 'Yape / Plin' };
    const colores = { efectivo: '#4a90d9', tarjeta: '#2e9e6b', transferencia: '#d97a0f', yape: '#8b5cf6' };

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

  el('filtro-periodo')?.addEventListener('change', cargarReportes);

  await cargarReportes();
});

