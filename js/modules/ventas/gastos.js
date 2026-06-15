/* gastos.js — Módulo Gastos: admin (global) + vendedor (solo propios) */
import { supabase, TABLAS }           from '../../config/supabase.js';
import { checkAuth }                  from '../../core/auth.js';
import { initUI, getCurrentUser }     from '../../core/ui.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { showToast, confirmDialog }   from '../../utils/alerts.js';
import { fechaLima }                  from '../../utils/tiempo.js';
import { esc }                        from '../../utils/validators.js';
import { requireAsistencia, actualizarIndicadorSidebar } from '../../utils/asistencia-guard.js';

// ─── Estado ───────────────────────────────────────────────────────────────────
let _usuario    = null;
let _esAdmin    = false;
let _gastos     = [];
let _editandoId = null;

const CATEGORIAS_CHIP = {
  'Movilidad':    'chip-movilidad',
  'Limpieza':     'chip-limpieza',
  'Servicios':    'chip-servicios',
  'Compras':      'chip-compras',
  'Mantenimiento':'chip-mantenimiento',
  'Caja Chica':   'chip-cajachica',
  'Otros':        'chip-otros',
};

// ─── Arranque ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Admin ve todo; vendedor solo sus propios gastos
  _usuario = await checkAuth(['admin', 'vendedor']);
  await initUI(_usuario);
  actualizarIndicadorSidebar();

  const perfil = getCurrentUser();
  _esAdmin = perfil?.rol === 'admin';

  const hoy      = fechaLima();
  const inicioMes = hoy.slice(0, 8) + '01';

  const gFecha = document.getElementById('g-fecha');
  if (gFecha) gFecha.value = hoy;

  const fd = document.getElementById('filtro-desde');
  const fh = document.getElementById('filtro-hasta');
  if (fd) fd.value = inicioMes;
  if (fh) fh.value = hoy;

  await Promise.all([
    cargarGastos(),
    cargarKPIs(),
    _esAdmin ? cargarPanelCaja() : Promise.resolve(),
  ]);

  inicializarEventos();
});

// ─── KPIs ─────────────────────────────────────────────────────────────────────
async function cargarKPIs() {
  const hoy       = fechaLima();
  const inicioMes = hoy.slice(0, 8) + '01';
  const el        = (id) => document.getElementById(id);

  if (_esAdmin) {
    // Admin: ventas globales + gastos globales + neto
    const [{ data: ventas }, { data: gastosHoy }] = await Promise.all([
      supabase.from(TABLAS.VENTAS).select('total')
        .gte('created_at', hoy + 'T00:00:00-05:00')
        .lte('created_at', hoy + 'T23:59:59-05:00')
        .neq('estado', 'cancelada'),
      supabase.from(TABLAS.GASTOS).select('monto').eq('fecha', hoy),
    ]);

    const totalVentas = (ventas     || []).reduce((s, v) => s + Number(v.total), 0);
    const totalGastos = (gastosHoy  || []).reduce((s, g) => s + Number(g.monto), 0);
    const neto        = totalVentas - totalGastos;

    if (el('kpi-ventas-hoy')) el('kpi-ventas-hoy').textContent = formatCurrency(totalVentas);
    if (el('kpi-gastos-hoy')) el('kpi-gastos-hoy').textContent = formatCurrency(totalGastos);
    if (el('kpi-neto-hoy')) {
      el('kpi-neto-hoy').textContent  = formatCurrency(neto);
      el('kpi-neto-hoy').style.color  = neto >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
    }
  } else {
    // Vendedor: solo sus gastos (hoy + mes)
    const [{ data: gastosHoy }, { data: gastosMes }] = await Promise.all([
      supabase.from(TABLAS.GASTOS).select('monto')
        .eq('usuario_id', _usuario.id)
        .eq('fecha', hoy),
      supabase.from(TABLAS.GASTOS).select('monto')
        .eq('usuario_id', _usuario.id)
        .gte('fecha', inicioMes)
        .lte('fecha', hoy),
    ]);

    const totalHoy = (gastosHoy || []).reduce((s, g) => s + Number(g.monto), 0);
    const totalMes = (gastosMes || []).reduce((s, g) => s + Number(g.monto), 0);

    if (el('kpi-v-gastos-hoy')) el('kpi-v-gastos-hoy').textContent = formatCurrency(totalHoy);
    if (el('kpi-v-gastos-mes')) el('kpi-v-gastos-mes').textContent = formatCurrency(totalMes);

    // Etiqueta dinámica del mes
    const mesLabel = new Date(hoy + 'T00:00:00')
      .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    if (el('kpi-v-mes-label'))
      el('kpi-v-mes-label').textContent = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  }
}

