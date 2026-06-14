/* productos.js — CRUD de productos con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatCurrency } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  const el  = (id) => document.getElementById(id);
  const all = (sel) => document.querySelectorAll(sel);

  // ── Estado ──────────────────────────────────────────────────────────────────
  const estado = { busqueda: '', categoria: '', filtroStock: 'todos', pagina: 1, porPagina: 20 };
  let productosCache = [];

  // ── Cargar categorías al inicio ──────────────────────────────────────────────
  async function cargarCategorias() {
    const { data: cats } = await supabase.from('categorias').select('id, nombre').order('nombre');
    const selectFiltro = el('select-categoria');
    const selectModal  = el('select-cat-modal');
    (cats || []).forEach(cat => {
      const opt1 = document.createElement('option');
      opt1.value = cat.id;
      opt1.textContent = cat.nombre;
      selectFiltro?.appendChild(opt1);

      const opt2 = opt1.cloneNode(true);
      selectModal?.appendChild(opt2);
    });
  }

  // ── Cargar y filtrar productos ───────────────────────────────────────────────
  async function cargarProductos() {
    let query = supabase
      .from('productos')
      .select('*, categorias(nombre)')
      .order('nombre');

    if (estado.busqueda) {
      query = query.or(`nombre.ilike.%${estado.busqueda}%,marca.ilike.%${estado.busqueda}%,codigo_barras.ilike.%${estado.busqueda}%`);
    }
    if (estado.categoria) {
      query = query.eq('categoria_id', estado.categoria);
    }
    if (estado.filtroStock === 'activos') {
      query = query.eq('activo', true);
    } else if (estado.filtroStock === 'sin-stock') {
      query = query.eq('stock_actual', 0);
    }

    const { data, error } = await query;
    if (error) { showToast('Error al cargar productos.', 'error'); return; }

    productosCache = data || [];

    // Filtro stock-bajo (requiere comparar 2 columnas, se hace en cliente)
    const resultado = estado.filtroStock === 'stock-bajo'
      ? productosCache.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo)
      : productosCache;

    renderTabla(resultado);
  }

  // ── Render tabla ─────────────────────────────────────────────────────────────
  function renderTabla(productos) {
    const tbody      = el('tbody-productos');
    const emptyState = el('empty-state');
    const paginBar   = el('pagination-bar');
    const countEl    = el('count-num');
    const subtitleEl = el('subtitle-contador');
    if (!tbody) return;

    if (!productos.length) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (paginBar)   paginBar.style.display   = 'none';
      if (countEl)    countEl.textContent       = '0';
      if (subtitleEl) subtitleEl.textContent    = 'Sin productos';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (paginBar)   paginBar.style.display   = 'flex';
    if (countEl)    countEl.textContent       = productos.length;
    if (subtitleEl) subtitleEl.textContent    = `${productos.length} producto${productos.length !== 1 ? 's' : ''} en inventario`;

    tbody.innerHTML = productos.map(p => {
      const stockClass = p.stock_actual === 0 ? 'stock-critical' : p.stock_actual <= p.stock_minimo ? 'stock-warning' : 'stock-ok';
      const estadoBadge = p.stock_actual === 0
        ? '<span class="badge badge-danger">Sin stock</span>'
        : p.stock_actual <= p.stock_minimo
          ? '<span class="badge badge-warning">Stock bajo</span>'
          : p.activo ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-neutral">Inactivo</span>';

      const esVariable = p.tipo_precio === 'variable';
      const margen = !esVariable && p.precio_compra > 0
        ? Math.round(((p.precio_venta - p.precio_compra) / p.precio_compra) * 100) : 0;

      const imgHTML = p.imagen_url
        ? `<img src="${esc(p.imagen_url)}" alt="${esc(p.nombre)}" loading="lazy"/>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M11 12h2"/></svg>`;

      return `<tr>
        <td>
          <div class="producto-cell">
            <div class="producto-thumb">${imgHTML}</div>
            <div>
              <div class="producto-nombre">${esc(p.nombre)}</div>
              <div class="producto-marca">${[p.marca, p.modelo].filter(Boolean).map(esc).join(' · ') || '—'}</div>
            </div>
          </div>
        </td>
        <td class="col-categoria">${p.categorias?.nombre ? `<span class="badge badge-info">${esc(p.categorias.nombre)}</span>` : '—'}</td>
        <td class="col-codigo">${esc(p.codigo_barras) || '—'}</td>
        <td class="col-compra"><span style="color:var(--c-ink-muted);font-size:.85rem;">${formatCurrency(p.precio_compra)}</span></td>
        <td>
          ${esVariable
            ? `<div class="td-precio"><span class="badge badge-info" style="font-size:.62rem;padding:2px 7px;">Variable</span></div>
               <div class="td-precio-compra">S/${(p.precio_minimo||0).toFixed(2)} – S/${(p.precio_maximo||0).toFixed(2)}</div>`
            : `<div class="td-precio">${formatCurrency(p.precio_venta)}</div>
               <div class="td-precio-compra">margen ${margen}%</div>`}
        </td>
        <td>
          <div class="stock-cell">
            <span class="stock-num ${stockClass}">${p.stock_actual}</span>
            <span style="font-size:.72rem;color:var(--c-ink-faint);">/ mín ${p.stock_minimo}</span>
          </div>
        </td>
        <td>${estadoBadge}</td>
        <td>
          <div class="td-acciones">
            <button class="btn-icon" title="Editar"   data-action="editar"   data-id="${p.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon --danger" title="Eliminar" data-action="eliminar" data-id="${p.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Delegación de eventos en tabla (registrar UNA vez) ───────────────────────
  el('tbody-productos')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = Number(btn.dataset.id);
    const accion = btn.dataset.action;

    if (accion === 'editar') {
      const prod = productosCache.find(p => p.id === id);
      if (prod) abrirModal(prod);
    }

    if (accion === 'eliminar') {
      const prod = productosCache.find(p => p.id === id);
      if (prod?.stock_actual > 0) {
        showToast('No puedes eliminar un producto con stock disponible. Ajusta el stock a 0 primero.', 'warning');
        return;
      }
      const ok = await confirmDialog(`¿Eliminar <strong>${esc(prod?.nombre)}</strong>? Esta acción no se puede deshacer.`, { title: 'Eliminar Producto' });
      if (ok) await eliminarProducto(id);
    }
  });

  // ── Tabs de filtro ───────────────────────────────────────────────────────────
  all('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      all('.status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      estado.filtroStock = tab.dataset.filter;
      estado.pagina = 1;
      cargarProductos();
    });
  });

  // ── Búsqueda con debounce ────────────────────────────────────────────────────
  let timer;
  el('input-busqueda')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      estado.busqueda = e.target.value.trim();
      estado.pagina = 1;
      cargarProductos();
    }, 300);
  });

  el('select-categoria')?.addEventListener('change', (e) => {
    estado.categoria = e.target.value;
    estado.pagina = 1;
    cargarProductos();
  });

  // ── Modal abrir / cerrar ─────────────────────────────────────────────────────
  el('btn-nuevo-producto')?.addEventListener('click',    () => abrirModal(null));
  el('btn-nuevo-desde-empty')?.addEventListener('click', () => abrirModal(null));
  el('btn-cerrar-modal')?.addEventListener('click',      cerrarModal);
  el('btn-cancelar-modal')?.addEventListener('click',    cerrarModal);
  el('modal-overlay')?.addEventListener('click', (e) => { if (e.target === el('modal-overlay')) cerrarModal(); });

  function abrirModal(producto = null) {
    const form = el('form-producto');
    form.reset();
    el('modal-error').hidden = true;
    limpiarErrores();

    if (producto) {
      el('input-producto-id').value   = producto.id;
      el('input-nombre').value        = producto.nombre        || '';
      el('input-marca').value         = producto.marca         || '';
      el('input-modelo').value        = producto.modelo        || '';
      el('select-cat-modal').value    = producto.categoria_id  || '';
      el('input-codigo').value        = producto.codigo_barras || '';
      el('input-descripcion').value   = producto.descripcion   || '';
      el('input-precio-compra').value = producto.precio_compra || '';
      el('input-precio-venta').value  = producto.precio_venta  || '';
      el('input-precio-minimo').value = producto.precio_minimo ?? '';
      el('input-precio-maximo').value = producto.precio_maximo ?? '';
      el('select-tipo-precio').value  = producto.tipo_precio   || 'fijo';
      el('input-stock-actual').value  = producto.stock_actual  ?? 0;
      el('input-stock-minimo').value  = producto.stock_minimo  ?? 5;
      el('input-imagen').value        = producto.imagen_url    || '';
      el('toggle-activo').checked     = producto.activo !== false;
      el('modal-title').textContent       = 'Editar Producto';
      el('modal-subtitle').textContent    = producto.nombre;
      el('btn-guardar-texto').textContent = 'Guardar cambios';
      toggleTipoPrecio(producto.tipo_precio || 'fijo');
    } else {
      el('input-producto-id').value       = '';
      el('input-stock-minimo').value      = '5';
      el('toggle-activo').checked         = true;
      el('select-tipo-precio').value      = 'fijo';
      el('modal-title').textContent       = 'Nuevo Producto';
      el('modal-subtitle').textContent    = 'Completa los datos del producto';
      el('btn-guardar-texto').textContent = 'Guardar producto';
      toggleTipoPrecio('fijo');
    }

    el('modal-overlay').classList.add('active');
    setTimeout(() => el('input-nombre').focus(), 80);
  }

  function cerrarModal() {
    el('modal-overlay').classList.remove('active');
    el('modal-error').hidden = true;
    limpiarErrores();
  }

  // ── Submit formulario ────────────────────────────────────────────────────────
  el('form-producto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    const id         = el('input-producto-id').value;
    const tipoPrecio = el('select-tipo-precio')?.value || 'fijo';
    const data = {
      nombre:        el('input-nombre').value.trim(),
      marca:         el('input-marca').value.trim()         || null,
      modelo:        el('input-modelo').value.trim()        || null,
      categoria_id:  Number(el('select-cat-modal').value)   || null,
      codigo_barras: el('input-codigo').value.trim()        || null,
      descripcion:   el('input-descripcion').value.trim()   || null,
      precio_compra: parseFloat(el('input-precio-compra').value) || 0,
      tipo_precio:   tipoPrecio,
      precio_venta:  tipoPrecio === 'fijo'     ? parseFloat(el('input-precio-venta').value)  || 0 : 0,
      precio_minimo: tipoPrecio === 'variable' ? parseFloat(el('input-precio-minimo').value) || null : null,
      precio_maximo: tipoPrecio === 'variable' ? parseFloat(el('input-precio-maximo').value) || null : null,
      stock_actual:  parseInt(el('input-stock-actual').value)    || 0,
      stock_minimo:  parseInt(el('input-stock-minimo').value)    || 5,
      imagen_url:    el('input-imagen').value.trim()        || null,
      activo:        el('toggle-activo').checked,
    };

    const btn = el('btn-guardar-producto');
    btn.disabled = true;

    if (id) {
      await actualizarProducto(Number(id), data);
    } else {
      await crearProducto(data);
    }

    btn.disabled = false;
  });

  // ── CRUD Supabase ────────────────────────────────────────────────────────────
  async function crearProducto(data) {
    const { error } = await supabase.from('productos').insert(data);
    if (error) {
      el('modal-error').textContent = 'Error al guardar: ' + (error.message || 'Intenta de nuevo.');
      el('modal-error').hidden = false;
      return;
    }
    cerrarModal();
    showToast('Producto creado correctamente.', 'success');
    cargarProductos();
  }

  async function actualizarProducto(id, data) {
    const { error } = await supabase.from('productos').update(data).eq('id', id);
    if (error) {
      el('modal-error').textContent = 'Error al actualizar: ' + (error.message || 'Intenta de nuevo.');
      el('modal-error').hidden = false;
      return;
    }
    cerrarModal();
    showToast('Producto actualizado.', 'success');
    cargarProductos();
  }

  async function eliminarProducto(id) {
    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) { showToast('No se pudo eliminar: ' + (error.message || ''), 'error'); return; }
    showToast('Producto eliminado.', 'success');
    cargarProductos();
  }

  // ── Validación ───────────────────────────────────────────────────────────────
  function validarFormulario() {
    limpiarErrores();
    let ok = true;
    if (!el('input-nombre').value.trim()) { mostrarError('error-nombre', 'El nombre es requerido'); ok = false; }
    if (!el('select-cat-modal').value)    { mostrarError('error-categoria', 'Selecciona un tipo de producto'); ok = false; }

    const tipoPrecio = el('select-tipo-precio')?.value || 'fijo';
    const compra     = parseFloat(el('input-precio-compra').value) || 0;

    if (tipoPrecio === 'fijo') {
      const venta = parseFloat(el('input-precio-venta').value);
      if (!venta || venta <= 0) { mostrarError('error-precio-venta', 'Ingresa un precio de venta válido'); ok = false; }
      else if (compra > 0 && venta <= compra) { mostrarError('error-precio-venta', 'El precio de venta debe ser mayor al de compra'); ok = false; }
    } else {
      const min = parseFloat(el('input-precio-minimo').value);
      const max = parseFloat(el('input-precio-maximo').value);
      if (!min || min < 0) { mostrarError('error-precio-minimo', 'Ingresa un precio mínimo válido'); ok = false; }
      if (!max || max < 0) { mostrarError('error-precio-maximo', 'Ingresa un precio máximo válido'); ok = false; }
      else if (ok && max <= min) { mostrarError('error-precio-maximo', 'El precio máximo debe ser mayor al mínimo'); ok = false; }
    }

    if (!ok) el('form-producto').querySelector('.form-error:not([hidden])')?.closest('.form-group')?.querySelector('input,select')?.focus();
    return ok;
  }

  function mostrarError(id, msg) { const e = el(id); if (e) { e.textContent = msg; e.hidden = false; } }
  function limpiarErrores()      { all('.form-error').forEach(e => { e.hidden = true; e.textContent = ''; }); }

  function toggleTipoPrecio(tipo) {
    const rowFijo     = el('row-precio-fijo');
    const rowVariable = el('row-precio-variable');
    if (tipo === 'variable') {
      if (rowFijo)     rowFijo.style.display     = 'none';
      if (rowVariable) rowVariable.style.display = '';
    } else {
      if (rowFijo)     rowFijo.style.display     = '';
      if (rowVariable) rowVariable.style.display = 'none';
    }
  }

  el('select-tipo-precio')?.addEventListener('change', (e) => toggleTipoPrecio(e.target.value));

  // ── Iniciar ──────────────────────────────────────────────────────────────────
  await cargarCategorias();
  await cargarProductos();
});

