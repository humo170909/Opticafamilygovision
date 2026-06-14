/* asistencia.js — Panel de control de asistencia (admin) */
import { supabase }        from '../../config/supabase.js';
import { checkAuth }       from '../../core/auth.js';
import { initUI }          from '../../core/ui.js';
import { showToast }       from '../../utils/alerts.js';
import { esc }             from '../../utils/validators.js';
import { ROLES }           from '../../config/supabase.js';
import { fechaLima, horaLima, horaSegundosLima, minDesdeMedianoche } from '../../utils/tiempo.js';
import { notificarTardanza } from '../../utils/whatsapp.js';

// ─── Utilidades asistencia ────────────────────────────────────────────────────
function calcularHorasTrabajadas(entrada, salida) {
  if (!entrada || !salida) return null;
  const diff = minDesdeMedianoche(salida) - minDesdeMedianoche(entrada);
  return diff > 0 ? Math.round(diff * 100 / 60) / 100 : null;
}

function estadoBadge(estado) {
  const map = { presente: 'bs', tardanza: 'bw', ausente: 'bd', pendiente: 'bn' };
  return map[estado] || 'bn';
}

function estadoLabel(estado) {
  return { presente: 'Presente', tardanza: 'Tardanza', ausente: 'Ausente', pendiente: 'Sin registro' }[estado] || estado;
}

// ─── Estado global ────────────────────────────────────────────────────────────
let _config        = null;
let _usuario       = null;
let _registroHoy   = null;
let _empleados     = [];
let _clockInterval = null;
let _ultimasFilas  = []; // cache para re-filtrar sin nueva query

// ─── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  _usuario = await checkAuth([ROLES.ADMIN]);
  await initUI(_usuario);

  const el  = (id) => document.getElementById(id);
  const hoy = fechaLima();

  // Fecha por defecto: hoy en ambos rangos
  if (el('fil-fecha-ini')) el('fil-fecha-ini').value = hoy;
  if (el('fil-fecha-fin')) el('fil-fecha-fin').value = hoy;

  // Toggle tardanzas label
  el('fil-tardanzas')?.addEventListener('change', (e) => {
    const lbl = el('tgl-tardanzas-label');
    if (lbl) lbl.textContent = e.target.checked ? 'Sí' : 'No';
    // Si se activa tardanzas, limpiar el select estado
    if (e.target.checked && el('fil-estado')) el('fil-estado').value = 'tardanza';
    else if (!e.target.checked && el('fil-estado')?.value === 'tardanza') el('fil-estado').value = '';
  });
  el('fil-estado')?.addEventListener('change', (e) => {
    if (e.target.value !== 'tardanza' && el('fil-tardanzas')?.checked) {
      el('fil-tardanzas').checked = false;
      if (el('tgl-tardanzas-label')) el('tgl-tardanzas-label').textContent = 'No';
    }
  });

  // Cargar config + empleados en paralelo
  const [config, empleados] = await Promise.all([cargarConfig(), cargarEmpleados()]);
  _config    = config;
  _empleados = empleados;

  // Reloj admin + su registro de hoy
  iniciarRelojAdmin();
  await cargarRegistroAdmin();

  // Marcar ausentes automáticamente si son >= 18:00
  const [hh] = horaLima().split(':').map(Number);
  if (hh >= 18) await autoMarcarAusentes(hoy, empleados, false);

  // Carga inicial del historial
  await cargarHistorial();

  // Eventos
  el('btn-filtrar')?.addEventListener('click', cargarHistorial);
  el('fil-buscar')?.addEventListener('input', aplicarFiltroTexto);
  el('btn-exportar-csv')?.addEventListener('click', exportarCSV);
  el('btn-exportar-excel')?.addEventListener('click', exportarExcel);
  el('btn-exportar-pdf')?.addEventListener('click', exportarPDF);
  el('btn-marcar-ausentes')?.addEventListener('click', () => autoMarcarAusentes(fechaLima(), _empleados, true));
  el('btn-close-modal-edit')?.addEventListener('click', cerrarModal);
  el('btn-edit-cancelar')?.addEventListener('click', cerrarModal);
  el('btn-edit-guardar')?.addEventListener('click', guardarEdicion);
});

