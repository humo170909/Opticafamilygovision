/* historial.js — Historial de ventas con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI, getCurrentUser } from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';
import { ROLES }          from '../../config/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);
  let ventasCache = [];

  // ── Cargar ventas ─────────────────────────────────────────────────────────────
  async function cargarVentas() {
    let q = supabase
      .from('ventas')
      .select('id, created_at, total, descuento, metodo_pago, estado, paciente_id, pacientes(nombres, apellidos), detalle_ventas(id)')
      .order('created_at', { ascending: false })
      .limit(200);

    const busqueda = el('input-busqueda')?.value.trim();
    const desde    = el('filtro-desde')?.value;
    const hasta    = el('filtro-hasta')?.value;
    const estado   = el('filtro-estado')?.value;

    if (desde)  q = q.gte('created_at', desde);
    if (hasta)  q = q.lte('created_at', hasta + 'T23:59:59');
    if (estado) q = q.eq('estado', estado);

    const { data, error } = await q;
    if (error) { showToast('Error al cargar ventas.', 'error'); return; }

    ventasCache = (data || []).filter(v => {
      if (!busqueda) return true;
      const nombre = v.pacientes ? `${v.pacientes.nombres} ${v.pacientes.apellidos}`.toLowerCase() : '';
      return nombre.includes(busqueda.toLowerCase()) || String(v.id).includes(busqueda);
    });

    renderTabla(ventasCache);
  }

  // ── Render tabla ──────────────────────────────────────────────────────────────
  function renderTabla(ventas) {
    const tbody = el('tbody-ventas');
    const sub   = el('subtitle-contador');
    if (!tbody) return;
    if (sub) sub.textContent = `${ventas.length} venta${ventas.length !== 1 ? 's' : ''}`;

    if (!ventas.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--c-ink-muted);">Sin ventas registradas.</td></tr>';
      return;
    }

    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yape: 'Yape/Plin' };
    tbody.innerHTML = ventas.map(v => {
      const paciente   = v.pacientes ? `${esc(v.pacientes.nombres)} ${esc(v.pacientes.apellidos)}` : '<span style="color:var(--c-ink-faint);">—</span>';
      const nProductos = v.detalle_ventas?.length || 0;
      const badgeClass = v.estado === 'completada' ? 'bs' : 'bd';
      return `<tr>
        <td><span style="font-family:var(--font-display);font-weight:600;font-size:.82rem;">#${v.id}</span></td>
        <td style="font-size:.82rem;">${formatDateTime(v.created_at)}</td>
        <td>${paciente}</td>
        <td style="font-size:.82rem;color:var(--c-ink-muted);">${nProductos} producto${nProductos !== 1 ? 's' : ''}</td>
        <td><span style="font-family:var(--font-display);font-weight:700;">${formatCurrency(v.total)}</span></td>
        <td style="font-size:.82rem;">${esc(metodosLabel[v.metodo_pago] || v.metodo_pago || '—')}</td>
        <td><span class="badge ${badgeClass}">${esc(v.estado || '')}</span></td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn-icon" title="Ver detalle" data-action="detalle" data-id="${v.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${v.estado === 'completada' ? `
            <button class="btn-icon --danger" title="Cancelar venta" data-action="cancelar" data-id="${v.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Delegación de eventos tabla ───────────────────────────────────────────────
  el('tbody-ventas')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = Number(btn.dataset.id);
    const accion = btn.dataset.action;

    if (accion === 'detalle') await verDetalle(id);
    if (accion === 'cancelar') await cancelarVenta(id);
  });

  // ── Ver detalle ───────────────────────────────────────────────────────────────
  async function verDetalle(id) {
    const { data: venta } = await supabase
      .from('ventas')
      .select('*, pacientes(nombres, apellidos, dni, telefono), detalle_ventas(*, productos(nombre, codigo_barras))')
      .eq('id', id)
      .single();

    if (!venta) { showToast('No se pudo cargar el detalle.', 'error'); return; }

    const tituloEl    = el('detalle-titulo');
    const subtituloEl = el('detalle-subtitulo');
    const bodyEl      = el('detalle-body');
    const btnCanc     = el('btn-cancelar-venta');

    if (tituloEl)    tituloEl.textContent    = `Venta #${venta.id}`;
    if (subtituloEl) subtituloEl.textContent = `${formatDateTime(venta.created_at)} · ${venta.metodo_pago || '—'}`;
    if (btnCanc)     btnCanc.style.display   = venta.estado === 'completada' ? 'flex' : 'none';
    if (btnCanc)     btnCanc.dataset.id      = venta.id;

    const paciente = venta.pacientes ? `${venta.pacientes.nombres} ${venta.pacientes.apellidos}` : '—';
    const items    = venta.detalle_ventas || [];

    if (bodyEl) bodyEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--c-border-soft);margin-bottom:12px;">
        <div>
          <span style="font-size:.8rem;color:var(--c-ink-muted);">Paciente</span>
          <div style="font-weight:600;font-size:.88rem;">${esc(paciente)}</div>
        </div>
        <span class="badge ${venta.estado === 'completada' ? 'bs' : 'bd'}">${esc(venta.estado)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
        <thead>
          <tr style="background:rgba(74,144,217,.05);">
            <th style="padding:7px 10px;text-align:left;font-size:.72rem;color:var(--c-ink-muted);font-family:var(--font-display);font-weight:600;border-bottom:1px solid var(--c-border-soft);">Producto</th>
            <th style="padding:7px 10px;text-align:center;font-size:.72rem;color:var(--c-ink-muted);font-family:var(--font-display);font-weight:600;border-bottom:1px solid var(--c-border-soft);">Cant.</th>
            <th style="padding:7px 10px;text-align:right;font-size:.72rem;color:var(--c-ink-muted);font-family:var(--font-display);font-weight:600;border-bottom:1px solid var(--c-border-soft);">P. unit.</th>
            <th style="padding:7px 10px;text-align:right;font-size:.72rem;color:var(--c-ink-muted);font-family:var(--font-display);font-weight:600;border-bottom:1px solid var(--c-border-soft);">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => `<tr style="border-bottom:1px solid var(--c-border-soft);">
            <td style="padding:8px 10px;">${esc(i.productos?.nombre || '—')}</td>
            <td style="padding:8px 10px;text-align:center;">${i.cantidad}</td>
            <td style="padding:8px 10px;text-align:right;">${formatCurrency(i.precio_unitario)}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:600;">${formatCurrency(i.subtotal)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;padding:10px 10px 0;font-family:var(--font-display);font-weight:800;font-size:.95rem;border-top:1px dashed var(--c-border);margin-top:4px;">
        <span>TOTAL</span>
        <span style="color:var(--c-success);">${formatCurrency(venta.total)}</span>
      </div>`;

    el('modal-detalle')?.classList.add('open');
  }

  // ── Cancelar venta (devuelve stock) ───────────────────────────────────────────
  async function cancelarVenta(id) {
    const ok = await confirmDialog('¿Cancelar esta venta? El stock de los productos será devuelto.', { title: 'Cancelar venta', type: 'danger' });
    if (!ok) return;

    // Obtener detalle para devolver stock
    const { data: detalles } = await supabase.from('detalle_ventas').select('producto_id, cantidad').eq('venta_id', id);

    const { error } = await supabase.from('ventas').update({ estado: 'cancelada' }).eq('id', id);
    if (error) { showToast('Error al cancelar la venta.', 'error'); return; }

    // Devolver stock
    for (const det of (detalles || [])) {
      const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', det.producto_id).single();
      if (prod) await supabase.from('productos').update({ stock_actual: prod.stock_actual + det.cantidad }).eq('id', det.producto_id);
    }

    el('modal-detalle')?.classList.remove('open');
    showToast('Venta cancelada y stock devuelto.', 'success');
    cargarVentas();
  }

  // ── Controles modal ───────────────────────────────────────────────────────────
  el('btn-close-detalle')?.addEventListener('click',  () => el('modal-detalle')?.classList.remove('open'));
  el('btn-close-detalle-2')?.addEventListener('click', () => el('modal-detalle')?.classList.remove('open'));
  el('btn-cancelar-venta')?.addEventListener('click', (e) => cancelarVenta(Number(e.currentTarget.dataset.id)));
  el('modal-detalle')?.addEventListener('click', (e) => { if (e.target === el('modal-detalle')) el('modal-detalle').classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el('modal-detalle')?.classList.remove('open'); });

  // ── Filtros ───────────────────────────────────────────────────────────────────
  let timer;
  el('input-busqueda')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cargarVentas, 300); });
  el('filtro-desde')?.addEventListener('change',  cargarVentas);
  el('filtro-hasta')?.addEventListener('change',  cargarVentas);
  el('filtro-estado')?.addEventListener('change', cargarVentas);

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarVentas();
});

