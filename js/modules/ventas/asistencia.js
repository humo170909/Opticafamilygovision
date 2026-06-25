/* asistencia.js — Módulo de asistencia personal para vendedor */
import { supabase }                              from '../../config/supabase.js';
import { checkAuth }                             from '../../core/auth.js';
import { initUI }                                from '../../core/ui.js';
import { formatDateLong }                        from '../../utils/formatters.js';
import { esc }                                   from '../../utils/validators.js';
import { showToast }                             from '../../utils/alerts.js';
import { fechaLima, horaLima, horaSegundosLima, minDesdeMedianoche } from '../../utils/tiempo.js';
import { notificarTardanza } from '../../utils/whatsapp.js';
import { invalidarCacheAsistencia } from '../../utils/asistencia-guard.js';
function formatFecha(fechaStr) {
  if (!fechaStr) return '—';
  const [y, m, d] = fechaStr.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d} ${meses[parseInt(m, 10) - 1]} ${y}`;
}

// ─── Estado global ────────────────────────────────────────────────────────────
let _usuario       = null;
let _config        = null;
let _registroHoy   = null;
let _clockInterval = null;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  _usuario = await checkAuth(['vendedor']);
  await initUI(_usuario);

  const hoy = fechaLima();
  const el  = (id) => document.getElementById(id);

  if (el('header-fecha')) el('header-fecha').textContent = 'Resumen del ' + formatDateLong(hoy);

  const [{ data: cfg }, { data: regHoy }] = await Promise.all([
    supabase.from('configuracion')
      .select('asistencia_hora_entrada,asistencia_hora_tardanza,asistencia_wsp_activo,asistencia_wsp_telefono,asistencia_wsp_apikey')
      .limit(1).single(),
    supabase.from('asistencia')
      .select('*')
      .eq('usuario_id', _usuario.id)
      .eq('fecha', hoy)
      .maybeSingle(),
  ]);

  _config      = cfg  || {};
  _registroHoy = regHoy || null;

  const limiteLabel = (_config.asistencia_hora_tardanza || '09:30').slice(0, 5);
  if (el('asi-subtexto')) {
    el('asi-subtexto').textContent = `Hora Lima · Tardanza a partir de las ${limiteLabel}`;
  }

  renderEstadoHoy();
  await cargarHistorial();

  el('btn-entrada')?.addEventListener('click', marcarEntrada);
  el('btn-salida')?.addEventListener('click',  marcarSalida);
});

// ─── Render estado hoy ────────────────────────────────────────────────────────
function renderEstadoHoy() {
  const el = (id) => document.getElementById(id);
  const r  = _registroHoy;

  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }

  // Sin entrada
  if (!r || !r.hora_entrada) {
    el('estado-idle').hidden    = false;
    el('estado-working').hidden = true;
    el('estado-done').hidden    = true;
    const tick = () => { if (el('reloj-idle')) el('reloj-idle').textContent = horaSegundosLima(); };
    tick();
    _clockInterval = setInterval(tick, 1000);
    return;
  }

  // Trabajando
  if (r.hora_entrada && !r.hora_salida) {
    el('estado-idle').hidden    = true;
    el('estado-working').hidden = false;
    el('estado-done').hidden    = true;

    const badge = r.estado === 'tardanza'
      ? `<span class="badge bw">Tardanza · ${r.minutos_tarde} min tarde</span>`
      : `<span class="badge bs">Puntual</span>`;
    if (el('working-info')) {
      el('working-info').innerHTML = `Entrada: <strong>${r.hora_entrada.slice(0, 5)}</strong> &nbsp;${badge}`;
    }
    const tickWork = () => {
      const mins = minDesdeMedianoche(horaLima()) - minDesdeMedianoche(r.hora_entrada);
      const h = Math.floor(Math.max(0, mins) / 60);
      const m = Math.max(0, mins) % 60;
      if (el('reloj-working')) el('reloj-working').textContent = `${h}h ${m}min`;
    };
    tickWork();
    _clockInterval = setInterval(tickWork, 30000);
    return;
  }

  // Jornada completa
  el('estado-idle').hidden    = true;
  el('estado-working').hidden = true;
  el('estado-done').hidden    = false;

  const mins = minDesdeMedianoche(r.hora_salida) - minDesdeMedianoche(r.hora_entrada);
  const h = Math.floor(Math.max(0, mins) / 60);
  const m = Math.max(0, mins) % 60;
  if (el('done-entrada')) el('done-entrada').textContent = r.hora_entrada.slice(0, 5);
  if (el('done-salida'))  el('done-salida').textContent  = r.hora_salida.slice(0, 5);
  if (el('done-total'))   el('done-total').textContent   = `${h}h ${m}min`;
  if (el('done-badge')) {
    el('done-badge').innerHTML = r.estado === 'tardanza'
      ? `<span class="badge bw">Tardanza · ${r.minutos_tarde} min</span>`
      : `<span class="badge bs">Puntual</span>`;
  }
}

// ─── Marcar entrada ───────────────────────────────────────────────────────────
async function marcarEntrada() {
  const btn   = document.getElementById('btn-entrada');
  const hora  = horaLima() + ':00';
  const fecha = fechaLima();

  if (btn) btn.disabled = true;

  // Verificar estado real en DB (cache-proof)
  const { data: registroDB } = await supabase
    .from('asistencia')
    .select('id, hora_entrada')
    .eq('usuario_id', _usuario.id)
    .eq('fecha', fecha)
    .maybeSingle();

  if (registroDB?.hora_entrada) {
    const { data: regFull } = await supabase.from('asistencia').select('*').eq('id', registroDB.id).single();
    _registroHoy = regFull || registroDB;
    renderEstadoHoy();
    await cargarHistorial();
    if (btn) btn.disabled = false;
    showToast('Ya tienes la entrada registrada para hoy.', 'warning');
    return;
  }

  const limite       = (_config?.asistencia_hora_tardanza || '09:30');
  const esTardanza   = minDesdeMedianoche(hora) >= minDesdeMedianoche(limite);
  const minutosTarde = esTardanza ? minDesdeMedianoche(hora) - minDesdeMedianoche(limite) : 0;
  const estado       = esTardanza ? 'tardanza' : 'presente';

  console.log('[marcarEntrada] Estado:', estado);
  console.log('[marcarEntrada] Minutos tarde:', minutosTarde);
  console.log('[marcarEntrada] Hora límite:', limite, '| Hora entrada:', hora);

  let justificacion = '';
  if (esTardanza) {
    try {
      justificacion = await pedirJustificacion(minutosTarde);
      console.log('[marcarEntrada] Justificación ingresada:', justificacion);
    } catch {
      console.log('[marcarEntrada] Modal cancelado — no se registra asistencia.');
      if (btn) btn.disabled = false;
      return;
    }
  }

  let resultado;
  if (registroDB?.id) {
    resultado = await supabase.from('asistencia')
      .update({ hora_entrada: hora, estado, minutos_tarde: minutosTarde, observaciones: justificacion || null })
      .eq('id', registroDB.id).select().single();
  } else {
    resultado = await supabase.from('asistencia')
      .insert({ usuario_id: _usuario.id, fecha, hora_entrada: hora, estado, minutos_tarde: minutosTarde, observaciones: justificacion || null })
      .select().single();
  }

  const { data, error } = resultado;
  if (btn) btn.disabled = false;

  if (error) {
    console.error('[marcarEntrada]', error.code, error.message);
    if (error.code === '23505') {
      const { data: reg } = await supabase.from('asistencia').select('*')
        .eq('usuario_id', _usuario.id).eq('fecha', fecha).maybeSingle();
      if (reg) { _registroHoy = reg; renderEstadoHoy(); await cargarHistorial(); }
      showToast('Tu asistencia de hoy ya fue registrada.', 'warning');
    } else if (error.code === '42501') {
      showToast('Sin permisos para registrar asistencia. Contacta al administrador.', 'error');
    } else {
      showToast('Error al marcar entrada: ' + error.message, 'error');
    }
    return;
  }

  _registroHoy = data;
  renderEstadoHoy();
  await cargarHistorial();
  invalidarCacheAsistencia();

  if (esTardanza) {
    notificarTardanza(_config, _usuario.nombre, hora.slice(0, 5), minutosTarde, justificacion, fecha);
    await mostrarConfirmacion();
  } else {
    showToast('Entrada registrada en horario', 'success');
  }
}

// ─── Modal justificación tardanza ─────────────────────────────────────────────
function pedirJustificacion(minutosTarde) {
  return new Promise((resolve, reject) => {
    const overlay  = document.getElementById('modal-tardanza');
    const textarea = document.getElementById('input-justificacion');
    const errorEl  = document.getElementById('justif-error');
    const btnConf  = document.getElementById('btn-tardanza-confirmar');
    const btnCan   = document.getElementById('btn-tardanza-cancelar');
    const subtext  = document.getElementById('tardanza-minutos-text');

    textarea.value         = '';
    errorEl.style.display  = 'none';
    errorEl.textContent    = '';
    textarea.classList.remove('error');
    subtext.textContent    = `Llegas con ${minutosTarde} minuto${minutosTarde !== 1 ? 's' : ''} de retraso`;
    overlay.hidden         = false;
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

// ─── Modal confirmación tardanza registrada ───────────────────────────────────
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

// ─── Marcar salida ────────────────────────────────────────────────────────────
async function marcarSalida() {
  if (!_registroHoy?.id) return;
  const btn  = document.getElementById('btn-salida');
  const hora = horaLima() + ':00';
  const mins = minDesdeMedianoche(hora) - minDesdeMedianoche(_registroHoy.hora_entrada);
  const horas = mins > 0 ? Math.round(mins * 100 / 60) / 100 : null;

  if (btn) btn.disabled = true;
  const { data, error } = await supabase.from('asistencia')
    .update({ hora_salida: hora, horas_trabajadas: horas })
    .eq('id', _registroHoy.id).select().single();
  if (btn) btn.disabled = false;

  if (error) { showToast('Error al marcar salida: ' + error.message, 'error'); return; }
  _registroHoy = data;
  renderEstadoHoy();
  await cargarHistorial();
  showToast('Salida registrada. ¡Hasta mañana!', 'success');
}

// ─── Historial ────────────────────────────────────────────────────────────────
async function cargarHistorial() {
  const tbody = document.getElementById('tabla-historial');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--c-ink-muted);">Cargando…</td></tr>';

  const hoy   = fechaLima();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 29);
  const desdeStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(desde);

  const { data: registros, error } = await supabase
    .from('asistencia')
    .select('*')
    .eq('usuario_id', _usuario.id)
    .gte('fecha', desdeStr)
    .order('fecha', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--c-danger);">Error al cargar historial.</td></tr>';
    return;
  }

  // Actualizar stats
  const el = (id) => document.getElementById(id);
  const presentes  = (registros || []).filter(r => r.estado === 'presente').length;
  const tardanzas  = (registros || []).filter(r => r.estado === 'tardanza').length;
  const ausentes   = (registros || []).filter(r => r.estado === 'ausente').length;
  const totalHoras = (registros || []).reduce((s, r) => s + (r.horas_trabajadas || 0), 0);

  if (el('stat-presentes')) el('stat-presentes').textContent = presentes + tardanzas;
  if (el('stat-tardanzas')) el('stat-tardanzas').textContent = tardanzas;
  if (el('stat-ausentes'))  el('stat-ausentes').textContent  = ausentes;
  if (el('stat-horas'))     el('stat-horas').textContent     = totalHoras.toFixed(1) + 'h';

  if (!registros?.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.82rem;">Sin registros en los últimos 30 días.</td></tr>';
    return;
  }

  const badgeMap = { presente: 'bs', tardanza: 'bw', ausente: 'bd', pendiente: 'bn' };
  const labelMap = { presente: 'Presente', tardanza: 'Tardanza', ausente: 'Ausente', pendiente: 'Sin registro' };

  tbody.innerHTML = registros.map(r => {
    const cls   = badgeMap[r.estado] || 'bn';
    const label = labelMap[r.estado] || r.estado;
    const mins  = r.minutos_tarde || 0;
    const hrs   = r.horas_trabajadas != null ? r.horas_trabajadas.toFixed(2) + 'h' : '—';
    const esHoy = r.fecha === hoy ? ' style="background:rgba(74,144,217,.04);"' : '';
    const esHoyTag = r.fecha === hoy ? ' <span style="font-size:.7rem;color:var(--c-accent);font-weight:700;">Hoy</span>' : '';
    return `<tr${esHoy}>
      <td style="font-size:.82rem;font-weight:600;">${esc(formatFecha(r.fecha))}${esHoyTag}</td>
      <td style="font-family:var(--font-display);font-size:.84rem;">${r.hora_entrada ? r.hora_entrada.slice(0, 5) : '—'}</td>
      <td style="font-family:var(--font-display);font-size:.84rem;">${r.hora_salida  ? r.hora_salida.slice(0, 5)  : '—'}</td>
      <td><span class="badge ${cls}">${esc(label)}</span></td>
      <td style="text-align:center;font-size:.82rem;">${mins ? mins + ' min' : '—'}</td>
      <td style="text-align:center;font-family:var(--font-display);font-size:.84rem;">${hrs}</td>
    </tr>`;
  }).join('');
}