// ─── Cargar gastos de la tabla ─────────────────────────────────────────────────
async function cargarGastos() {
  const tbody = document.getElementById('tbody-gastos');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Cargando…</td></tr>';

  const desde = document.getElementById('filtro-desde')?.value;
  const hasta = document.getElementById('filtro-hasta')?.value;
  const cat   = document.getElementById('filtro-categoria')?.value;
  const busq  = document.getElementById('input-busqueda')?.value?.toLowerCase() || '';

  let query = supabase
    .from(TABLAS.GASTOS)
    .select('id, fecha, categoria, descripcion, monto, observaciones, usuario_id, created_at')
    .order('fecha',      { ascending: false })
    .order('created_at', { ascending: false });

  // Vendedor solo ve sus propios gastos
  if (!_esAdmin) query = query.eq('usuario_id', _usuario.id);
  if (desde)     query = query.gte('fecha', desde);
  if (hasta)     query = query.lte('fecha', hasta);
  if (cat)       query = query.eq('categoria', cat);

  // Dos queries en paralelo: gastos + perfiles (para mostrar nombre en admin)
  const [{ data: filas, error }, { data: perfiles }] = await Promise.all([
    query,
    supabase.from('usuarios_perfil').select('id, nombre'),
  ]);

  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Error al cargar gastos.</td></tr>`;
    showToast('Error al cargar gastos: ' + error.message, 'error');
    return;
  }

  const perfilMap = Object.fromEntries((perfiles || []).map(u => [u.id, u]));
  _gastos = (filas || []).map(g => ({ ...g, usuarios_perfil: perfilMap[g.usuario_id] || null }));

  const filtrados = busq
    ? _gastos.filter(g =>
        g.descripcion?.toLowerCase().includes(busq) ||
        g.categoria?.toLowerCase().includes(busq)
      )
    : _gastos;

  actualizarSubtitulo(filtrados.length);
  renderTabla(filtrados);
}

function renderTabla(lista) {
  const tbody = document.getElementById('tbody-gastos');
  if (!lista.length) {
    tbody.innerHTML = `
      <tr class="empty-row"><td colspan="6">
        <svg class="empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        No hay gastos registrados para los filtros seleccionados.
      </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(g => {
    const chipClass    = CATEGORIAS_CHIP[g.categoria] || 'chip-otros';
    const nombre       = g.usuarios_perfil?.nombre || '—';
    const puedeEditar  = _esAdmin || g.usuario_id === _usuario?.id;
    const puedeEliminar = _esAdmin;

    return `
      <tr>
        <td>${esc(formatDate(g.fecha))}</td>
        <td><span class="chip-categoria ${chipClass}">${esc(g.categoria)}</span></td>
        <td>${esc(g.descripcion)}</td>
        <td class="admin-only">${esc(nombre)}</td>
        <td style="text-align:right;"><span class="monto-gasto">−${formatCurrency(g.monto)}</span></td>
        <td style="text-align:center;">
          <div class="td-acciones" style="justify-content:center;">
            <button class="btn-icon-sm" title="Ver detalle" data-action="ver" data-id="${g.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${puedeEditar ? `
            <button class="btn-icon-sm --warning" title="Editar" data-action="editar" data-id="${g.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>` : ''}
            ${puedeEliminar ? `
            <button class="btn-icon-sm --danger" title="Eliminar" data-action="eliminar" data-id="${g.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  // Event delegation — reemplaza los onclick="window.*" globales
  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id     = btn.dataset.id;
      const accion = btn.dataset.action;
      if (accion === 'ver')      _verDetalle(id);
      if (accion === 'editar')   _editarGasto(id);
      if (accion === 'eliminar') await _eliminarGasto(id);
    });
  });
}

function actualizarSubtitulo(n) {
  const el  = document.getElementById('subtitle-contador');
  if (!el) return;
  const txt = _esAdmin
    ? `${n} gasto${n !== 1 ? 's' : ''} registrado${n !== 1 ? 's' : ''}`
    : `${n} gasto${n !== 1 ? 's' : ''} propio${n !== 1 ? 's' : ''}`;
  el.textContent = txt;
}

// ─── Panel Cierre de Caja (solo admin) ────────────────────────────────────────
async function cargarPanelCaja() {
  const hoy = fechaLima();

  const [{ data: ventas }, { data: gastos }] = await Promise.all([
    supabase.from(TABLAS.VENTAS).select('total')
      .gte('created_at', hoy + 'T00:00:00')
      .lte('created_at', hoy + 'T23:59:59')
      .neq('estado', 'cancelada'),
    supabase.from(TABLAS.GASTOS).select('monto').eq('fecha', hoy),
  ]);

  const totalVentas = (ventas || []).reduce((s, v) => s + Number(v.total), 0);
  const totalGastos = (gastos || []).reduce((s, g) => s + Number(g.monto), 0);
  const saldo       = totalVentas - totalGastos;

  const el = (id) => document.getElementById(id);
  if (el('caja-ventas')) el('caja-ventas').textContent = formatCurrency(totalVentas);
  if (el('caja-gastos')) el('caja-gastos').textContent = formatCurrency(totalGastos);
  if (el('caja-saldo'))  {
    el('caja-saldo').textContent = formatCurrency(saldo);
    el('caja-saldo').style.color = saldo >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
  }

  const larga = new Date(hoy + 'T00:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  if (el('caja-fecha-label')) el('caja-fecha-label').textContent = `Resumen del ${larga}`;

  const { data: cierre } = await supabase
    .from(TABLAS.CIERRES_CAJA).select('id').eq('fecha', hoy).maybeSingle();

  const btnCerrar = el('btn-cerrar-caja');
  const yaDiv     = el('caja-ya-cerrada');
  if (cierre) {
    if (yaDiv)     yaDiv.style.display     = 'flex';
    if (btnCerrar) btnCerrar.style.display = 'none';
  } else {
    if (yaDiv)     yaDiv.style.display     = 'none';
    if (btnCerrar) btnCerrar.style.display = 'inline-flex';
  }

  await cargarHistorialCierres();
}

async function cargarHistorialCierres() {
  const contenedor = document.getElementById('historial-cierres');
  if (!contenedor) return;

  const { data: cierres, error } = await supabase
    .from(TABLAS.CIERRES_CAJA)
    .select('fecha, ventas_totales, gastos_totales, saldo_final')
    .order('fecha', { ascending: false })
    .limit(5);

  if (error || !cierres?.length) {
    contenedor.innerHTML = '<p style="font-size:.82rem;color:var(--c-ink-muted);">Sin cierres registrados aún.</p>';
    return;
  }

  contenedor.innerHTML = cierres.map(c => {
    const pos = Number(c.saldo_final) >= 0;
    return `
      <div class="cierre-card">
        <div class="cierre-fecha">${esc(formatDate(c.fecha))}</div>
        <div class="cierre-cols">
          <div class="cierre-col">
            <span class="cierre-col-lbl">Ventas</span>
            <span class="cierre-col-val">${formatCurrency(c.ventas_totales)}</span>
          </div>
          <div class="cierre-col">
            <span class="cierre-col-lbl">Gastos</span>
            <span class="cierre-col-val">${formatCurrency(c.gastos_totales)}</span>
          </div>
          <div class="cierre-col">
            <span class="cierre-col-lbl">Saldo</span>
            <span class="cierre-col-val ${pos ? 'positivo' : 'negativo'}">${formatCurrency(c.saldo_final)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── Cerrar caja ──────────────────────────────────────────────────────────────
async function cerrarCaja() {
  const hoy = fechaLima();
  const ok  = await confirmDialog(
    '¿Confirmas el cierre de caja del día de hoy? Esta acción guardará el registro histórico.',
    { title: 'Cerrar caja del día', confirmText: 'Sí, cerrar caja', type: 'warning' }
  );
  if (!ok) return;

  const [{ data: ventas }, { data: gastos }] = await Promise.all([
    supabase.from(TABLAS.VENTAS).select('total')
      .gte('created_at', hoy + 'T00:00:00')
      .lte('created_at', hoy + 'T23:59:59')
      .neq('estado', 'cancelada'),
    supabase.from(TABLAS.GASTOS).select('monto').eq('fecha', hoy),
  ]);

  const totalVentas = (ventas || []).reduce((s, v) => s + Number(v.total), 0);
  const totalGastos = (gastos || []).reduce((s, g) => s + Number(g.monto), 0);

  const { error } = await supabase.from(TABLAS.CIERRES_CAJA).insert({
    fecha:          hoy,
    ventas_totales: totalVentas,
    gastos_totales: totalGastos,
    saldo_final:    totalVentas - totalGastos,
    usuario_id:     _usuario.id,
  });

  if (error) { showToast('Error al cerrar caja: ' + error.message, 'error'); return; }
  showToast('Caja cerrada correctamente.', 'success');
  await cargarPanelCaja();
}

// ─── Acciones de gasto ────────────────────────────────────────────────────────
function _verDetalle(id) {
  const g = _gastos.find(x => x.id === id);
  if (!g) return;

  const chipClass = CATEGORIAS_CHIP[g.categoria] || 'chip-otros';
  const nombre    = g.usuarios_perfil?.nombre || '—';

  document.getElementById('detalle-subtitulo').textContent =
    `Registrado el ${formatDate(g.created_at?.split('T')[0])}`;

  // El bloque "Registrado por" solo se muestra a admin
  const registradoPorHtml = _esAdmin ? `
    <div class="detalle-item full-col">
      <div class="d-label">Registrado por</div>
      <div class="d-value">${esc(nombre)}</div>
    </div>` : '';

  document.getElementById('detalle-body').innerHTML = `
    <div class="detalle-grid">
      <div class="detalle-monto">
        <span class="dm-label">Monto del gasto</span>
        <span class="dm-value">${formatCurrency(g.monto)}</span>
      </div>
      <div class="detalle-item">
        <div class="d-label">Fecha</div>
        <div class="d-value">${esc(formatDate(g.fecha))}</div>
      </div>
      <div class="detalle-item">
        <div class="d-label">Categoría</div>
        <div class="d-value"><span class="chip-categoria ${chipClass}">${esc(g.categoria)}</span></div>
      </div>
      <div class="detalle-item full-col">
        <div class="d-label">Descripción</div>
        <div class="d-value">${esc(g.descripcion)}</div>
      </div>
      ${g.observaciones ? `
      <div class="detalle-item full-col">
        <div class="d-label">Observaciones</div>
        <div class="d-value">${esc(g.observaciones)}</div>
      </div>` : ''}
      ${registradoPorHtml}
    </div>`;

  abrirModal('modal-detalle');
};

function _editarGasto(id) {
  const g = _gastos.find(x => x.id === id);
  if (!g) return;
  _editandoId = id;

  document.getElementById('modal-gasto-titulo').textContent = 'Editar gasto';
  document.getElementById('g-fecha').value         = g.fecha        || '';
  document.getElementById('g-categoria').value     = g.categoria    || '';
  document.getElementById('g-monto').value         = g.monto        || '';
  document.getElementById('g-descripcion').value   = g.descripcion  || '';
  document.getElementById('g-observaciones').value = g.observaciones || '';

  abrirModal('modal-gasto');
};

async function _eliminarGasto(id) {
  const g = _gastos.find(x => x.id === id);
  if (!g) return;

  const ok = await confirmDialog(
    `¿Eliminar el gasto de ${formatCurrency(g.monto)} — "${g.descripcion}"?`,
    { title: 'Eliminar gasto', confirmText: 'Eliminar', type: 'danger' }
  );
  if (!ok) return;

  const { error } = await supabase.from(TABLAS.GASTOS).delete().eq('id', id);
  if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return; }

  showToast('Gasto eliminado.', 'success');
  await Promise.all([
    cargarGastos(),
    cargarKPIs(),
    _esAdmin ? cargarPanelCaja() : Promise.resolve(),
  ]);
};

// ─── Formulario ───────────────────────────────────────────────────────────────
async function guardarGasto(e) {
  e.preventDefault();
  if (!(await requireAsistencia('registrar gastos'))) return;

  const fecha         = document.getElementById('g-fecha').value.trim();
  const categoria     = document.getElementById('g-categoria').value;
  const monto         = parseFloat(document.getElementById('g-monto').value);
  const descripcion   = document.getElementById('g-descripcion').value.trim();
  const observaciones = document.getElementById('g-observaciones').value.trim();

  if (!fecha || !categoria || !descripcion || isNaN(monto) || monto <= 0) {
    showToast('Completa todos los campos obligatorios.', 'warning');
    return;
  }

  const payload = { fecha, categoria, monto, descripcion, observaciones: observaciones || null };

  let error;
  if (_editandoId) {
    ({ error } = await supabase.from(TABLAS.GASTOS).update(payload).eq('id', _editandoId));
  } else {
    ({ error } = await supabase.from(TABLAS.GASTOS).insert({ ...payload, usuario_id: _usuario.id }));
  }

  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }

  showToast(_editandoId ? 'Gasto actualizado.' : 'Gasto registrado.', 'success');
  cerrarModal('modal-gasto');
  await Promise.all([
    cargarGastos(),
    cargarKPIs(),
    _esAdmin ? cargarPanelCaja() : Promise.resolve(),
  ]);
}

// ─── Helpers de modal ─────────────────────────────────────────────────────────
function abrirModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
  if (id === 'modal-gasto') {
    _editandoId = null;
    document.getElementById('form-gasto')?.reset();
    document.getElementById('g-fecha').value = fechaLima();
    document.getElementById('modal-gasto-titulo').textContent = 'Nuevo gasto';
  }
}

// ─── Eventos ──────────────────────────────────────────────────────────────────
function inicializarEventos() {
  document.getElementById('btn-nuevo-gasto')?.addEventListener('click', () => {
    _editandoId = null;
    document.getElementById('form-gasto')?.reset();
    document.getElementById('g-fecha').value = fechaLima();
    document.getElementById('modal-gasto-titulo').textContent = 'Nuevo gasto';
    abrirModal('modal-gasto');
  });

  document.getElementById('form-gasto')?.addEventListener('submit', guardarGasto);

  document.getElementById('btn-close-modal-gasto')?.addEventListener('click', () => cerrarModal('modal-gasto'));
  document.getElementById('btn-cancelar-modal')?.addEventListener('click',    () => cerrarModal('modal-gasto'));
  document.getElementById('btn-close-detalle')?.addEventListener('click',     () => cerrarModal('modal-detalle'));
  document.getElementById('btn-close-detalle-2')?.addEventListener('click',   () => cerrarModal('modal-detalle'));

  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) cerrarModal(o.id); });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay.open').forEach(o => cerrarModal(o.id));
  });

  document.getElementById('btn-cerrar-caja')?.addEventListener('click', cerrarCaja);

  const recargar = () => cargarGastos();
  document.getElementById('filtro-desde')?.addEventListener('change', recargar);
  document.getElementById('filtro-hasta')?.addEventListener('change', recargar);
  document.getElementById('filtro-categoria')?.addEventListener('change', recargar);

  let timer;
  document.getElementById('input-busqueda')?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(recargar, 300);
  });
}
