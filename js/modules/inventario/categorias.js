/* categorias.js — CRUD de tipos de producto con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { esc }            from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth(['admin']);
  await initUI(_usuario);

  const el  = (id) => document.getElementById(id);
  const all = (sel) => document.querySelectorAll(sel);

  let categoriasCache = [];
  let busqueda        = '';
  let vistaActual     = 'cards';

  // ── Cargar categorías ────────────────────────────────────────────────────────
  async function cargarCategorias() {
    let query = supabase
      .from('categorias')
      .select('*, productos(count)')
      .order('nombre');

    if (busqueda) {
      query = query.or(`nombre.ilike.%${busqueda}%,descripcion.ilike.%${busqueda}%`);
    }

    const { data, error } = await query;
    if (error) { showToast('Error al cargar tipos de producto.', 'error'); return; }

    categoriasCache = (data || []).map(c => ({
      ...c,
      total_productos: c.productos?.[0]?.count ?? 0,
    }));

    actualizarSubtitulo(categoriasCache.length);
    renderCards(categoriasCache);
    renderTabla(categoriasCache);
  }

  function actualizarSubtitulo(total) {
    const sub = el('subtitle-contador');
    if (sub) sub.textContent = `${total} tipo${total !== 1 ? 's' : ''} de producto registrado${total !== 1 ? 's' : ''}`;
  }

  // ── Render cards ─────────────────────────────────────────────────────────────
  function renderCards(cats) {
    const grid       = el('grid-categorias');
    const emptyState = el('empty-state');
    if (!grid) return;

    if (!cats.length) {
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';

    grid.innerHTML = cats.map((c, i) => {
      const inicial = (c.nombre?.[0] || '?').toUpperCase();
      const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' }) : '—';
      return `
        <div class="categoria-card" style="animation-delay:${i * 0.06}s" data-id="${c.id}">
          <div class="cat-card-top">
            <div class="cat-icon-initial">${esc(inicial)}</div>
            <div class="cat-card-actions">
              <button class="btn-icon" title="Editar"   data-action="editar"   data-id="${c.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon --danger" title="Eliminar" data-action="eliminar" data-id="${c.id}" data-nombre="${esc(c.nombre)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
          </div>
          <div>
            <div class="cat-nombre">${esc(c.nombre)}</div>
            ${c.descripcion ? `<p class="cat-descripcion">${esc(c.descripcion)}</p>` : ''}
          </div>
          <div class="cat-footer">
            <div class="cat-contador"><strong>${c.total_productos ?? 0}</strong><span>producto${(c.total_productos ?? 0) !== 1 ? 's' : ''}</span></div>
            <span class="cat-fecha">${fecha}</span>
          </div>
        </div>`;
    }).join('');
  }

  // ── Render tabla ─────────────────────────────────────────────────────────────
  function renderTabla(cats) {
    const tbody = el('tbody-categorias');
    if (!tbody) return;

    if (!cats.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--c-ink-faint);">Sin resultados</td></tr>`;
      return;
    }

    tbody.innerHTML = cats.map(c => {
      const inicial = (c.nombre?.[0] || '?').toUpperCase();
      const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' }) : '—';
      return `
        <tr>
          <td><div class="td-nombre"><span class="cat-initial-badge">${esc(inicial)}</span>${esc(c.nombre)}</div></td>
          <td><span class="td-descripcion">${c.descripcion ? esc(c.descripcion) : ''}</span></td>
          <td><div class="productos-count">${c.total_productos ?? 0}<span>productos</span></div></td>
          <td style="font-size:.8rem;color:var(--c-ink-muted);">${fecha}</td>
          <td>
            <div class="td-acciones">
              <button class="btn-icon" title="Editar"   data-action="editar"   data-id="${c.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon --danger" title="Eliminar" data-action="eliminar" data-id="${c.id}" data-nombre="${esc(c.nombre)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Delegación de eventos (UNA vez, en contenedores fijos) ──────────────────
  function manejarAccion(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = Number(btn.dataset.id);
    const accion = btn.dataset.action;
    if (accion === 'editar')   { const c = categoriasCache.find(x => x.id === id); if (c) abrirModal(c); }
    if (accion === 'eliminar') { abrirConfirm(id, btn.dataset.nombre || ''); }
  }

  el('grid-categorias')?.addEventListener('click',  manejarAccion);
  el('tbody-categorias')?.addEventListener('click', manejarAccion);

  // ── Modal crear / editar ─────────────────────────────────────────────────────
  function abrirModal(categoria = null) {
    const form = el('form-categoria');
    form.reset();
    el('modal-error').hidden   = true;
    el('error-nombre').hidden  = true;

    if (categoria) {
      el('input-categoria-id').value = categoria.id;
      el('input-nombre').value       = categoria.nombre      || '';
      el('input-descripcion').value  = categoria.descripcion || '';
      el('modal-title').textContent       = 'Editar Tipo de Producto';
      el('modal-subtitle').textContent    = categoria.nombre;
      el('btn-guardar-texto').textContent = 'Guardar cambios';
    } else {
      el('input-categoria-id').value      = '';
      el('modal-title').textContent       = 'Nuevo Tipo de Producto';
      el('modal-subtitle').textContent    = 'Organiza tus productos';
      el('btn-guardar-texto').textContent = 'Guardar';
    }

    el('modal-overlay').classList.add('active');
    setTimeout(() => el('input-nombre').focus(), 80);
  }

  function cerrarModal() {
    el('modal-overlay').classList.remove('active');
    el('modal-error').hidden = true;
  }

  el('btn-nueva-categoria')?.addEventListener('click',   () => abrirModal(null));
  el('btn-nueva-desde-empty')?.addEventListener('click', () => abrirModal(null));
  el('btn-cerrar-modal')?.addEventListener('click',      cerrarModal);
  el('btn-cancelar-modal')?.addEventListener('click',    cerrarModal);
  el('modal-overlay')?.addEventListener('click', (e) => { if (e.target === el('modal-overlay')) cerrarModal(); });

  // ── Submit ───────────────────────────────────────────────────────────────────
  el('form-categoria')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = el('input-nombre').value.trim();
    if (!nombre) {
      el('error-nombre').textContent = 'El nombre es requerido';
      el('error-nombre').hidden = false;
      el('input-nombre').focus();
      return;
    }

    const id = Number(el('input-categoria-id').value) || null;
    const data = {
      nombre,
      descripcion: el('input-descripcion').value.trim() || null,
    };

    const btn = el('btn-guardar') || el('form-categoria').querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    if (id) {
      await actualizarCategoria(id, data);
    } else {
      await crearCategoria(data);
    }

    if (btn) btn.disabled = false;
  });

  // ── Modal confirmación eliminar ──────────────────────────────────────────────
  let idParaEliminar = null;

  function abrirConfirm(id, nombre) {
    idParaEliminar = id;
    const msg = el('confirm-message');
    if (msg) msg.textContent = `¿Eliminar el tipo de producto "${nombre}"?`;
    el('modal-confirm-overlay')?.classList.add('active');
  }

  function cerrarConfirm() {
    el('modal-confirm-overlay')?.classList.remove('active');
    idParaEliminar = null;
  }

  el('btn-confirm-cancelar')?.addEventListener('click', cerrarConfirm);
  el('modal-confirm-overlay')?.addEventListener('click', (e) => { if (e.target === el('modal-confirm-overlay')) cerrarConfirm(); });
  el('btn-confirm-ok')?.addEventListener('click', async () => {
    if (idParaEliminar !== null) {
      await eliminarCategoria(idParaEliminar);
      cerrarConfirm();
    }
  });

  // ── CRUD Supabase ────────────────────────────────────────────────────────────
  async function crearCategoria(data) {
    const { error } = await supabase.from('categorias').insert(data);
    if (error) {
      el('modal-error').textContent = error.message?.includes('unique') ? 'Ya existe un tipo de producto con ese nombre.' : 'Error al guardar.';
      el('modal-error').hidden = false;
      return;
    }
    cerrarModal();
    showToast('Tipo de producto creado.', 'success');
    cargarCategorias();
  }

  async function actualizarCategoria(id, data) {
    const { error } = await supabase.from('categorias').update(data).eq('id', id);
    if (error) {
      el('modal-error').textContent = 'Error al actualizar.';
      el('modal-error').hidden = false;
      return;
    }
    cerrarModal();
    showToast('Tipo de producto actualizado.', 'success');
    cargarCategorias();
  }

  async function eliminarCategoria(id) {
    const { error } = await supabase.from('categorias').delete().eq('id', id);
    if (error) {
      showToast(error.message?.includes('foreign') ? 'No puedes eliminar un tipo de producto con productos asociados.' : 'Error al eliminar.', 'error');
      return;
    }
    showToast('Tipo de producto eliminado.', 'success');
    cargarCategorias();
  }

  // ── Búsqueda ─────────────────────────────────────────────────────────────────
  let timer;
  el('input-busqueda')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { busqueda = e.target.value.trim(); cargarCategorias(); }, 250);
  });

  // ── Toggle vista ─────────────────────────────────────────────────────────────
  el('btn-vista-cards')?.addEventListener('click', () => {
    vistaActual = 'cards';
    el('vista-cards').style.display = 'block';
    el('vista-tabla').style.display = 'none';
    el('btn-vista-cards')?.classList.add('active');
    el('btn-vista-tabla')?.classList.remove('active');
  });

  el('btn-vista-tabla')?.addEventListener('click', () => {
    vistaActual = 'tabla';
    el('vista-cards').style.display = 'none';
    el('vista-tabla').style.display = 'block';
    el('btn-vista-tabla')?.classList.add('active');
    el('btn-vista-cards')?.classList.remove('active');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { cerrarModal(); cerrarConfirm(); }
  });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarCategorias();
});