// ─── Configuración ────────────────────────────────────────────────────────────
async function cargarConfig() {
  const { data } = await supabase.from('configuracion').select('*').limit(1).single();
  return data || {};
}

// ─── Empleados ────────────────────────────────────────────────────────────────
async function cargarEmpleados() {
  const { data } = await supabase
    .from('usuarios_perfil')
    .select('id, nombre, email, rol')
    .eq('activo', true)
    .order('nombre');
  return data || [];
}

// ─── Reloj del admin + fichar ─────────────────────────────────────────────────
function iniciarRelojAdmin() {
  const elReloj = document.getElementById('asi-admin-reloj');
  if (!elReloj) return;
  const tick = () => { elReloj.textContent = horaSegundosLima(); };
  tick();
  _clockInterval = setInterval(tick, 1000);
}

async function cargarRegistroAdmin() {
  const hoy = fechaLima();
  const { data } = await supabase
    .from('asistencia').select('*')
    .eq('usuario_id', _usuario.id).eq('fecha', hoy).maybeSingle();
  _registroHoy = data;
  renderFicharAdmin();
}

function renderFicharAdmin() {
  const elStatus   = document.getElementById('asi-admin-status');
  const elAcciones = document.getElementById('asi-admin-acciones');
  const elReloj    = document.getElementById('asi-admin-reloj');
  if (!elStatus || !elAcciones) return;
  const r = _registroHoy;

  if (!r || !r.hora_entrada) {
    elStatus.textContent = 'No has fichado hoy';
    elAcciones.innerHTML = `<button class="btn-primary" id="btn-admin-entrada">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      Marcar entrada
    </button>`;
    document.getElementById('btn-admin-entrada')?.addEventListener('click', () => marcarEntradaAdmin());
  } else if (r.hora_entrada && !r.hora_salida) {
    clearInterval(_clockInterval);
    const badge = estadoBadge(r.estado);
    elStatus.innerHTML = `Entrada: <strong>${r.hora_entrada.slice(0,5)}</strong> · <span class="badge ${badge}">${estadoLabel(r.estado)}</span>`;
    const tickWork = () => {
      const minsTrabajados = minDesdeMedianoche(horaLima()) - minDesdeMedianoche(r.hora_entrada);
      const h = Math.floor(minsTrabajados / 60);
      const m = minsTrabajados % 60;
      if (elReloj) elReloj.textContent = `${h}h ${m}m`;
    };
    tickWork();
    _clockInterval = setInterval(tickWork, 30000);
    elAcciones.innerHTML = `<button class="btn-secondary" id="btn-admin-salida">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Marcar salida
    </button>`;
    document.getElementById('btn-admin-salida')?.addEventListener('click', () => marcarSalidaAdmin());
  } else if (r.hora_entrada && r.hora_salida) {
    clearInterval(_clockInterval);
    const hrs = calcularHorasTrabajadas(r.hora_entrada, r.hora_salida);
    const badge = estadoBadge(r.estado);
    if (elReloj) elReloj.textContent = hrs != null ? `${hrs}h` : '—';
    elStatus.innerHTML = `Entrada: <strong>${r.hora_entrada.slice(0,5)}</strong> · Salida: <strong>${r.hora_salida.slice(0,5)}</strong> · <span class="badge ${badge}">${estadoLabel(r.estado)}</span>`;
    elAcciones.innerHTML = '';
  }
}

