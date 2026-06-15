/* dashboard-vendedor.js — Panel principal para rol vendedor */
import { supabase }                          from '../../config/supabase.js';
import { checkAuth }                         from '../../core/auth.js';
import { initUI, getCurrentUser }            from '../../core/ui.js';
import { formatCurrency, formatDateLong, timeAgo } from '../../utils/formatters.js';
import { esc }                               from '../../utils/validators.js';
import { showToast }                         from '../../utils/alerts.js';
import { fechaLima, horaLima, horaSegundosLima, minDesdeMedianoche } from '../../utils/tiempo.js';
import { notificarTardanza } from '../../utils/whatsapp.js';
import { verificarAsistencia, actualizarIndicadorSidebar } from '../../utils/asistencia-guard.js';

document.addEventListener('DOMContentLoaded', async () => {
  const usuario = await checkAuth(['vendedor']);
  await initUI(usuario);

  const hoy   = fechaLima();
  const larga = formatDateLong(hoy);
  const el    = (id) => document.getElementById(id);

  if (el('header-date')) el('header-date').textContent = 'Resumen del ' + larga;

  actualizarIndicadorSidebar();

  // Widget de asistencia (no bloquea el resto del dashboard)
  iniciarWidgetAsistencia(usuario);

  await Promise.all([
    cargarKPIs(usuario, hoy),
    cargarCitasHoy(hoy),
    cargarMisVentas(usuario),
    cargarAlertasStock(),
    cargarEstadoJornada(),
  ]);
});

// ─── Estado de Jornada ────────────────────────────────────────────────────────
async function cargarEstadoJornada() {
  const el = (id) => document.getElementById(id);
  const ok = await verificarAsistencia();

  const dot = el('jornada-dot');
  const val = el('jornada-valor');
  const btn = el('jornada-btn-marcar');

  if (ok) {
    if (dot) dot.style.background = 'var(--c-success)';
    if (val) val.textContent = '🟢 Entrada registrada';
    if (btn) btn.style.display = 'none';
  } else {
    if (dot) dot.style.background = 'var(--c-danger)';
    if (val) val.textContent = '🔴 Pendiente de marcar entrada';
    if (btn) btn.style.display = 'inline-flex';
  }
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
async function cargarKPIs(usuario, hoy) {
  const el = (id) => document.getElementById(id);

  // Ventas de hoy del vendedor actual
  let qKpi = supabase
    .from('ventas')
    .select('total')
    .gte('created_at', hoy + 'T00:00:00-05:00')
    .lte('created_at', hoy + 'T23:59:59-05:00')
    .neq('estado', 'cancelada');

  if (usuario?.id) qKpi = qKpi.eq('created_by', usuario.id);

  const { data: vh, error: errKpi } = await qKpi;
  if (errKpi) console.error('[cargarKPIs] ventas error:', errKpi);
  const ventas = vh || [];
  if (el('kpi-count-hoy'))  el('kpi-count-hoy').textContent  = ventas.length;
  if (el('kpi-total-hoy'))  el('kpi-total-hoy').textContent  = formatCurrency(ventas.reduce((s, v) => s + Number(v.total), 0));

  // Citas hoy
  const { count: citasHoy } = await supabase
    .from('citas')
    .select('*', { count: 'exact', head: true })
    .eq('fecha', hoy)
    .neq('estado', 'cancelada');
  if (el('kpi-citas-hoy')) el('kpi-citas-hoy').textContent = citasHoy || 0;
}

// ─── Citas de hoy ─────────────────────────────────────────────────────────────
async function cargarCitasHoy(hoy) {
  const contenedor = document.getElementById('citas-hoy');
  if (!contenedor) return;

  const { data: citas, error } = await supabase
    .from('citas')
    .select('id, hora, tipo, estado, pacientes(nombres, apellidos)')
    .eq('fecha', hoy)
    .neq('estado', 'cancelada')
    .order('hora');

  if (error || !citas?.length) {
    contenedor.innerHTML = '<p style="text-align:center;color:var(--c-ink-muted);font-size:.82rem;padding:20px 0;">Sin citas agendadas para hoy.</p>';
    return;
  }

  const estadoBadge = { confirmada:'bs', pendiente:'bw', cancelada:'bd', completada:'bn', 'en camino':'bi' };
  contenedor.innerHTML = citas.slice(0, 6).map(c => {
    const nombre = c.pacientes ? `${esc(c.pacientes.nombres)} ${esc(c.pacientes.apellidos)}` : '—';
    const badge  = estadoBadge[c.estado] || 'bn';
    return `
      <div class="apt-item">
        <span class="apt-time">${esc(c.hora?.slice(0,5) || '')}</span>
        <div class="apt-info">
          <div class="apt-name">${nombre}</div>
          <div class="apt-reason">${esc(c.tipo || '')}</div>
        </div>
        <span class="badge ${badge}">${esc(c.estado || '')}</span>
      </div>`;
  }).join('');
}

// ─── Mis últimas ventas ────────────────────────────────────────────────────────
async function cargarMisVentas(usuario) {
  const tbody = document.getElementById('tabla-mis-ventas');
  if (!tbody) return;

  let qVentas = supabase
    .from('ventas')
    .select('total, metodo_pago, created_at, pacientes(nombres, apellidos)')
    .neq('estado', 'cancelada')
    .order('created_at', { ascending: false })
    .limit(6);

  if (usuario?.id) qVentas = qVentas.eq('created_by', usuario.id);

  const { data: ventas, error } = await qVentas;
  if (error) console.error('[cargarMisVentas] error:', error);

  if (error || !ventas?.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--c-ink-muted);font-size:.82rem;">Sin ventas registradas.</td></tr>';
    return;
  }

  const metodoBadge = { efectivo:'bs', yape:'bi', tarjeta:'bn', transferencia:'bw' };
  tbody.innerHTML = ventas.map(v => {
    const nombre = v.pacientes ? `${esc(v.pacientes.apellidos)}, ${esc(v.pacientes.nombres?.split(' ')[0])}` : '—';
    const badge  = metodoBadge[v.metodo_pago?.toLowerCase()] || 'bn';
    return `
      <tr>
        <td>
          <div>${nombre}</div>
          <div class="td-sub">${timeAgo(v.created_at)}</div>
        </td>
        <td><span class="badge ${badge}">${esc(v.metodo_pago || '—')}</span></td>
        <td class="td-money">${formatCurrency(v.total)}</td>
      </tr>`;
  }).join('');
}

