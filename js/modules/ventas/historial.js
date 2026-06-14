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

  // Categorías de complementos
  const TIPOS_LUNAS = new Set([
    'Blue Cut','Transition','Kodak','Monofocal','Bifocal','Progresivo','Fotocromático',
  ]);
  const TIPOS_TRATS = new Set(['Antirreflejo','Polarizado']);

  const METODOS_LABEL = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta',
    transferencia: 'Transferencia', yape: 'Yape/Plin',
  };

  // ── Cargar ventas ─────────────────────────────────────────────────────────────
  async function cargarVentas() {
    let q = supabase
      .from('ventas')
      .select(`
        id, created_at, total, descuento, metodo_pago, estado,
        paciente_id, created_by,
        pacientes(nombres, apellidos),
        detalle_ventas(id, cantidad, productos(nombre)),
        venta_complementos(id, tipo, cantidad)
      `)
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
      const nombre = v.pacientes
        ? `${v.pacientes.nombres} ${v.pacientes.apellidos}`.toLowerCase()
        : '';
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

    tbody.innerHTML = ventas.map(v => {
      const paciente  = v.pacientes
        ? `${esc(v.pacientes.apellidos)}, ${esc(v.pacientes.nombres)}`
        : '<span style="color:var(--c-ink-faint);">—</span>';

      const prods = v.detalle_ventas    || [];
      const comps = v.venta_complementos || [];

      // Máximo 3 pills visibles en total antes de "+N más"
      const MAX_PILLS = 3;
      const pillsProd = prods.map(d =>
        `<span class="venta-tag">${esc(d.productos?.nombre || '—')}</span>`
      );
      const pillsComp = comps.map(c =>
        `<span class="venta-tag comp">${esc(c.tipo)}</span>`
      );
      const allPills   = [...pillsProd, ...pillsComp];
      const visible    = allPills.slice(0, MAX_PILLS);
      const remainder  = allPills.length - visible.length;
      const masTag     = remainder > 0
        ? `<span class="venta-tag mas">+${remainder}</span>`
        : '';

      const articulosHtml = allPills.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:3px;">${visible.join('')}${masTag}</div>`
        : `<span style="color:var(--c-ink-faint);font-size:.78rem;">—</span>`;

      const badgeClass = v.estado === 'completada' ? 'bs' : 'bd';

      return `<tr>
        <td><span style="font-family:var(--font-display);font-weight:600;font-size:.82rem;">#${v.id}</span></td>
        <td style="font-size:.82rem;">${formatDateTime(v.created_at)}</td>
        <td style="font-size:.82rem;">${paciente}</td>
        <td>${articulosHtml}</td>
        <td><span style="font-family:var(--font-display);font-weight:700;">${formatCurrency(v.total)}</span></td>
        <td style="font-size:.82rem;">${esc(METODOS_LABEL[v.metodo_pago] || v.metodo_pago || '—')}</td>
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
    if (accion === 'detalle')  await verDetalle(id);
    if (accion === 'cancelar') await cancelarVenta(id);
  });

  // ── Ver detalle ───────────────────────────────────────────────────────────────
  async function verDetalle(id) {
    const { data: venta } = await supabase
      .from('ventas')
      .select(`
        *,
        pacientes(nombres, apellidos, dni, telefono),
        detalle_ventas(*, productos(nombre, codigo_barras)),
        venta_complementos(*)
      `)
      .eq('id', id)
      .single();

    if (!venta) { showToast('No se pudo cargar el detalle.', 'error'); return; }

    // Nombre del vendedor (lookup separado, robusto con cualquier schema)
    let vendedor = '—';
    if (venta.created_by) {
      const { data: u } = await supabase
        .from('usuarios_perfil')
        .select('nombre')
        .eq('id', venta.created_by)
        .single();
      if (u) vendedor = u.nombre;
    }

    const tituloEl    = el('detalle-titulo');
    const subtituloEl = el('detalle-subtitulo');
    const bodyEl      = el('detalle-body');
    const btnCanc     = el('btn-cancelar-venta');

    if (tituloEl)    tituloEl.textContent    = `Venta #${venta.id}`;
    if (subtituloEl) subtituloEl.textContent = formatDateTime(venta.created_at);
    if (btnCanc)     btnCanc.style.display   = venta.estado === 'completada' ? 'flex' : 'none';
    if (btnCanc)     btnCanc.dataset.id      = venta.id;

    const paciente = venta.pacientes
      ? `${venta.pacientes.nombres} ${venta.pacientes.apellidos}`
      : '—';

    const items = venta.detalle_ventas    || [];
    const comps = venta.venta_complementos || [];

    // Categorizar complementos
    const lunas    = comps.filter(c =>  TIPOS_LUNAS.has(c.tipo));
    const tratams  = comps.filter(c =>  TIPOS_TRATS.has(c.tipo));
    const servicios = comps.filter(c => !TIPOS_LUNAS.has(c.tipo) && !TIPOS_TRATS.has(c.tipo));

    // ── Bloque de productos físicos ──
    const bloqueProductos = items.length ? `
      <div class="detalle-section-hdr">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M11 12h2"/></svg>
        Productos físicos
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:4px;">
        <thead>
          <tr style="background:rgba(74,144,217,.05);">
            <th style="padding:6px 10px;text-align:left;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;border-bottom:1px solid var(--c-border-soft);">Producto</th>
            <th style="padding:6px 6px;text-align:center;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;border-bottom:1px solid var(--c-border-soft);">Cant.</th>
            <th style="padding:6px 6px;text-align:right;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;border-bottom:1px solid var(--c-border-soft);">P. Unit.</th>
            <th style="padding:6px 10px;text-align:right;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;border-bottom:1px solid var(--c-border-soft);">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => {
            const hayDescItem = i.precio_original && Number(i.precio_original) !== Number(i.precio_unitario);
            const precHtml = hayDescItem
              ? `<span style="text-decoration:line-through;color:var(--c-ink-faint);font-size:.75rem;">${formatCurrency(i.precio_original)}</span><br>${formatCurrency(i.precio_unitario)}`
              : formatCurrency(i.precio_unitario);
            return `<tr style="border-bottom:1px solid var(--c-border-soft);">
              <td style="padding:7px 10px;font-weight:500;">${esc(i.productos?.nombre || '—')}</td>
              <td style="padding:7px 6px;text-align:center;color:var(--c-ink-soft);">${i.cantidad}</td>
              <td style="padding:7px 6px;text-align:right;color:var(--c-ink-soft);">${precHtml}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:600;">${formatCurrency(i.subtotal)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '';

    // ── Helper para bloques de complementos ──
    const bloqueComps = (lista, titulo, clsHdr, clsIco) => lista.length ? `
      <div class="detalle-section-hdr ${clsHdr}">
        ${clsIco}
        ${titulo}
      </div>
      ${lista.map(c => `
        <div class="detalle-comp-row">
          <div class="detalle-comp-name">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>${esc(c.tipo)}${c.descripcion ? ` <span style="color:var(--c-ink-muted);font-weight:400;"> — ${esc(c.descripcion)}</span>` : ''}</span>
            <span style="color:var(--c-ink-muted);font-size:.77rem;"> ×${c.cantidad}</span>
          </div>
          <span class="detalle-comp-precio">${formatCurrency(c.subtotal)}</span>
        </div>`).join('')}` : '';

    const svgLuna = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9" opacity=".3"/></svg>`;
    const svgTrat = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const svgServ = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`;

    if (bodyEl) bodyEl.innerHTML = `
      <!-- INFO HEADER -->
      <div class="detalle-info-grid" style="background:var(--c-bg);border-radius:var(--radius-sm);padding:12px 14px;">
        <div class="detalle-info-item">
          <div class="di-label">Paciente</div>
          <div class="di-value">${esc(paciente)}</div>
        </div>
        <div class="detalle-info-item">
          <div class="di-label">Vendedor</div>
          <div class="di-value">${esc(vendedor)}</div>
        </div>
        <div class="detalle-info-item">
          <div class="di-label">Fecha</div>
          <div class="di-value">${formatDate(venta.created_at)}</div>
        </div>
        <div class="detalle-info-item">
          <div class="di-label">Estado</div>
          <div class="di-value"><span class="badge ${venta.estado === 'completada' ? 'bs' : 'bd'}">${esc(venta.estado)}</span></div>
        </div>
        <div class="detalle-info-item">
          <div class="di-label">Método de pago</div>
          <div class="di-value">${esc(METODOS_LABEL[venta.metodo_pago] || venta.metodo_pago || '—')}</div>
        </div>
        ${(() => {
          const td = venta.tipo_descuento;
          let descText = '';
          if (td === 'general') {
            if (venta.descuento_general_tipo === 'monto_fijo') {
              descText = `S/ ${(venta.descuento_general_valor || 0).toFixed(2)} (fijo)`;
            } else {
              const pct = venta.descuento_general_valor || 0;
              descText = `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
            }
          } else if (td === 'por_producto') {
            descText = 'Por producto';
          } else if (!td && venta.descuento > 0) {
            descText = `${(venta.descuento * 100).toFixed(0)}%`;
          }
          return descText ? `
          <div class="detalle-info-item">
            <div class="di-label">Descuento</div>
            <div class="di-value" style="color:var(--c-danger);">${descText}</div>
          </div>` : '';
        })()}
      </div>

      <!-- PRODUCTOS -->
      ${bloqueProductos}

      <!-- LUNAS -->
      ${bloqueComps(lunas, 'Lunas', 'lunas', svgLuna)}

      <!-- TRATAMIENTOS -->
      ${bloqueComps(tratams, 'Tratamientos', 'trats', svgTrat)}

      <!-- SERVICIOS -->
      ${bloqueComps(servicios, 'Servicios / Otros', 'servs', svgServ)}

      <!-- TOTAL -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 10px 0;border-top:1px dashed var(--c-border);margin-top:12px;">
        <span style="font-family:var(--font-display);font-weight:700;font-size:.95rem;">TOTAL</span>
        <span style="font-family:var(--font-display);font-weight:800;font-size:1.1rem;color:var(--c-success);">${formatCurrency(venta.total)}</span>
      </div>`;

    el('modal-detalle')?.classList.add('open');
  }

  // ── Cancelar venta (devuelve stock atómicamente via RPC) ─────────────────────
  async function cancelarVenta(id) {
    const ok = await confirmDialog(
      '¿Cancelar esta venta? El stock de los productos físicos será devuelto.',
      { title: 'Cancelar venta', type: 'danger' }
    );
    if (!ok) return;

    const { error } = await supabase.rpc('restaurar_stock_cancelacion', { p_venta_id: id });
    if (error) { showToast('Error al cancelar: ' + error.message, 'error'); return; }

    el('modal-detalle')?.classList.remove('open');
    showToast('Venta cancelada y stock devuelto.', 'success');
    cargarVentas();
  }

  // ── Controles modal ───────────────────────────────────────────────────────────
  el('btn-close-detalle')?.addEventListener('click',  () => el('modal-detalle')?.classList.remove('open'));
  el('btn-close-detalle-2')?.addEventListener('click', () => el('modal-detalle')?.classList.remove('open'));
  el('btn-cancelar-venta')?.addEventListener('click', (e) => cancelarVenta(Number(e.currentTarget.dataset.id)));
  el('modal-detalle')?.addEventListener('click', (e) => {
    if (e.target === el('modal-detalle')) el('modal-detalle').classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el('modal-detalle')?.classList.remove('open');
  });

  // ── Filtros ───────────────────────────────────────────────────────────────────
  let timer;
  el('input-busqueda')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cargarVentas, 300); });
  el('filtro-desde')?.addEventListener('change',  cargarVentas);
  el('filtro-hasta')?.addEventListener('change',  cargarVentas);
  el('filtro-estado')?.addEventListener('change', cargarVentas);

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarVentas();
});