async function marcarEntradaAdmin() {
  const hora  = horaLima() + ':00';
  const fecha = fechaLima();

  // Siempre verificar estado real en DB
  const { data: registroDB } = await supabase
    .from('asistencia').select('id, hora_entrada, hora_salida, estado, minutos_tarde')
    .eq('usuario_id', _usuario.id).eq('fecha', fecha).maybeSingle();

  if (registroDB?.hora_entrada) {
    const { data: regFull } = await supabase.from('asistencia').select('*').eq('id', registroDB.id).single();
    _registroHoy = regFull || registroDB;
    renderFicharAdmin();
    showToast('Ya tienes la entrada registrada para hoy.', 'warning');
    return;
  }

  const limite     = _config?.asistencia_hora_tardanza || '09:30';
  const esTardanza = minDesdeMedianoche(hora) >= minDesdeMedianoche(limite);
  const minTarde   = esTardanza ? minDesdeMedianoche(hora) - minDesdeMedianoche(limite) : 0;
  const estado     = esTardanza ? 'tardanza' : 'presente';

  console.log('[marcarEntradaAdmin] Estado:', estado);
  console.log('[marcarEntradaAdmin] Minutos tarde:', minTarde);
  console.log('[marcarEntradaAdmin] Hora límite:', limite, '| Hora entrada:', hora);

  let justificacion = '';
  if (esTardanza) {
    try {
      justificacion = await pedirJustificacion(minTarde);
      console.log('[marcarEntradaAdmin] Justificación ingresada:', justificacion);
    } catch {
      console.log('[marcarEntradaAdmin] Modal cancelado — no se registra asistencia.');
      return;
    }
  }

  let resultado;
  if (registroDB?.id) {
    resultado = await supabase.from('asistencia')
      .update({ hora_entrada: hora, estado, minutos_tarde: minTarde, observaciones: justificacion || null })
      .eq('id', registroDB.id).select().single();
  } else {
    resultado = await supabase.from('asistencia').insert({
      usuario_id: _usuario.id, fecha, hora_entrada: hora, estado, minutos_tarde: minTarde,
      observaciones: justificacion || null,
    }).select().single();
  }

  const { data, error } = resultado;
  if (error) {
    if (error.code === '23505') {
      await cargarRegistroAdmin();
      showToast('Tu asistencia de hoy ya fue registrada.', 'warning');
    } else if (error.code === '42501') {
      showToast('Sin permisos para registrar asistencia.', 'error');
    } else {
      showToast('Error al registrar entrada: ' + error.message, 'error');
    }
    return;
  }

  _registroHoy = data;
  renderFicharAdmin();
  await cargarHistorial();

  if (esTardanza) {
    notificarTardanza(_config, _usuario.nombre, hora.slice(0, 5), minTarde, justificacion, fecha);
    await mostrarConfirmacion();
  } else {
    showToast('Entrada registrada', 'success');
  }
}

// ─── Modal justificación tardanza (admin) ────────────────────────────────────
function pedirJustificacion(minutosTarde) {
  return new Promise((resolve, reject) => {
    const overlay  = document.getElementById('modal-tardanza');
    const textarea = document.getElementById('input-justificacion');
    const errorEl  = document.getElementById('justif-error');
    const btnConf  = document.getElementById('btn-tardanza-confirmar');
    const btnCan   = document.getElementById('btn-tardanza-cancelar');
    const subtext  = document.getElementById('tardanza-minutos-text');

    textarea.value        = '';
    errorEl.style.display = 'none';
    errorEl.textContent   = '';
    textarea.classList.remove('error');
    subtext.textContent   = `Llegas con ${minutosTarde} minuto${minutosTarde !== 1 ? 's' : ''} de retraso`;
    overlay.hidden        = false;
    setTimeout(() => textarea.focus(), 60);

    function onInput() {
      if (textarea.value.trim().length >= 10) {
        errorEl.style.display = 'none';
        textarea.classList.remove('error');
      }
    }

    function confirmar() {
      const val = textarea.value.trim();
      if (val.length === 0) {
        errorEl.textContent   = 'El motivo es obligatorio para continuar.';
        errorEl.style.display = 'block';
        textarea.classList.add('error');
        textarea.focus();
        return;
      }
      if (val.length < 10) {
        errorEl.textContent   = 'La justificación debe tener al menos 10 caracteres.';
        errorEl.style.display = 'block';
        textarea.classList.add('error');
        textarea.focus();
        return;
      }
      limpiar();
      resolve(val);
    }

    function cancelar() {
      limpiar();
      reject();
    }

    function onOverlayClick(e) {
      if (e.target === overlay) cancelar();
    }

    function onKeydown(e) {
      if (e.key === 'Escape') cancelar();
    }

    function limpiar() {
      overlay.hidden = true;
      btnConf.removeEventListener('click', confirmar);
      btnCan.removeEventListener('click', cancelar);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      textarea.removeEventListener('input', onInput);
    }

    textarea.addEventListener('input', onInput);
    btnConf.addEventListener('click', confirmar);
    btnCan.addEventListener('click', cancelar);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

// ─── Modal confirmación tardanza registrada (admin) ───────────────────────────
function mostrarConfirmacion() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-confirmacion-tardanza');
    const btnAcep = document.getElementById('btn-confirmacion-aceptar');
    overlay.hidden = false;

    function cerrar() {
      overlay.hidden = true;
      btnAcep.removeEventListener('click', cerrar);
      resolve();
    }
    btnAcep.addEventListener('click', cerrar);
  });
}

