/* pos.js — Punto de Venta con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI, getCurrentUser } from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatCurrency, formatDate, formatInitials } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';
import { requireAsistencia, actualizarIndicadorSidebar } from '../../utils/asistencia-guard.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth();
  await initUI(_usuario);
  actualizarIndicadorSidebar();

  const el = (id) => document.getElementById(id);

  let productosCache          = [];
  let carrito                 = [];   // Productos físicos (con stock)
  let complementos            = [];   // Lunas, tratamientos, servicios (sin stock)
  let currentProductoVariable = null; // Producto variable esperando que el vendedor ingrese el precio

  // ── Estado del sistema de descuentos ─────────────────────────────────────────
  let descGlobalTipo   = 'ninguno';    // 'ninguno' | 'general' | 'por_producto'
  let descGeneralTipo  = 'porcentaje'; // 'porcentaje' | 'monto_fijo'
  let descGeneralValor = 0;

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
    let q = supabase.from('productos').select('id, nombre, marca, precio_venta, precio_compra, tipo_precio, precio_minimo, precio_maximo, stock_actual, imagen_url, categorias(nombre)').eq('activo', true).order('nombre');
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
          ${p.tipo_precio === 'variable'
            ? `<div class="product-card-price" style="font-size:.73rem;color:var(--c-accent);font-weight:700;">S/ ${(p.precio_minimo||0).toFixed(2)} – ${(p.precio_maximo||0).toFixed(2)}</div>`
            : `<div class="product-card-price">${formatCurrency(p.precio_venta)}</div>`}
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
    // Si es precio variable y aún no está en el carrito → pedir precio al vendedor
    if (producto.tipo_precio === 'variable' && !existing) {
      abrirModalPrecioVariable(producto); return;
    }
    if (existing) {
      if (existing.qty >= producto.stock_actual) {
        showToast('No hay suficiente stock disponible.', 'warning'); return;
      }
      existing.qty++;
    } else {
      carrito.push({ id, nombre: producto.nombre, precio: producto.precio_venta, precioOriginal: producto.precio_venta, qty: 1, stock: producto.stock_actual, descItemTipo: 'ninguno', descItemValor: 0, costo: producto.precio_compra || 0 });
    }
    renderCarrito();
  }

  function quitarDelCarrito(id) {
    carrito = carrito.filter(i => i.id !== id);
    renderCarrito();
  }

  // ── Modal precio variable ─────────────────────────────────────────────────────
  function abrirModalPrecioVariable(producto) {
    currentProductoVariable = producto;
    const minF = (producto.precio_minimo || 0).toFixed(2);
    const maxF = (producto.precio_maximo || 0).toFixed(2);
    el('precio-var-nombre').textContent = producto.nombre;
    el('precio-var-rango').textContent  = `S/ ${minF} – S/ ${maxF}`;
    const inp = el('precio-var-input');
    if (inp) { inp.value = ''; inp.min = producto.precio_minimo || 0; inp.max = producto.precio_maximo || ''; }
    const err = el('precio-var-error');
    if (err) err.style.display = 'none';
    el('modal-precio-variable')?.classList.add('open');
    setTimeout(() => el('precio-var-input')?.focus(), 60);
  }

  function cerrarModalPrecioVariable() {
    el('modal-precio-variable')?.classList.remove('open');
    currentProductoVariable = null;
  }

  function confirmarPrecioVariable() {
    const prod   = currentProductoVariable;
    if (!prod) return;
    const precio = parseFloat(el('precio-var-input')?.value || 0);
    const min    = prod.precio_minimo ?? 0;
    const max    = prod.precio_maximo ?? Infinity;
    const err    = el('precio-var-error');
    if (!precio || precio < min || precio > max) {
      if (err) { err.textContent = 'El precio ingresado está fuera del rango permitido.'; err.style.display = 'block'; }
      return;
    }
    if (err) err.style.display = 'none';
    cerrarModalPrecioVariable();
    carrito.push({ id: prod.id, nombre: prod.nombre, precio, precioOriginal: precio, qty: 1, stock: prod.stock_actual, esVariable: true, descItemTipo: 'ninguno', descItemValor: 0, costo: prod.precio_compra || 0 });
    renderCarrito();
    showToast(`${prod.nombre} agregado — ${formatCurrency(precio)}`, 'success');
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
    let html = carrito.map(item => {
      const tieneDesc = descGlobalTipo === 'por_producto' && item.descItemTipo !== 'ninguno';
      const dV = item.descItemValor || 0;

      const precioLineHTML = tieneDesc
        ? `<div class="item-precio-display" data-id="${item.id}" style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap;margin-top:1px;">
            <span style="text-decoration:line-through;color:var(--c-ink-faint);font-size:.76rem;">${formatCurrency(item.precioOriginal ?? item.precio)}</span>
            <span style="color:var(--c-success);font-weight:600;">${formatCurrency(item.precio)}</span>
            <span style="color:var(--c-danger);font-size:.7rem;">-${item.descItemTipo === 'porcentaje' ? Math.min(100, dV).toFixed(1) + '%' : formatCurrency(dV)}</span>
          </div>`
        : `<div class="item-precio-display cart-item-price" data-id="${item.id}">${formatCurrency(item.precio)} c/u</div>`;

      const descItemCtrl = descGlobalTipo === 'por_producto'
        ? `<div class="item-desc-ctrl">
            <select class="item-desc-tipo-sel" data-id="${item.id}">
              <option value="ninguno" ${item.descItemTipo === 'ninguno' ? 'selected' : ''}>Sin desc.</option>
              <option value="porcentaje" ${item.descItemTipo === 'porcentaje' ? 'selected' : ''}>%</option>
              <option value="monto_fijo" ${item.descItemTipo === 'monto_fijo' ? 'selected' : ''}>S/</option>
            </select>
            ${item.descItemTipo !== 'ninguno' ? `
            <input type="number" class="item-desc-val-inp" data-id="${item.id}"
              value="${dV > 0 ? dV : ''}" min="0" step="0.01" placeholder="0" />` : ''}
          </div>` : '';

      return `<div class="cart-item" data-id="${item.id}">
        <div style="flex:1;min-width:0;">
          <div class="cart-item-name">${esc(item.nombre)}</div>
          ${precioLineHTML}
          ${descItemCtrl}
        </div>
        <div class="cart-qty">
          <button class="qty-btn btn-dec" data-id="${item.id}">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn btn-inc" data-id="${item.id}">+</button>
        </div>
        <span class="cart-item-total item-total-display" data-id="${item.id}">${formatCurrency(item.precio * item.qty)}</span>
        <button class="btn-remove-item btn-remove-prod" data-id="${item.id}" title="Quitar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');

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

    // ── Listeners: descuento por producto ──
    itemsEl.querySelectorAll('.item-desc-tipo-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const id   = Number(sel.dataset.id);
        const item = carrito.find(i => i.id === id);
        if (!item) return;
        item.descItemTipo  = sel.value;
        item.descItemValor = 0;
        item.precio        = item.precioOriginal ?? item.precio;
        renderCarrito();
      });
    });
    itemsEl.querySelectorAll('.item-desc-val-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const id    = Number(inp.dataset.id);
        const item  = carrito.find(i => i.id === id);
        if (!item) return;
        const valor = Math.max(0, parseFloat(inp.value) || 0);
        item.descItemValor = valor;
        const orig = item.precioOriginal ?? item.precio;
        if (item.descItemTipo === 'porcentaje') {
          item.precio = Math.max(0, orig * (1 - Math.min(100, valor) / 100));
        } else {
          item.precio = Math.max(0, orig - valor);
        }
        actualizarTotales();
      });
      inp.addEventListener('change', () => renderCarrito());
    });

    actualizarTotales();
  }

  function calcularTotalesDescuento() {
    const subProdFinal  = carrito.reduce((s, i) => s + i.precio * i.qty, 0);
    const subProdOrigin = carrito.reduce((s, i) => s + (i.precioOriginal ?? i.precio) * i.qty, 0);
    const subComp       = complementos.reduce((s, c) => s + c.precio * c.qty, 0);
    const subtotalBruto = subProdOrigin + subComp;
    let descMonto = 0;

    if (descGlobalTipo === 'general') {
      const base = subProdFinal + subComp;
      if (descGeneralTipo === 'porcentaje') {
        descMonto = base * (Math.max(0, Math.min(100, descGeneralValor)) / 100);
      } else {
        descMonto = Math.min(Math.max(0, descGeneralValor), base);
      }
    } else if (descGlobalTipo === 'por_producto') {
      descMonto = Math.max(0, subProdOrigin - subProdFinal);
    }

    const total = Math.max(0, subtotalBruto - descMonto);
    return { subtotal: subtotalBruto, descMonto, total };
  }

  function actualizarTotales() {
    // Actualizar precio/total por ítem sin re-renderizar el carrito
    carrito.forEach(item => {
      const totalEl = document.querySelector(`.item-total-display[data-id="${item.id}"]`);
      const precEl  = document.querySelector(`.item-precio-display[data-id="${item.id}"]`);
      if (totalEl) totalEl.textContent = formatCurrency(item.precio * item.qty);
      if (precEl && descGlobalTipo === 'por_producto' && item.descItemTipo !== 'ninguno') {
        const dV   = item.descItemValor || 0;
        const orig = item.precioOriginal ?? item.precio;
        precEl.innerHTML = `
          <span style="text-decoration:line-through;color:var(--c-ink-faint);font-size:.76rem;">${formatCurrency(orig)}</span>
          <span style="color:var(--c-success);font-weight:600;margin-left:3px;">${formatCurrency(item.precio)}</span>
          <span style="color:var(--c-danger);font-size:.7rem;margin-left:3px;">-${item.descItemTipo === 'porcentaje' ? Math.min(100, dV).toFixed(1) + '%' : formatCurrency(dV)}</span>`;
      }
    });
    const { subtotal, descMonto, total } = calcularTotalesDescuento();
    if (el('cart-subtotal')) el('cart-subtotal').textContent = formatCurrency(subtotal);
    if (el('cart-total'))    el('cart-total').textContent    = formatCurrency(total);
    const rowDesc = el('row-desc-monto');
    const descEl  = el('cart-descuento-monto');
    if (rowDesc) rowDesc.style.display = descMonto > 0 ? '' : 'none';
    if (descEl)  descEl.textContent    = `- ${formatCurrency(descMonto)}`;
  }

  function resetDescuentoUI() {
    descGlobalTipo   = 'ninguno';
    descGeneralTipo  = 'porcentaje';
    descGeneralValor = 0;
    carrito.forEach(item => { item.descItemTipo = 'ninguno'; item.descItemValor = 0; item.precio = item.precioOriginal ?? item.precio; });
    const rN = document.querySelector('input[name="desc-tipo"][value="ninguno"]');
    if (rN) rN.checked = true;
    const pg = el('panel-desc-general');
    if (pg) pg.style.display = 'none';
    const ig = el('input-desc-general');
    if (ig) ig.value = '';
    const rP = document.querySelector('input[name="desc-general-tipo"][value="porcentaje"]');
    if (rP) rP.checked = true;
    const dp = el('desc-general-prefix');
    if (dp) dp.textContent = '%';
  }

  // ── Listeners: sistema de descuentos ─────────────────────────────────────────
  document.querySelectorAll('input[name="desc-tipo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const old = descGlobalTipo;
      descGlobalTipo = radio.value;
      const pg = el('panel-desc-general');
      if (pg) pg.style.display = descGlobalTipo === 'general' ? '' : 'none';
      if (old === 'por_producto' && descGlobalTipo !== 'por_producto') {
        carrito.forEach(item => { item.descItemTipo = 'ninguno'; item.descItemValor = 0; item.precio = item.precioOriginal ?? item.precio; });
      }
      if (descGlobalTipo === 'por_producto') { descGeneralValor = 0; }
      renderCarrito();
    });
  });

  document.querySelectorAll('input[name="desc-general-tipo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      descGeneralTipo = radio.value;
      const dp = el('desc-general-prefix');
      if (dp) dp.textContent = descGeneralTipo === 'porcentaje' ? '%' : 'S/';
      const ig = el('input-desc-general');
      if (ig) ig.value = '';
      descGeneralValor = 0;
      actualizarTotales();
    });
  });

  el('input-desc-general')?.addEventListener('input', () => {
    descGeneralValor = Math.max(0, parseFloat(el('input-desc-general')?.value || 0) || 0);
    actualizarTotales();
  });

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

  // ── Listeners: modal precio variable ─────────────────────────────────────────
  el('btn-close-precio-var')?.addEventListener('click',    cerrarModalPrecioVariable);
  el('btn-cancelar-precio-var')?.addEventListener('click', cerrarModalPrecioVariable);
  el('btn-confirmar-precio-var')?.addEventListener('click', confirmarPrecioVariable);
  el('precio-var-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarPrecioVariable(); });

  // ── Pagos múltiples ───────────────────────────────────────────────────────────
  // Estado: array de {metodo, monto}. Con un solo elemento = pago simple (default).
  let pagosSeleccionados = [{ metodo: 'efectivo', monto: 0 }];

  const METODOS_LABEL = {
    efectivo:      'Efectivo',
    tarjeta:       'Tarjeta',
    transferencia: 'Transferencia',
    yape:          'Yape',
    plin:          'Plin',
  };

  function getPagoDisplay(pagos, conMontos = false) {
    if (!pagos || pagos.length === 0) return 'Efectivo';
    if (pagos.length === 1) return METODOS_LABEL[pagos[0].metodo] || pagos[0].metodo;
    return pagos.map(p =>
      conMontos ? `${METODOS_LABEL[p.metodo] || p.metodo}: ${formatCurrency(p.monto)}`
                : (METODOS_LABEL[p.metodo] || p.metodo)
    ).join(' + ');
  }

  // Actualiza el UI de chips y campos de monto
  function actualizarPagoUI() {
    const metodosActivos = pagosSeleccionados.map(p => p.metodo);
    document.querySelectorAll('.pago-chip').forEach(chip => {
      chip.classList.toggle('active', metodosActivos.includes(chip.dataset.metodo));
    });

    const montosEl    = el('pago-montos');
    const pendienteEl = el('pago-pendiente');

    if (pagosSeleccionados.length <= 1) {
      if (montosEl)    { montosEl.style.display    = 'none'; montosEl.innerHTML = ''; }
      if (pendienteEl) { pendienteEl.style.display = 'none'; pendienteEl.textContent = ''; }
      return;
    }

    // Modo dividido: mostrar inputs de monto por cada método
    if (montosEl) {
      montosEl.style.display = 'flex';
      montosEl.innerHTML = pagosSeleccionados.map((p, i) => `
        <div class="pago-monto-row">
          <span class="pago-monto-label">${esc(METODOS_LABEL[p.metodo] || p.metodo)}</span>
          <div class="pago-monto-wrap">
            <span class="pago-monto-prefix">S/</span>
            <input class="pago-monto-inp" type="number"
              data-idx="${i}" min="0.01" step="0.01" placeholder="0.00"
              value="${p.monto > 0 ? p.monto : ''}" />
          </div>
        </div>`).join('');

      montosEl.querySelectorAll('.pago-monto-inp').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = parseInt(inp.dataset.idx);
          if (pagosSeleccionados[idx]) pagosSeleccionados[idx].monto = parseFloat(inp.value) || 0;
          refrescarPendiente();
        });
      });
    }
    refrescarPendiente();
  }

  function refrescarPendiente() {
    const pendienteEl = el('pago-pendiente');
    if (!pendienteEl || pagosSeleccionados.length <= 1) return;
    const { total } = calcularTotalesDescuento();
    const sumado = pagosSeleccionados.reduce((s, p) => s + p.monto, 0);
    const diff   = Math.round((total - sumado) * 100) / 100;
    if (Math.abs(diff) < 0.01) {
      pendienteEl.style.display  = 'none';
      pendienteEl.textContent    = '';
    } else {
      pendienteEl.style.display  = 'block';
      pendienteEl.style.color    = 'var(--c-danger)';
      pendienteEl.textContent    = diff > 0
        ? `Falta: S/ ${diff.toFixed(2)}`
        : `Excede: S/ ${Math.abs(diff).toFixed(2)}`;
    }
  }

  // Inicializar chips al cargar
  document.querySelectorAll('.pago-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const metodo = chip.dataset.metodo;
      const idx    = pagosSeleccionados.findIndex(p => p.metodo === metodo);
      if (idx >= 0) {
        // Deseleccionar — solo si hay más de 1 activo
        if (pagosSeleccionados.length > 1) pagosSeleccionados.splice(idx, 1);
      } else {
        // Seleccionar: añadir con monto 0
        pagosSeleccionados.push({ metodo, monto: 0 });
      }
      actualizarPagoUI();
    });
  });
  actualizarPagoUI(); // estado inicial

  // ── Modal de confirmación de venta ───────────────────────────────────────────

  function mostrarModalConfirmacion() {
    const { subtotal, descMonto, total } = calcularTotalesDescuento();
    const pacEl      = el('select-paciente');
    const pacNombre  = pacEl?.options[pacEl.selectedIndex]?.text || 'Sin paciente';
    const pagoDisplay = getPagoDisplay(pagosSeleccionados, pagosSeleccionados.length > 1);

    const body = el('confirmar-body');
    if (!body) return;

    // Filas de productos físicos
    const filasProductos = carrito.map(item => {
      const hayDescItem = descGlobalTipo === 'por_producto' && item.descItemTipo !== 'ninguno';
      const orig = item.precioOriginal ?? item.precio;
      const precUnitHtml = hayDescItem
        ? `<span style="text-decoration:line-through;color:var(--c-ink-faint);font-size:.74rem;">${formatCurrency(orig)}</span><br>${formatCurrency(item.precio)}`
        : formatCurrency(item.precio);
      return `<tr style="border-top:1px solid var(--c-border-soft);">
        <td style="padding:9px 12px;color:var(--c-ink);font-weight:500;">${esc(item.nombre)}</td>
        <td style="padding:9px 6px;text-align:center;color:var(--c-ink-soft);">${item.qty}</td>
        <td style="padding:9px 6px;text-align:right;color:var(--c-ink-soft);">${precUnitHtml}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:600;color:var(--c-ink);">${formatCurrency(item.precio * item.qty)}</td>
      </tr>`;
    }).join('');

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
          <div style="font-weight:600;color:var(--c-ink);">${esc(pagoDisplay)}</div>
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
        ${descMonto > 0 ? `
        <div style="display:flex;justify-content:space-between;color:var(--c-ink-muted);">
          <span>Descuento${descGlobalTipo === 'general' && descGeneralTipo === 'porcentaje' ? ` (${Number.isInteger(descGeneralValor) ? descGeneralValor : descGeneralValor.toFixed(1)}%)` : ''}</span>
          <span style="color:var(--c-danger);">- ${formatCurrency(descMonto)}</span>
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

  el('btn-cobrar')?.addEventListener('click', async () => {
    if (!carrito.length && !complementos.length) return;
    if (!(await requireAsistencia('registrar ventas'))) return;

    // Validar pagos divididos antes de abrir el modal
    if (pagosSeleccionados.length > 1) {
      const { total } = calcularTotalesDescuento();
      const sumado = pagosSeleccionados.reduce((s, p) => s + p.monto, 0);
      const diff   = Math.abs(Math.round((total - sumado) * 100) / 100);
      if (diff > 0.01) {
        showToast(
          `La suma de métodos (S/ ${sumado.toFixed(2)}) debe coincidir con el total (S/ ${total.toFixed(2)}).`,
          'warning'
        );
        return;
      }
    }

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

    const { total, descMonto } = calcularTotalesDescuento();
    const pacienteId    = el('select-paciente')?.value || null;
    const metodoPrimario = pagosSeleccionados[0]?.metodo || 'efectivo';
    const currentUser   = getCurrentUser();

    // ── 1. Registrar venta ──
    // Para retrocompatibilidad: si es descuento general %, guardar fracción en columna original
    const descLegacy = descGlobalTipo === 'general' && descGeneralTipo === 'porcentaje'
      ? Math.max(0, Math.min(100, descGeneralValor)) / 100 : 0;

    const { data: venta, error: errVenta } = await supabase.from('ventas').insert({
      paciente_id:             pacienteId || null,
      total,
      descuento:               descLegacy,
      tipo_descuento:          descGlobalTipo,
      descuento_general_tipo:  descGlobalTipo === 'general' ? descGeneralTipo : null,
      descuento_general_valor: descGlobalTipo === 'general' ? descGeneralValor : null,
      metodo_pago:             metodoPrimario,
      estado:                  'completada',
      created_by:              currentUser?.id || null,
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
          venta_id:            venta.id,
          producto_id:         item.id,
          cantidad:            item.qty,
          precio_unitario:     item.precio,
          precio_original:     item.precio !== (item.precioOriginal ?? item.precio) ? (item.precioOriginal ?? null) : null,
          descuento_item_tipo: item.descItemTipo || 'ninguno',
          descuento_item_valor:(item.descItemValor || 0) > 0 ? item.descItemValor : null,
          subtotal:            item.precio * item.qty,
          costo_unitario:      item.costo || 0,
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

    // ── 5. Registrar desglose de métodos de pago ──
    const pagosAInsertar = pagosSeleccionados.length === 1
      ? [{ venta_id: venta.id, metodo: pagosSeleccionados[0].metodo, monto: total }]
      : pagosSeleccionados.map(p => ({ venta_id: venta.id, metodo: p.metodo, monto: p.monto }));

    const { error: errPagos } = await supabase.from('venta_pagos').insert(pagosAInsertar);
    if (errPagos) console.error('[venta_pagos insert]', JSON.stringify(errPagos));

    // ── 6. Cerrar confirmación y mostrar comprobante ──
    const pagosParaComprobante = [...pagosSeleccionados];
    cerrarModalConfirmacion();
    mostrarComprobante(venta, carrito, complementos, total, descMonto, pagosParaComprobante);
  });

  // ── Comprobante ───────────────────────────────────────────────────────────────
  function mostrarComprobante(venta, items, comps, total, descMonto, pagos) {
    const body = el('comprobante-body');
    if (!body) return;
    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yape: 'Yape', plin: 'Plin' };
    const pagoTexto = !pagos || pagos.length <= 1
      ? (metodosLabel[pagos?.[0]?.metodo] || pagos?.[0]?.metodo || 'Efectivo')
      : pagos.map(p => `${metodosLabel[p.metodo] || p.metodo}: ${formatCurrency(p.monto)}`).join(' + ');

    const lineasProductos = items.map(i => {
      const hayDescItem = descGlobalTipo === 'por_producto' && i.descItemTipo !== 'ninguno';
      const orig = i.precioOriginal ?? i.precio;
      const precHtml = hayDescItem
        ? `<span style="text-decoration:line-through;color:var(--c-ink-faint);font-size:.77rem;">${formatCurrency(orig * i.qty)}</span> <span style="font-weight:600;">${formatCurrency(i.precio * i.qty)}</span>`
        : `<span style="font-weight:600;">${formatCurrency(i.precio * i.qty)}</span>`;
      return `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span>${esc(i.nombre)} ×${i.qty}</span>
        <span>${precHtml}</span>
      </div>`;
    }).join('');

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
        ${descMonto > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-top:4px;margin-bottom:2px;font-size:.8rem;color:var(--c-danger);">
          <span>${descGlobalTipo === 'por_producto' ? 'Ahorro total' : 'Descuento'}</span>
          <span>- ${formatCurrency(descMonto)}</span>
        </div>` : ''}
        <div style="border-top:1px dashed var(--c-border);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;font-weight:700;">
          <span>TOTAL</span><span style="color:var(--c-success);">${formatCurrency(total)}</span>
        </div>
        <div style="margin-top:4px;font-size:.76rem;color:var(--c-ink-muted);">Pago: ${esc(pagoTexto)}</div>
      </div>`;

    el('modal-comprobante')?.classList.add('open');

    // Limpiar carrito, complementos, descuento y resetear métodos de pago
    carrito      = [];
    complementos = [];
    resetDescuentoUI();
    pagosSeleccionados = [{ metodo: 'efectivo', monto: 0 }];
    actualizarPagoUI();
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
    if (ok) {
      carrito = []; complementos = [];
      resetDescuentoUI();
      pagosSeleccionados = [{ metodo: 'efectivo', monto: 0 }];
      actualizarPagoUI();
      renderCarrito();
    }
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
      cerrarModalPrecioVariable();
      el('modal-comprobante')?.classList.remove('open');
    }
  });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await Promise.all([cargarCategorias(), cargarPacientes(), cargarProductos()]);
});