// ─── Widget de asistencia ─────────────────────────────────────────────────────
let _attInterval = null;
let _attRegistro = null;
let _attConfig   = null;

async function iniciarWidgetAsistencia(usuario) {
  const { data: cfg } = await supabase.from('configuracion').select(
    'asistencia_hora_entrada,asistencia_hora_tardanza,asistencia_wsp_activo'
  ).limit(1).single();
  _attConfig = cfg || {};

  const horaTardanzaLabel = (_attConfig.asistencia_hora_tardanza || '09:30').slice(0, 5);
  const el = (id) => document.getElementById(id);
  if (el('att-subtexto-idle')) {
    el('att-subtexto-idle').textContent = `Hora Lima · Tardanza a partir de las ${horaTardanzaLabel}`;
  }

  // Cargar registro de hoy
  const fecha = fechaLima();
  const { data: reg } = await supabase
    .from('asistencia')
    .select('*')
    .eq('usuario_id', usuario.id)
    .eq('fecha', fecha)
    .maybeSingle();

  _attRegistro = reg;
  renderWidgetAsistencia(usuario);

  // Wiring botones
  el('btn-marcar-entrada')?.addEventListener('click', () => attMarcarEntrada(usuario));
  el('btn-marcar-salida')?.addEventListener('click',  () => attMarcarSalida(usuario));
}