async function marcarSalidaAdmin() {
  if (!_registroHoy?.id) return;
  const hora  = horaLima() + ':00';
  const horas = calcularHorasTrabajadas(_registroHoy.hora_entrada, hora);
  const { data, error } = await supabase.from('asistencia')
    .update({ hora_salida: hora, horas_trabajadas: horas })
    .eq('id', _registroHoy.id).select().single();
  if (error) { showToast('Error al registrar salida: ' + error.message, 'error'); return; }
  _registroHoy = data;
  renderFicharAdmin();
  showToast('Salida registrada. Horas trabajadas: ' + (horas?.toFixed(2) || '—'), 'success');
  await cargarHistorial();
}

// ─── Obtener filtros activos ──────────────────────────────────────────────────
function _getFiltros() {
  const el = (id) => document.getElementById(id);
  const hoy = fechaLima();
  return {
    buscar:    (el('fil-buscar')?.value || '').trim().toLowerCase(),
    fechaIni:  el('fil-fecha-ini')?.value || hoy,
    fechaFin:  el('fil-fecha-fin')?.value || hoy,
    estado:    el('fil-estado')?.value    || '',
    tardanzas: el('fil-tardanzas')?.checked || false,
  };
}

// ─── Historial ────────────────────────────────────────────────────────────────
async function cargarHistorial() {
  const tbody = document.getElementById('tabla-asistencia');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--c-ink-muted);">Cargando…</td></tr>';

  const { fechaIni, fechaFin, estado, tardanzas } = _getFiltros();

  let q = supabase.from('asistencia').select('*')
    .gte('fecha', fechaIni)
    .lte('fecha', fechaFin);

  if (tardanzas) {
    q = q.eq('estado', 'tardanza');
  } else if (estado) {
    q = q.eq('estado', estado);
  }

  const [{ data: filas, error }, { data: perfiles }] = await Promise.all([
    q,
    supabase.from('usuarios_perfil').select('id, nombre, email'),
  ]);

  if (error) {
    showToast('Error al cargar asistencia: ' + error.message, 'error');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--c-danger);">Error al cargar datos.</td></tr>';
    return;
  }

  const perfilMap = Object.fromEntries((perfiles || []).map(u => [u.id, u]));

  _ultimasFilas = (filas || [])
    .map(r => ({ ...r, usuarios_perfil: perfilMap[r.usuario_id] || null }))
    .sort((a, b) => {
      const na = a.usuarios_perfil?.nombre || '';
      const nb = b.usuarios_perfil?.nombre || '';
      const byName = na.localeCompare(nb, 'es');
      return byName !== 0 ? byName : (a.fecha || '').localeCompare(b.fecha || '');
    });

  // Stats — basadas en el rango completo sin filtro de texto
  const todosEmpleados = _empleados.length;
  const presentes  = _ultimasFilas.filter(r => r.estado === 'presente').length;
  const tardanzasN = _ultimasFilas.filter(r => r.estado === 'tardanza').length;
  const ausentes   = _ultimasFilas.filter(r => r.estado === 'ausente').length;
  const sinFichar  = Math.max(0, todosEmpleados - _ultimasFilas.length + _ultimasFilas.filter(r => r.estado === 'pendiente').length);

  const el = (id) => document.getElementById(id);
  if (el('stat-total'))     el('stat-total').textContent     = todosEmpleados;
  if (el('stat-presentes')) el('stat-presentes').textContent = presentes + tardanzasN;
  if (el('stat-tardanzas')) el('stat-tardanzas').textContent = tardanzasN;
  if (el('stat-ausentes'))  el('stat-ausentes').textContent  = ausentes + sinFichar;

  // Aplicar filtro de texto sobre las filas ya cargadas
  aplicarFiltroTexto();
}

