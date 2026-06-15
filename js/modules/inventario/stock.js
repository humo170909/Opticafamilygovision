/* stock.js — Control de stock con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast }      from '../../utils/alerts.js';
import { formatDateTime } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);
  let productosCache = [];
  let filtroActivo   = 'todos';

  // ── Cargar productos ──────────────────────────────────────────────────────────
  async function cargarStock() {
    const busqueda = el('input-busqueda')?.value.trim() || '';

    let q = supabase.from('productos').select('id, nombre, stock_actual, stock_minimo, categorias(nombre), updated_at').order('nombre');
    if (busqueda) q = q.or(`nombre.ilike.%${busqueda}%`);

    const { data, error } = await q;
    if (error) { showToast('Error al cargar stock.', 'error'); return; }
    productosCache = data || [];

    let filtrado = productosCache;
    if (filtroActivo === 'bajo') {
      filtrado = productosCache.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo);
    } else if (filtroActivo === 'sin') {
      filtrado = productosCache.filter(p => p.stock_actual <= 0);
    }

    const sub = el('subtitle-contador');
    if (sub) {
      const alertas = productosCache.filter(p => p.stock_actual <= p.stock_minimo).length;
      sub.textContent = `${productosCache.length} productos · ${alertas} con stock bajo`;
      const badge = el('badge-stock');
      if (badge) badge.textContent = alertas;
    }

    renderTabla(filtrado);
  }

  // ── Render tabla stock ────────────────────────────────────────────────────────
  function renderTabla(productos) {
    const tbody = el('tbody-stock');
    if (!tbody) return;

    if (!productos.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-ink-muted);">Sin resultados.</td></tr>';
      return;
    }

    tbody.innerHTML = productos.map(p => {
      let estadoHtml;
      if (p.stock_actual <= 0) {
        estadoHtml = '<span class="stock-badge-critical">Sin stock</span>';
      } else if (p.stock_actual <= p.stock_minimo) {
        estadoHtml = '<span class="stock-badge-low">Stock bajo</span>';
      } else {
        estadoHtml = '<span class="stock-badge-ok">OK</span>';
      }
      return `<tr>
        <td style="font-weight:600;">${esc(p.nombre)}</td>
        <td style="font-size:.82rem;color:var(--c-ink-muted);">${p.categorias?.nombre ? esc(p.categorias.nombre) : '—'}</td>
        <td style="font-family:var(--font-display);font-weight:700;font-size:.95rem;">${p.stock_actual}</td>
        <td style="font-size:.82rem;color:var(--c-ink-muted);">${p.stock_minimo}</td>
        <td>${estadoHtml}</td>
        <td style="font-size:.78rem;color:var(--c-ink-muted);">${formatDateTime(p.updated_at)}</td>
        <td class="admin-only">
          <button class="btn-icon" title="Ajustar stock" data-action="ajustar" data-id="${p.id}" data-nombre="${esc(p.nombre)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Delegación eventos tabla ──────────────────────────────────────────────────
  el('tbody-stock')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="ajustar"]');
    if (!btn) return;
    abrirModalAjuste(btn.dataset.id, btn.dataset.nombre);
  });

  // ── Tabs filtro ───────────────────────────────────────────────────────────────
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      filtroActivo = tab.dataset.filter;
      cargarStock();
    });
  });

  let timer;
  el('input-busqueda')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cargarStock, 280); });

  // ── Cargar últimos movimientos ────────────────────────────────────────────────
  async function cargarMovimientos() {
    const { data, error } = await supabase
      .from('movimientos_stock')
      .select('id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, created_at, productos(nombre)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return;
    const tbody = el('tbody-movimientos');
    if (!tbody) return;
    const movData = data || [];
    if (!movData.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--c-ink-muted);">Sin movimientos registrados.</td></tr>';
      return;
    }
    tbody.innerHTML = movData.map(m => {
      const claseColor = m.tipo === 'entrada' ? 'mov-entrada' : m.tipo === 'salida' ? 'mov-salida' : 'mov-ajuste';
      const signo = m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : '=';
      return `<tr>
        <td style="font-size:.78rem;">${formatDateTime(m.created_at)}</td>
        <td style="font-size:.82rem;font-weight:600;">${esc(m.productos?.nombre || '—')}</td>
        <td><span class="${claseColor}">${esc(m.tipo)}</span></td>
        <td><span class="${claseColor}">${signo}${m.cantidad}</span></td>
        <td style="font-size:.82rem;color:var(--c-ink-muted);">${m.stock_anterior}</td>
        <td style="font-size:.82rem;font-weight:600;">${m.stock_nuevo}</td>
        <td style="font-size:.78rem;color:var(--c-ink-muted);">${esc(m.motivo || '—')}</td>
      </tr>`;
    }).join('');
  }

  // ── Modal ajuste de stock ─────────────────────────────────────────────────────
  function abrirModalAjuste(productoId, nombre) {
    const select = el('ajuste-select-producto');
    if (select) select.value = productoId;
    const nombreEl = el('ajuste-producto-nombre');
    if (nombreEl) nombreEl.textContent = esc(nombre);
    if (el('ajuste-cantidad')) el('ajuste-cantidad').value = '';
    if (el('ajuste-motivo'))   el('ajuste-motivo').value   = '';
    if (el('ajuste-tipo'))     el('ajuste-tipo').value     = 'entrada';
    if (el('ajuste-error'))    el('ajuste-error').hidden   = true;
    el('modal-ajuste')?.classList.add('active');
    setTimeout(() => el('ajuste-cantidad')?.focus(), 80);
  }

  el('btn-ajuste-stock')?.addEventListener('click', () => {
    abrirModalAjuste('', 'Selecciona un producto');
  });

  el('btn-close-ajuste')?.addEventListener('click',    () => el('modal-ajuste')?.classList.remove('active'));
  el('btn-cancelar-ajuste')?.addEventListener('click', () => el('modal-ajuste')?.classList.remove('active'));
  el('modal-ajuste')?.addEventListener('click', (e) => { if (e.target === el('modal-ajuste')) el('modal-ajuste').classList.remove('active'); });

  // Llenar select de productos en modal
  async function cargarSelectProductos() {
    const { data } = await supabase.from('productos').select('id, nombre').order('nombre');
    const sel = el('ajuste-select-producto');
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar producto…</option>' +
      (data || []).map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  }

  el('ajuste-select-producto')?.addEventListener('change', (e) => {
    const p = productosCache.find(x => String(x.id) === e.target.value);
    const nombreEl = el('ajuste-producto-nombre');
    if (nombreEl) nombreEl.textContent = p ? esc(p.nombre) : 'Selecciona un producto';
  });

  el('form-ajuste')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productoId = el('ajuste-select-producto')?.value;
    const tipo       = el('ajuste-tipo')?.value;
    const cantidad   = parseInt(el('ajuste-cantidad')?.value);
    const motivo     = el('ajuste-motivo')?.value.trim() || null;
    const errEl      = el('ajuste-error');

    if (!productoId) { if (errEl) { errEl.textContent = 'Selecciona un producto.'; errEl.hidden = false; } return; }
    if (!cantidad || cantidad < 0) { if (errEl) { errEl.textContent = 'Ingresa una cantidad válida.'; errEl.hidden = false; } return; }
    if (errEl) errEl.hidden = true;

    const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', productoId).single();
    const stockAnt = prod?.stock_actual || 0;

    let stockNuevo;
    if (tipo === 'entrada') stockNuevo = stockAnt + cantidad;
    else if (tipo === 'salida') {
      if (cantidad > stockAnt) { if (errEl) { errEl.textContent = `No puedes sacar más stock del disponible (${stockAnt}).`; errEl.hidden = false; } return; }
      stockNuevo = stockAnt - cantidad;
    } else {
      stockNuevo = cantidad;
    }

    const btn = el('btn-guardar-ajuste');
    if (btn) btn.disabled = true;

    const { error } = await supabase.from('productos').update({ stock_actual: stockNuevo }).eq('id', productoId);
    if (error) { if (errEl) { errEl.textContent = 'Error al actualizar stock.'; errEl.hidden = false; } if (btn) btn.disabled = false; return; }

    // Registrar movimiento
    await supabase.from('movimientos_stock').insert({
      producto_id: productoId, tipo, cantidad,
      stock_anterior: stockAnt, stock_nuevo: stockNuevo, motivo,
    });

    if (btn) btn.disabled = false;
    el('modal-ajuste')?.classList.remove('active');
    showToast('Stock actualizado correctamente.', 'success');
    await Promise.all([cargarStock(), cargarMovimientos()]);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el('modal-ajuste')?.classList.remove('active'); });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await Promise.all([cargarStock(), cargarMovimientos(), cargarSelectProductos()]);
});