function renderWidgetAsistencia(usuario) {
  const el  = (id) => document.getElementById(id);
  const r   = _attRegistro;

  // Limpiar intervalo previo
  if (_attInterval) { clearInterval(_attInterval); _attInterval = null; }

  if (!r || !r.hora_entrada) {
    // Sin registro, o existe pero sin hora_entrada (auto-marcado ausente/pendiente)
    el('att-state-idle').hidden    = false;
    el('att-state-working').hidden = true;
    el('att-state-done').hidden    = true;
    el('att-acciones-idle').hidden    = false;
    el('att-acciones-working').hidden = true;
    const tick = () => { const re = el('att-reloj-idle'); if (re) re.textContent = horaSegundosLima(); };
    tick();
    _attInterval = setInterval(tick, 1000);

  } else if (r.hora_entrada && !r.hora_salida) {
    // Estado: trabajando — mostrar contador de horas
    el('att-state-idle').hidden    = true;
    el('att-state-working').hidden = false;
    el('att-state-done').hidden    = true;
    el('att-acciones-idle').hidden    = true;
    el('att-acciones-working').hidden = false;

    const badge = r.estado === 'tardanza'
      ? `<span class="badge bw">Tardanza · ${esc(String(r.minutos_tarde))} min tarde</span>`
      : `<span class="badge bs">En horario</span>`;
    const infoEl = el('att-info-working');
    if (infoEl) infoEl.innerHTML = `Entrada: <strong>${esc(r.hora_entrada.slice(0,5))}</strong> &nbsp;${badge}`;

    const tickWork = () => {
      const mins = minDesdeMedianoche(horaLima()) - minDesdeMedianoche(r.hora_entrada);
      const h = Math.floor(Math.max(0, mins) / 60);
      const m = Math.max(0, mins) % 60;
      const re = el('att-reloj-working');
      if (re) re.textContent = `${h}h ${m}min`;
    };
    tickWork();
    _attInterval = setInterval(tickWork, 30000);

  } else if (r.hora_entrada && r.hora_salida) {
    // Estado: jornada completa
    el('att-state-idle').hidden    = true;
    el('att-state-working').hidden = true;
    el('att-state-done').hidden    = false;
    el('att-acciones-idle').hidden    = true;
    el('att-acciones-working').hidden = true;

    const mins = minDesdeMedianoche(r.hora_salida) - minDesdeMedianoche(r.hora_entrada);
    const h = Math.floor(Math.max(0, mins) / 60);
    const m = Math.max(0, mins) % 60;
    if (el('att-done-entrada')) el('att-done-entrada').textContent = r.hora_entrada.slice(0, 5);
    if (el('att-done-salida'))  el('att-done-salida').textContent  = r.hora_salida.slice(0, 5);
    if (el('att-done-total'))   el('att-done-total').textContent   = `${h}h ${m}min`;
    const badgeEl = el('att-done-badge');
    if (badgeEl) badgeEl.innerHTML = r.estado === 'tardanza'
      ? `<span class="badge bw">Tardanza · ${esc(String(r.minutos_tarde))} min</span>`
      : `<span class="badge bs">Puntual</span>`;
  }
}