// ─── Filtro de texto (client-side) ───────────────────────────────────────────
function aplicarFiltroTexto() {
  const tbody  = document.getElementById('tabla-asistencia');
  if (!tbody) return;

  const buscar = (document.getElementById('fil-buscar')?.value || '').trim().toLowerCase();
  const registros = buscar
    ? _ultimasFilas.filter(r => {
        const nombre = (r.usuarios_perfil?.nombre || '').toLowerCase();
        const email  = (r.usuarios_perfil?.email  || '').toLowerCase();
        return nombre.includes(buscar) || email.includes(buscar);
      })
    : _ultimasFilas;

  if (!registros.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--c-ink-muted);font-size:.82rem;">Sin registros para los filtros aplicados.</td></tr>';
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const nombre = esc(r.usuarios_perfil?.nombre || r.usuario_id);
    const email  = esc(r.usuarios_perfil?.email  || '');
    const badge  = estadoBadge(r.estado);
    const hrs    = r.horas_trabajadas != null ? r.horas_trabajadas.toFixed(2) + 'h' : '—';
    return `
      <tr>
        <td>
          <strong style="font-size:.85rem;display:block;">${nombre}</strong>
          ${email ? `<span style="font-size:.74rem;color:var(--c-ink-muted);">${email}</span>` : ''}
        </td>
        <td style="font-size:.82rem;">${esc(r.fecha)}</td>
        <td style="font-family:var(--font-display);font-size:.84rem;">${r.hora_entrada ? r.hora_entrada.slice(0,5) : '—'}</td>
        <td style="font-family:var(--font-display);font-size:.84rem;">${r.hora_salida  ? r.hora_salida.slice(0,5)  : '—'}</td>
        <td><span class="badge ${badge}">${estadoLabel(r.estado)}</span></td>
        <td style="text-align:center;">${r.minutos_tarde || 0}</td>
        <td style="text-align:center;font-family:var(--font-display);font-size:.84rem;">${hrs}</td>
        <td style="font-size:.78rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
            title="${esc(r.observaciones || '')}">${r.observaciones
              ? `<span style="color:var(--c-ink-soft);">${esc(r.observaciones)}</span>`
              : `<span style="color:var(--c-ink-muted);font-style:italic;">—</span>`
            }</td>
        <td>
          <div class="row-actions">
            <button class="btn-icon" data-id="${r.id}" data-action="editar" title="Editar registro">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-danger" data-id="${r.id}" data-action="eliminar" title="Eliminar registro">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const reg = _ultimasFilas.find(r => String(r.id) === id);
      if (!reg) return;
      if (btn.dataset.action === 'editar')   abrirModalEditar(reg);
      if (btn.dataset.action === 'eliminar') eliminarRegistro(reg);
    });
  });
}

// ─── Eliminar registro ────────────────────────────────────────────────────────
async function eliminarRegistro(reg) {
  const nombre = reg.usuarios_perfil?.nombre || reg.usuario_id;
  const confirmar = window.confirm(`¿Eliminar el registro de ${nombre} del ${reg.fecha}?\nEsta acción no se puede deshacer.`);
  if (!confirmar) return;

  const { error } = await supabase.from('asistencia').delete().eq('id', reg.id);
  if (error) {
    showToast('Error al eliminar: ' + error.message, 'error');
    return;
  }
  showToast('Registro eliminado.', 'success');
  await cargarHistorial();
}

// ─── Auto-marcar ausentes ─────────────────────────────────────────────────────
async function autoMarcarAusentes(fecha, empleados, mostrarToast) {
  const { data: registros } = await supabase
    .from('asistencia').select('usuario_id').eq('fecha', fecha);

  const yaFicharon = new Set((registros || []).map(r => r.usuario_id));
  const sinFichar  = empleados.filter(u => !yaFicharon.has(u.id));

  if (!sinFichar.length) {
    if (mostrarToast) showToast('Todos los empleados tienen registro para esta fecha.', 'info');
    return;
  }

  const inserciones = sinFichar.map(u => ({
    usuario_id: u.id, fecha, estado: 'ausente', minutos_tarde: 0,
  }));

  const { error } = await supabase.from('asistencia').insert(inserciones);
  if (error) {
    if (mostrarToast) showToast('Error al marcar ausentes: ' + error.message, 'error');
    return;
  }
  if (mostrarToast) showToast(`${sinFichar.length} empleado(s) marcados como ausentes.`, 'success');
  await cargarHistorial();
}

// ─── Modal editar ─────────────────────────────────────────────────────────────
function abrirModalEditar(reg) {
  const el = (id) => document.getElementById(id);
  const nombre = reg.usuarios_perfil?.nombre || reg.usuario_id;
  el('edit-registro-id').value            = reg.id;
  el('modal-edit-subtitulo').textContent  = `${nombre} · ${reg.fecha}`;
  el('edit-estado').value                 = reg.estado;
  el('edit-minutos-tarde').value          = reg.minutos_tarde || 0;
  el('edit-hora-entrada').value           = reg.hora_entrada?.slice(0,5) || '';
  el('edit-hora-salida').value            = reg.hora_salida?.slice(0,5)  || '';
  el('edit-observaciones').value          = reg.observaciones || '';
  el('edit-error').hidden                 = true;
  el('modal-editar-registro').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modal-editar-registro')?.classList.remove('open');
}

async function guardarEdicion() {
  const el    = (id) => document.getElementById(id);
  const id    = el('edit-registro-id').value;
  const errEl = el('edit-error');
  const btn   = el('btn-edit-guardar');

  const horaEntrada = el('edit-hora-entrada').value;
  const horaSalida  = el('edit-hora-salida').value;
  const horas = calcularHorasTrabajadas(
    horaEntrada ? horaEntrada + ':00' : null,
    horaSalida  ? horaSalida  + ':00' : null,
  );

  btn.disabled = true;
  const { error } = await supabase.from('asistencia').update({
    estado:           el('edit-estado').value,
    minutos_tarde:    parseInt(el('edit-minutos-tarde').value) || 0,
    hora_entrada:     horaEntrada ? horaEntrada + ':00' : null,
    hora_salida:      horaSalida  ? horaSalida  + ':00' : null,
    horas_trabajadas: horas,
    observaciones:    el('edit-observaciones').value.trim() || null,
  }).eq('id', id);
  btn.disabled = false;

  if (error) {
    errEl.textContent = 'Error al guardar: ' + error.message;
    errEl.hidden = false;
    return;
  }
  cerrarModal();
  showToast('Registro actualizado.', 'success');
  await cargarHistorial();
}

// ─── Obtener datos para exportar ─────────────────────────────────────────────
async function _fetchExportData() {
  const { fechaIni, fechaFin, estado, tardanzas, buscar } = _getFiltros();

  let q = supabase.from('asistencia').select('*')
    .gte('fecha', fechaIni).lte('fecha', fechaFin);
  if (tardanzas)    q = q.eq('estado', 'tardanza');
  else if (estado)  q = q.eq('estado', estado);

  const [{ data: filas, error }, { data: perfiles }] = await Promise.all([
    q,
    supabase.from('usuarios_perfil').select('id, nombre, email'),
  ]);

  if (error || !filas?.length) {
    showToast('Sin datos para exportar.', 'warning');
    return null;
  }

  const perfilMap = Object.fromEntries((perfiles || []).map(u => [u.id, u]));
  let registros = filas
    .map(r => ({ ...r, usuarios_perfil: perfilMap[r.usuario_id] || null }))
    .sort((a, b) => (a.usuarios_perfil?.nombre || '').localeCompare(b.usuarios_perfil?.nombre || '', 'es'));

  if (buscar) {
    registros = registros.filter(r => {
      const nombre = (r.usuarios_perfil?.nombre || '').toLowerCase();
      const email  = (r.usuarios_perfil?.email  || '').toLowerCase();
      return nombre.includes(buscar) || email.includes(buscar);
    });
  }

  if (!registros.length) {
    showToast('Sin datos para exportar con los filtros aplicados.', 'warning');
    return null;
  }
  return registros;
}

// ─── Exportar CSV ─────────────────────────────────────────────────────────────
async function exportarCSV() {
  const data = await _fetchExportData();
  if (!data) return;

  const { fechaIni, fechaFin } = _getFiltros();

  const headers = ['Empleado','Email','Fecha','Estado','Entrada','Salida','Min_tarde','Horas_trabajadas','Observaciones'];
  const rows = data.map(r => [
    `"${(r.usuarios_perfil?.nombre || '').replace(/"/g,'""')}"`,
    `"${(r.usuarios_perfil?.email  || '').replace(/"/g,'""')}"`,
    r.fecha,
    r.estado,
    r.hora_entrada?.slice(0,5) || '',
    r.hora_salida?.slice(0,5)  || '',
    r.minutos_tarde || 0,
    r.horas_trabajadas != null ? r.horas_trabajadas.toFixed(2) : '',
    `"${(r.observaciones || '').replace(/"/g,'""')}"`,
  ].join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  _descargar(blob, `asistencia_${fechaIni}_${fechaFin}.csv`);
  showToast('CSV exportado.', 'success');
}

