/* pos.js — Punto de Venta con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI, getCurrentUser } from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatCurrency, formatDate, formatInitials } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth();
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);

  let productosCache = [];
  let carrito        = [];   // Productos físicos (con stock)
  let complementos   = [];   // Lunas, tratamientos, servicios (sin stock)

  // ── Cargar categorías ─────────────────────────────────────────────────────────
  async function cargarCategorias() {
    const { data } = await supabase.from('categorias').select('id, nombre').order('nombre');
    const sel = el('select-categoria');
    (data || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.nombre;
      sel?.appendChild(opt);
    });
  }

  // ── Cargar pacientes para el select del carrito ───────────────────────────────
  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes').select('id, nombres, apellidos').eq('activo', true).order('apellidos');
    const sel = el('select-paciente');
    (data || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = `${p.apellidos}, ${p.nombres}`;
      sel?.appendChild(opt);
    });
  }

  // ── Cargar productos ──────────────────────────────────────────────────────────
  async function cargarProductos(busqueda = '', categoriaId = '') {
    let q = supabase.from('productos').select('id, nombre, marca, precio_venta, stock_actual, imagen_url, categorias(nombre)').eq('activo', true).order('nombre');
    if (busqueda)    q = q.or(`nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,codigo_barras.ilike.%${busqueda}%`);
    if (categoriaId) q = q.eq('categoria_id', categoriaId);
    const { data } = await q;
    productosCache = data || [];
    renderProductos(productosCache);
  }

  // ── Render catálogo ───────────────────────────────────────────────────────────
  function renderProductos(productos) {
    const grid = el('product-grid');
    if (!grid) return;
    if (!productos.length) {
      grid.innerHTML = '<p style="color:var(--c-ink-muted);font-size:.83rem;grid-column:1/-1;padding:20px 0;">Sin productos disponibles.</p>';
      return;
    }
    grid.innerHTML = productos.map(p => {
      const sinStock = p.stock_actual <= 0;
      return `
        <div class="product-card ${sinStock ? 'out-of-stock' : ''}" data-id="${p.id}">
          <div class="product-card-name">${esc(p.nombre)}</div>
          ${p.marca ? `<div class="product-card-marca">${esc(p.marca)}</div>` : ''}
          <div class="product-card-price">${formatCurrency(p.precio_venta)}</div>
          <div class="product-card-stock">${sinStock ? 'Sin stock' : `Stock: ${p.stock_actual}`}</div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
      card.addEventListener('click', () => agregarAlCarrito(Number(card.dataset.id)));
    });
  }

  // ── Carrito — productos físicos ───────────────────────────────────────────────
  function agregarAlCarrito(id) {
    const producto = productosCache.find(p => p.id === id);
    if (!producto) return;
    const existing = carrito.find(i => i.id === id);
    if (existing) {
      if (existing.qty >= producto.stock_actual) {
        showToast('No hay suficiente stock disponible.', 'warning'); return;
      }
      existing.qty++;
    } else {
      carrito.push({ id, nombre: producto.nombre, precio: producto.precio_venta, qty: 1, stock: producto.stock_actual });
    }
    renderCarrito();
  }

  function quitarDelCarrito(id) {
    carrito = carrito.filter(i => i.id !== id);
    renderCarrito();
  }

  // ── Render unificado: productos + complementos ────────────────────────────────
  function renderCarrito() {
    const itemsEl = el('cart-items');
    const countEl = el('cart-count');
    if (!itemsEl) return;

    const hayItems = carrito.length > 0 || complementos.length > 0;

    if (!hayItems) {
      itemsEl.innerHTML = `
        <div class="cart-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span>Carrito vacío</span>
          <span style="font-size:.74rem;">Haz clic en un producto o usa el botón de arriba</span>
        </div>`;
      if (el('btn-cobrar')) el('btn-cobrar').disabled = true;
      if (countEl) countEl.textContent = '0 artículos';
      actualizarTotales();
      return;
    }

    if (el('btn-cobrar')) el('btn-cobrar').disabled = false;
    const totalItems = carrito.reduce((s, i) => s + i.qty, 0) + complementos.reduce((s, c) => s + c.qty, 0);
    if (countEl) countEl.textContent = `${totalItems} artículo${totalItems !== 1 ? 's' : ''}`;

    // ── HTML productos físicos ──
    let html = carrito.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div style="flex:1;min-width:0;">
          <div class="cart-item-name">${esc(item.nombre)}</div>
          <div class="cart-item-price">${formatCurrency(item.precio)} c/u</div>
        </div>
        <div class="cart-qty">
          <button class="qty-btn btn-dec" data-id="${item.id}">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn btn-inc" data-id="${item.id}">+</button>
        </div>
        <span class="cart-item-total">${formatCurrency(item.precio * item.qty)}</span>
        <button class="btn-remove-item btn-remove-prod" data-id="${item.id}" title="Quitar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');

    // ── HTML complementos ──
    if (complementos.length) {
      html += `<div class="complemento-separator">Lunas y Tratamientos</div>`;
      html += complementos.map((c, idx) => `
        <div class="cart-item complemento-item" data-comp="${idx}">
          <div style="flex:1;min-width:0;">
            <span class="complemento-badge">${esc(c.tipo)}</span>
            ${c.descripcion ? `<div class="cart-item-name" style="margin-top:2px;">${esc(c.descripcion)}</div>` : ''}
            <div class="cart-item-price">${formatCurrency(c.precio)} c/u</div>
          </div>
          <div class="cart-qty">
            <button class="qty-btn comp-dec" data-comp="${idx}">−</button>
            <span class="qty-num">${c.qty}</span>
            <button class="qty-btn comp-inc" data-comp="${idx}">+</button>
          </div>
          <span class="cart-item-total">${formatCurrency(c.precio * c.qty)}</span>
          <button class="btn-remove-item comp-remove" data-comp="${idx}" title="Quitar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`).join('');
    }

    itemsEl.innerHTML = html;

    // ── Listeners: productos físicos ──
    itemsEl.querySelectorAll('.btn-dec').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = carrito.find(i => i.id === Number(btn.dataset.id));
        if (item && item.qty > 1) { item.qty--; renderCarrito(); }
        else quitarDelCarrito(Number(btn.dataset.id));
      });
    });
    itemsEl.querySelectorAll('.btn-inc').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = carrito.find(i => i.id === Number(btn.dataset.id));
        if (!item) return;
        if (item.qty >= item.stock) { showToast('Sin más stock disponible.', 'warning'); return; }
        item.qty++; renderCarrito();
      });
    });
    itemsEl.querySelectorAll('.btn-remove-prod').forEach(btn => {
      btn.addEventListener('click', () => quitarDelCarrito(Number(btn.dataset.id)));
    });

    // ── Listeners: complementos ──
    itemsEl.querySelectorAll('.comp-dec').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.comp);
        if (complementos[idx]?.qty > 1) { complementos[idx].qty--; renderCarrito(); }
        else { complementos.splice(idx, 1); renderCarrito(); }
      });
    });
    itemsEl.querySelectorAll('.comp-inc').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.comp);
        if (complementos[idx]) { complementos[idx].qty++; renderCarrito(); }
      });
    });
    itemsEl.querySelectorAll('.comp-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.comp);
        complementos.splice(idx, 1);
        renderCarrito();
      });
    });

    actualizarTotales();
  }

  function actualizarTotales() {
    const subProd  = carrito.reduce((s, i) => s + i.precio * i.qty, 0);
    const subComp  = complementos.reduce((s, c) => s + c.precio * c.qty, 0);
    const subtotal = subProd + subComp;
    const descuento = Math.min(Math.max(parseFloat(el('input-descuento')?.value || 0), 0), 100);
    const total     = subtotal * (1 - descuento / 100);
    if (el('cart-subtotal')) el('cart-subtotal').textContent = formatCurrency(subtotal);
    if (el('cart-total'))    el('cart-total').textContent    = formatCurrency(total);
  }

  el('input-descuento')?.addEventListener('input', actualizarTotales);

  // ── Modal complementos ────────────────────────────────────────────────────────
  function abrirModalComplemento() {
    // Limpiar campos
    const tipos = el('comp-tipo');
    if (tipos) tipos.selectedIndex = 0;
    const desc = el('comp-descripcion'); if (desc) desc.value = '';
    const prec = el('comp-precio');     if (prec) prec.value = '';
    const cant = el('comp-cantidad');   if (cant) cant.value = '1';
    el('modal-complemento')?.classList.add('open');
    setTimeout(() => el('comp-precio')?.focus(), 60);
  }

  function cerrarModalComplemento() {
    el('modal-complemento')?.classList.remove('open');
  }

  function guardarComplemento() {
    const tipo        = el('comp-tipo')?.value?.trim()        || '';
    const descripcion = el('comp-descripcion')?.value?.trim() || '';
    const precio      = parseFloat(el('comp-precio')?.value   || 0);
    const qty         = parseInt(el('comp-cantidad')?.value   || 1);

    if (!tipo)                          { showToast('Selecciona un tipo.', 'warning'); return; }
    if (isNaN(precio) || precio <= 0)   { showToast('El precio debe ser mayor a 0.', 'warning'); return; }
    if (isNaN(qty)    || qty < 1)       { showToast('La cantidad debe ser al menos 1.', 'warning'); return; }

    complementos.push({ tipo, descripcion, precio, qty });
    cerrarModalComplemento();
    renderCarrito();
    showToast(`${tipo} agregado al carrito.`, 'success');
  }

  el('btn-add-complemento')?.addEventListener('click',    abrirModalComplemento);
  el('btn-close-complemento')?.addEventListener('click',  cerrarModalComplemento);
  el('btn-cancelar-complemento')?.addEventListener('click', cerrarModalComplemento);
  el('btn-guardar-complemento')?.addEventListener('click', guardarComplemento);

  // Enviar con Enter en el campo precio
  el('comp-precio')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardarComplemento(); });

  // ── Modal de confirmación de venta ───────────────────────────────────────────
  const METODOS_LABEL = {
    efectivo:      'Efectivo',
    tarjeta:       'Tarjeta',
    transferencia: 'Transferencia',
    yape:          'Yape / Plin',
  };

  function mostrarModalConfirmacion() {
    const descuento  = Math.min(Math.max(parseFloat(el('input-descuento')?.value || 0), 0), 100);
    const subProd    = carrito.reduce((s, i) => s + i.precio * i.qty, 0);
    const subComp    = complementos.reduce((s, c) => s + c.precio * c.qty, 0);
    const subtotal   = subProd + subComp;
    const total      = subtotal * (1 - descuento / 100);
    const pagoEl     = el('select-pago');
    const pacEl      = el('select-paciente');
    const metodoPago = pagoEl?.value || 'efectivo';
    const pacNombre  = pacEl?.options[pacEl.selectedIndex]?.text || 'Sin paciente';

    const body = el('confirmar-body');
    if (!body) return;

    // Filas de productos físicos
    const filasProductos = carrito.map(item => `
      <tr style="border-top:1px solid var(--c-border-soft);">
        <td style="padding:9px 12px;color:var(--c-ink);font-weight:500;">${esc(item.nombre)}</td>
        <td style="padding:9px 6px;text-align:center;color:var(--c-ink-soft);">${item.qty}</td>
        <td style="padding:9px 6px;text-align:right;color:var(--c-ink-soft);">${formatCurrency(item.precio)}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:600;color:var(--c-ink);">${formatCurrency(item.precio * item.qty)}</td>
      </tr>`).join('');

    // Sección de complementos (con encabezado separador)
    const filasComplementos = complementos.length ? `
      <tr>
        <td colspan="4" style="padding:6px 12px 4px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--c-accent);background:var(--c-accent-bg);">
          Lunas y Tratamientos
        </td>
      </tr>
      ${complementos.map(c => `
        <tr style="border-top:1px solid var(--c-border-soft);">
          <td style="padding:9px 12px;color:var(--c-ink);font-weight:500;">
            <span style="display:inline-flex;padding:1px 6px;border-radius:10px;background:var(--c-accent-bg);color:var(--c-accent);font-size:.66rem;font-weight:700;margin-right:6px;">${esc(c.tipo)}</span>
            ${c.descripcion ? esc(c.descripcion) : ''}
          </td>
          <td style="padding:9px 6px;text-align:center;color:var(--c-ink-soft);">${c.qty}</td>
          <td style="padding:9px 6px;text-align:right;color:var(--c-ink-soft);">${formatCurrency(c.precio)}</td>
          <td style="padding:9px 12px;text-align:right;font-weight:600;color:var(--c-ink);">${formatCurrency(c.precio * c.qty)}</td>
        </tr>`).join('')}` : '';

    body.innerHTML = `
      <div style="display:flex;gap:16px;margin-bottom:16px;font-size:.85rem;">
        <div style="flex:1;">
          <div style="font-size:.72rem;color:var(--c-ink-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Cliente</div>
          <div style="font-weight:600;color:var(--c-ink);">${esc(pacNombre)}</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:.72rem;color:var(--c-ink-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Método de pago</div>
          <div style="font-weight:600;color:var(--c-ink);">${esc(METODOS_LABEL[metodoPago] || metodoPago)}</div>
        </div>
      </div>
      <div style="background:var(--c-bg);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:14px;">
        <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
          <thead>
            <tr style="background:rgba(74,144,217,0.06);">
              <th style="text-align:left;padding:8px 12px;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Ítem</th>
              <th style="text-align:center;padding:8px 6px;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Cant.</th>
              <th style="text-align:right;padding:8px 6px;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase;">P. Unit.</th>
              <th style="text-align:right;padding:8px 12px;font-size:.7rem;color:var(--c-ink-muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${filasProductos}
            ${filasComplementos}
          </tbody>
        </table>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;font-size:.85rem;">
        <div style="display:flex;justify-content:space-between;color:var(--c-ink-muted);">
          <span>Subtotal</span><span>${formatCurrency(subtotal)}</span>
        </div>
        ${descuento > 0 ? `
        <div style="display:flex;justify-content:space-between;color:var(--c-ink-muted);">
          <span>Descuento (${descuento}%)</span>
          <span style="color:var(--c-danger);">- ${formatCurrency(subtotal * descuento / 100)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:.95rem;padding-top:8px;border-top:1px solid var(--c-border);margin-top:4px;">
          <span>TOTAL</span>
          <span style="color:var(--c-success);">${formatCurrency(total)}</span>
        </div>
      </div>`;

    const btnConf = el('btn-confirmar-venta');
    if (btnConf) {
      btnConf.disabled = false;
      btnConf.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Confirmar Venta`;
    }

    el('modal-confirmar-venta')?.classList.add('open');
    btnConf?.focus();
  }

  function cerrarModalConfirmacion() {
    el('modal-confirmar-venta')?.classList.remove('open');
  }

  el('btn-cobrar')?.addEventListener('click', () => {
    if (!carrito.length && !complementos.length) return;
    mostrarModalConfirmacion();
  });

  el('btn-cancelar-confirmar')?.addEventListener('click', cerrarModalConfirmacion);
  el('btn-close-confirmar')?.addEventListener('click',    cerrarModalConfirmacion);

  // ── Confirmar y guardar venta ─────────────────────────────────────────────────
  el('btn-confirmar-venta')?.addEventListener('click', async () => {
    const btn = el('btn-confirmar-venta');
    if (btn?.disabled) return;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:pos-spin .65s linear infinite;vertical-align:middle;margin-right:6px;"></span>
        Procesando…`;
    }

    const descuento   = parseFloat(el('input-descuento')?.value || 0);
    const subProd     = carrito.reduce((s, i) => s + i.precio * i.qty, 0);
    const subComp     = complementos.reduce((s, c) => s + c.precio * c.qty, 0);
    const subtotal    = subProd + subComp;
    const total       = subtotal * (1 - descuento / 100);
    const pacienteId  = el('select-paciente')?.value || null;
    const metodoPago  = el('select-pago')?.value || 'efectivo';
    const currentUser = getCurrentUser();

    // ── 1. Registrar venta ──
    const { data: venta, error: errVenta } = await supabase.from('ventas').insert({
      paciente_id: pacienteId || null,
      total,
      descuento:   descuento / 100,
      metodo_pago: metodoPago,
      estado:      'completada',
      created_by:  currentUser?.id || null,
    }).select().single();

    if (errVenta) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar Venta`;
      }
      showToast('Error al registrar la venta. Intenta de nuevo.', 'error');
      return;
    }

    // ── 2. Registrar detalle de productos físicos ──
    if (carrito.length) {
      const { error: errDet } = await supabase.from('detalle_ventas').insert(
        carrito.map(item => ({
          venta_id:        venta.id,
          producto_id:     item.id,
          cantidad:        item.qty,
          precio_unitario: item.precio,
          subtotal:        item.precio * item.qty,
        }))
      );
      if (errDet) showToast('Venta creada pero error en detalle de productos. Contacta soporte.', 'warning');
    }

    // ── 3. Descontar stock de productos físicos ──
    for (const item of carrito) {
      const { error: errRpc } = await supabase.rpc('ajustar_stock_pos', {
        p_producto_id: item.id,
        p_cantidad:    item.qty,
        p_venta_id:    venta.id,
      });
      if (errRpc) {
        console.error('[ajustar_stock_pos]', JSON.stringify(errRpc));
        showToast(`Stock de "${item.nombre}" no actualizado. Revisa en el módulo de stock.`, 'warning');
      }
    }

    // ── 4. Registrar complementos (lunas, tratamientos) — SIN descontar stock ──
    if (complementos.length) {
      const { error: errComp } = await supabase.from('venta_complementos').insert(
        complementos.map(c => ({
          venta_id:    venta.id,
          tipo:        c.tipo,
          descripcion: c.descripcion || null,
          precio:      c.precio,
          cantidad:    c.qty,
          subtotal:    parseFloat((c.precio * c.qty).toFixed(2)),
        }))
      );
      if (errComp) {
        console.error('[venta_complementos]', JSON.stringify(errComp));
        showToast('Venta guardada, pero los complementos no se registraron. Contacta soporte.', 'warning');
      }
    }

    // ── 5. Cerrar confirmación y mostrar comprobante ──
    cerrarModalConfirmacion();
    mostrarComprobante(venta, carrito, complementos, total, metodoPago);
  });

  // ── Comprobante ───────────────────────────────────────────────────────────────
  function mostrarComprobante(venta, items, comps, total, metodoPago) {
    const body = el('comprobante-body');
    if (!body) return;
    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yape: 'Yape / Plin' };

    const lineasProductos = items.map(i =>
      `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
         <span>${esc(i.nombre)} ×${i.qty}</span>
         <span style="font-weight:600;">${formatCurrency(i.precio * i.qty)}</span>
       </div>`
    ).join('');

    const lineasComplementos = comps.length ? `
      <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--c-accent);margin:8px 0 4px;">
        Lunas y Tratamientos
      </div>
      ${comps.map(c =>
        `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
           <span>${esc(c.tipo)}${c.descripcion ? ` — ${esc(c.descripcion)}` : ''} ×${c.qty}</span>
           <span style="font-weight:600;">${formatCurrency(c.precio * c.qty)}</span>
         </div>`
      ).join('')}` : '';

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:rgba(46,158,107,.12);margin:0 auto 12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2e9e6b" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <p style="text-align:center;font-size:.85rem;color:var(--c-ink-muted);">N° ${esc(String(venta.id))}</p>
      <div style="background:var(--c-bg);border-radius:var(--radius-sm);padding:12px 14px;font-size:.83rem;">
        ${lineasProductos}
        ${lineasComplementos}
        <div style="border-top:1px dashed var(--c-border);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;font-weight:700;">
          <span>TOTAL</span><span style="color:var(--c-success);">${formatCurrency(total)}</span>
        </div>
        <div style="margin-top:4px;font-size:.76rem;color:var(--c-ink-muted);">Pago: ${esc(metodosLabel[metodoPago] || metodoPago)}</div>
      </div>`;

    el('modal-comprobante')?.classList.add('open');

    // Limpiar carrito y complementos
    carrito      = [];
    complementos = [];
    renderCarrito();
    cargarProductos(el('input-busqueda')?.value || '', el('select-categoria')?.value || '');
  }

  el('btn-close-comprobante')?.addEventListener('click',   () => el('modal-comprobante')?.classList.remove('open'));
  el('btn-close-comprobante-2')?.addEventListener('click', () => el('modal-comprobante')?.classList.remove('open'));
  el('btn-nueva-venta')?.addEventListener('click',         () => el('modal-comprobante')?.classList.remove('open'));

  // ── Limpiar carrito ───────────────────────────────────────────────────────────
  el('btn-limpiar')?.addEventListener('click', async () => {
    if (!carrito.length && !complementos.length) return;
    const ok = await confirmDialog('¿Vaciar el carrito?', { title: 'Limpiar carrito' });
    if (ok) { carrito = []; complementos = []; renderCarrito(); }
  });

  // ── Búsqueda y filtros ───────────────────────────────────────────────────────
  let timer;
  el('input-busqueda')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      cargarProductos(e.target.value.trim(), el('select-categoria')?.value || '');
    }, 280);
  });

  el('select-categoria')?.addEventListener('change', (e) => {
    cargarProductos(el('input-busqueda')?.value.trim() || '', e.target.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarModalComplemento();
      cerrarModalConfirmacion();
      el('modal-comprobante')?.classList.remove('open');
    }
  });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await Promise.all([cargarCategorias(), cargarPacientes(), cargarProductos()]);
});