async function attMarcarEntrada(usuario) {
  const btn   = document.getElementById('btn-marcar-entrada');
  const hora  = horaLima() + ':00';
  const fecha = fechaLima();

  if (btn) btn.disabled = true;

  // Verificar estado real en DB (cache-proof)
  const { data: registroDB } = await supabase
    .from('asistencia')
    .select('id, hora_entrada, hora_salida, estado, minutos_tarde')
    .eq('usuario_id', usuario.id)
    .eq('fecha', fecha)
    .maybeSingle();

  if (registroDB?.hora_entrada) {
    const { data: regFull } = await supabase.from('asistencia').select('*').eq('id', registroDB.id).single();
    _attRegistro = regFull || registroDB;
    renderWidgetAsistencia(usuario);
    if (btn) btn.disabled = false;
    showToast('Ya tienes la entrada registrada para hoy.', 'warning');
    return;
  }

  const limite       = (_attConfig?.asistencia_hora_tardanza || '09:30');
  const esTardanza   = minDesdeMedianoche(hora) >= minDesdeMedianoche(limite);
  const minutosTarde = esTardanza ? minDesdeMedianoche(hora) - minDesdeMedianoche(limite) : 0;
  const estado       = esTardanza ? 'tardanza' : 'presente';

  console.log('[attMarcarEntrada] Estado:', estado);
  console.log('[attMarcarEntrada] Minutos tarde:', minutosTarde);
  console.log('[attMarcarEntrada] Hora límite:', limite, '| Hora entrada:', hora);

  let justificacion = '';
  if (esTardanza) {
    try {
      justificacion = await pedirJustificacionWidget(minutosTarde);
      console.log('[attMarcarEntrada] Justificación ingresada:', justificacion);
    } catch {
      // Usuario canceló el modal
      console.log('[attMarcarEntrada] Modal cancelado — no se registra asistencia.');
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
      .insert({ usuario_id: usuario.id, fecha, hora_entrada: hora, estado, minutos_tarde: minutosTarde, observaciones: justificacion || null })
      .select().single();
  }

  const { data, error } = resultado;

  if (error) {
    console.error('[attMarcarEntrada] error código:', error.code, '| mensaje:', error.message);
    if (error.code === '23505') {
      const { data: reg } = await supabase.from('asistencia').select('*')
        .eq('usuario_id', usuario.id).eq('fecha', fecha).maybeSingle();
      if (reg) { _attRegistro = reg; renderWidgetAsistencia(usuario); }
      showToast('Tu asistencia de hoy ya fue registrada.', 'warning');
    } else if (error.code === '42501') {
      showToast('Sin permisos para registrar asistencia. Contacta al administrador.', 'error');
    } else {
      showToast('Error al marcar entrada: ' + error.message, 'error');
    }
    if (btn) btn.disabled = false;
    return;
  }

  if (btn) btn.disabled = false;
  _attRegistro = data;
  renderWidgetAsistencia(usuario);

  if (esTardanza) {
    // Actualiza el detalle del modal de confirmación con los minutos reales
    const detEl = document.getElementById('confirmacion-detalle');
    if (detEl) detEl.innerHTML = `Su asistencia fue registrada correctamente.<br>Justificación almacenada.<br><strong>Tardanza registrada: ${minutosTarde} minutos.</strong>`;
    notificarTardanza(_attConfig, usuario.nombre, hora.slice(0, 5), minutosTarde, justificacion, fecha);
    await mostrarConfirmacionWidget();
  } else {
    showToast('Entrada registrada en horario', 'success');
  }
}

// ─── Modal justificación tardanza (widget dashboard) ──────────────────────────
function pedirJustificacionWidget(minutosTarde) {
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
        errorEl.textContent   = '⚠️ Debe ingresar una justificación válida.';
        errorEl.style.display = 'block';
        textarea.classList.add('error');
        textarea.focus();
        return;
      }
      if (val.length < 10) {
        errorEl.textContent   = '⚠️ La justificación debe tener al menos 10 caracteres.';
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

// ─── Modal confirmación tardanza registrada (widget dashboard) ────────────────
function mostrarConfirmacionWidget() {
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

async function attMarcarSalida(usuario) {
  if (!_attRegistro?.id) return;
  const btn  = document.getElementById('btn-marcar-salida');
  const hora = horaLima() + ':00';
  const mins = minDesdeMedianoche(hora) - minDesdeMedianoche(_attRegistro.hora_entrada);
  const horas = mins > 0 ? Math.round(mins * 100 / 60) / 100 : null;

  if (btn) btn.disabled = true;
  const { data, error } = await supabase.from('asistencia')
    .update({ hora_salida: hora, horas_trabajadas: horas })
    .eq('id', _attRegistro.id)
    .select().single();
  if (btn) btn.disabled = false;

  if (error) { showToast('Error al marcar salida: ' + error.message, 'error'); return; }
  _attRegistro = data;
  renderWidgetAsistencia(usuario);
  showToast('Salida registrada. ¡Hasta mañana!', 'success');
}


// ─── Alertas de stock ─────────────────────────────────────────────────────────
async function cargarAlertasStock() {
  const contenedor = document.getElementById('alertas-stock');
  if (!contenedor) return;

  const { data: prods, error } = await supabase
    .from('productos')
    .select('nombre, stock_actual, stock_minimo')
    .eq('activo', true)
    .order('stock_actual');

  const alertas = (prods || []).filter(p => p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo).slice(0, 5);

  if (error || !alertas.length) {
    contenedor.innerHTML = '<p style="text-align:center;color:var(--c-success);font-size:.82rem;padding:20px 0;">✓ Todos los productos tienen stock suficiente.</p>';
    return;
  }

  contenedor.innerHTML = alertas.map(p => `
    <div class="stock-item">
      <div class="stock-ico">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
        </svg>
      </div>
      <div class="stock-info">
        <div class="stock-name">${esc(p.nombre)}</div>
        <div class="stock-detail">Mín: ${p.stock_minimo} · Actual: <strong>${p.stock_actual}</strong></div>
      </div>
      <span class="stock-qty">${p.stock_actual}</span>
    </div>`).join('');
}