// ─── Exportar Excel ───────────────────────────────────────────────────────────
async function exportarExcel() {
  const data = await _fetchExportData();
  if (!data) return;

  const { fechaIni, fechaFin } = _getFiltros();

  const filas = data.map(r => {
    const hrs = r.horas_trabajadas != null ? r.horas_trabajadas.toFixed(2) : '';
    return `<tr>
      <td>${_xesc(r.usuarios_perfil?.nombre || r.usuario_id)}</td>
      <td>${_xesc(r.usuarios_perfil?.email  || '')}</td>
      <td>${_xesc(r.fecha)}</td>
      <td>${_xesc(estadoLabel(r.estado))}</td>
      <td>${_xesc(r.hora_entrada?.slice(0,5) || '')}</td>
      <td>${_xesc(r.hora_salida?.slice(0,5)  || '')}</td>
      <td style="mso-number-format:'0'">${r.minutos_tarde || 0}</td>
      <td style="mso-number-format:'0.00'">${hrs}</td>
      <td>${_xesc(r.observaciones || '')}</td>
    </tr>`;
  }).join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"/>
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
    <x:ExcelWorksheet><x:Name>Asistencia</x:Name>
    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  </head><body>
  <table border="1" style="font-family:Arial;font-size:11px;">
    <thead style="background:#4a90d9;color:white;font-weight:bold;">
      <tr>
        <th>Empleado</th><th>Email</th><th>Fecha</th><th>Estado</th>
        <th>Entrada</th><th>Salida</th><th>Min Tarde</th><th>Hrs Trabajadas</th><th>Observaciones</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  </body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  _descargar(blob, `asistencia_${fechaIni}_${fechaFin}.xls`);
  showToast('Excel exportado.', 'success');
}

function _xesc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Exportar PDF (via impresión) ─────────────────────────────────────────────
function exportarPDF() {
  window.print();
}

// ─── Descarga helper ──────────────────────────────────────────────────────────
function _descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

