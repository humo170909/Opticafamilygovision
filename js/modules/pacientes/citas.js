/* citas.js — Gestión de citas con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast }      from '../../utils/alerts.js';
import { formatDate, formatInitials } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';
import { requireAsistencia, actualizarIndicadorSidebar } from '../../utils/asistencia-guard.js';
import { fechaLima } from '../../utils/tiempo.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth();
  await initUI(_usuario);
  actualizarIndicadorSidebar();

  const el  = (id) => document.getElementById(id);
  // Calcular "hoy" en Lima para evitar desfases UTC
  const hoyStr = fechaLima(); // "YYYY-MM-DD"
  const [hoyY, hoyM0, hoyD] = hoyStr.split('-').map(Number);
  const hoyMonth = hoyM0 - 1; // 0-indexed para Date
  let fechaActual = new Date(hoyY, hoyMonth, 1);
  let diasConCitas  = new Set();
  let citasHoyCache = [];
  let pacientesOpts = [];

  // ── Cargar pacientes para el select del modal ────────────────────────────────
  async function cargarPacientesSelect() {
    const { data } = await supabase.from('pacientes').select('id, nombres, apellidos').eq('activo', true).order('apellidos');
    pacientesOpts  = data || [];
    const select   = el('select-paciente-cita');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar paciente…</option>' +
      pacientesOpts.map(p => `<option value="${p.id}">${esc(p.apellidos)}, ${esc(p.nombres)}</option>`).join('') +
      '<option value="nuevo">＋ Paciente nuevo…</option>';
    select.addEventListener('change', () => {
      const campos = el('nuevo-paciente-fields');
      if (campos) campos.style.display = select.value === 'nuevo' ? '' : 'none';
    });
  }

  // ── Cargar citas del día ──────────────────────────────────────────────────────
  async function cargarCitasDia(fecha) {
    const fechaStr = fecha instanceof Date
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha)
      : fecha;

    const { data: citas, error } = await supabase
      .from('citas')
      .select('id, hora, tipo, estado, notas, paciente_id, pacientes(nombres, apellidos, dni, telefono)')
      .eq('fecha', fechaStr)
      .order('hora');

    if (error) { showToast('Error al cargar citas.', 'error'); return; }
    citasHoyCache = citas || [];
    renderCitas(citasHoyCache);
    actualizarStats();
  }

  // ── Cargar días del mes con citas ────────────────────────────────────────────
  async function cargarDiasConCitas(año, mes) {
    const inicio = new Date(Date.UTC(año, mes, 1)).toISOString().split('T')[0];
    const fin    = new Date(Date.UTC(año, mes + 1, 0)).toISOString().split('T')[0];

    const { data } = await supabase
      .from('citas')
      .select('fecha')
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .neq('estado', 'cancelada');

    diasConCitas = new Set((data || []).map(c => new Date(c.fecha + 'T00:00:00').getDate()));
    renderCalendario();
  }

  // ── Render lista de citas ─────────────────────────────────────────────────────
  function renderCitas(citas) {
    const listEl = el('lista-citas') || document.querySelector('.cita-list');
    if (!listEl) return;

    if (!citas.length) {
      listEl.innerHTML = '<p style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.83rem;">Sin citas para este día.</p>';
      return;
    }

    const estadoInfo = {
      confirmada: { badge: 'bs', barra: 'confirmada' },
      pendiente:  { badge: 'bw', barra: 'pendiente'  },
      cancelada:  { badge: 'bd', barra: 'cancelada'  },
      completada: { badge: 'bn', barra: 'confirmada' },
    };

    listEl.innerHTML = citas.map(c => {
      const info   = estadoInfo[c.estado] || estadoInfo.pendiente;
      const nombre = c.pacientes ? `${esc(c.pacientes.nombres)} ${esc(c.pacientes.apellidos)}` : '—';
      return `
        <div class="cita-item" data-id="${c.id}">
          <span class="cita-hora">${esc(c.hora?.slice(0, 5) || '')}</span>
          <div class="cita-barra ${info.barra}"></div>
          <div class="cita-info">
            <div class="cita-paciente">${nombre}</div>
            <div class="cita-motivo">${esc(c.tipo || '')}</div>
          </div>
          <span class="badge ${info.badge}">${esc(c.estado || '')}</span>
          <div class="cita-actions">
            <button class="btn-row btn-confirmar" data-id="${c.id}" title="Confirmar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn-row btn-cancelar-cita danger" data-id="${c.id}" title="Cancelar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    // Delegación de eventos en lista (una vez por render, se reemplaza con innerHTML)
    listEl.querySelectorAll('.cita-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.cita-actions')) return;
        listEl.querySelectorAll('.cita-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        mostrarDetalle(item.dataset.id);
      });
    });

    listEl.querySelectorAll('.btn-confirmar').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); cambiarEstado(btn.dataset.id, 'confirmada'); });
    });

    listEl.querySelectorAll('.btn-cancelar-cita').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); cambiarEstado(btn.dataset.id, 'cancelada'); });
    });
  }

  // ── Mostrar detalle de cita ───────────────────────────────────────────────────
  function mostrarDetalle(id) {
    const cita    = citasHoyCache.find(c => String(c.id) === String(id));
    const emptyEl = el('detalle-empty');
    const contEl  = el('detalle-content');
    if (!cita || !contEl) return;

    if (emptyEl) emptyEl.style.display = 'none';
    contEl.style.display = 'block';

    const nombre = cita.pacientes ? `${cita.pacientes.nombres} ${cita.pacientes.apellidos}` : '—';
    const initials = formatInitials(nombre);

    // Actualizar detalle estático del HTML
    const detAvatar = contEl.querySelector('.det-avatar');
    const detNombre = contEl.querySelector('.det-nombre');
    const detMeta   = contEl.querySelector('.det-meta');
    if (detAvatar) detAvatar.textContent = initials;
    if (detNombre) detNombre.textContent = nombre;
    if (detMeta)   detMeta.textContent   = [cita.pacientes?.dni ? `DNI ${cita.pacientes.dni}` : '', cita.pacientes?.telefono || ''].filter(Boolean).join(' · ');

    const items = contEl.querySelectorAll('.det-item .det-valor');
    const estadoBadge = { confirmada:'bs', pendiente:'bw', cancelada:'bd', completada:'bn' };
    if (items[0]) items[0].textContent = formatDate(cita.fecha);
    if (items[1]) items[1].textContent = cita.hora?.slice(0, 5) || '—';
    if (items[2]) items[2].textContent = cita.tipo || '—';
    if (items[3]) items[3].innerHTML   = `<span class="badge ${estadoBadge[cita.estado] || 'bn'}">${esc(cita.estado || '')}</span>`;

    const notaEl = contEl.querySelector('.det-nota');
    if (notaEl) notaEl.lastChild && (notaEl.lastChild.textContent = cita.notas || 'Sin notas.');

    // Botón "ver historial"
    const btnHistorial = contEl.querySelector('a[href*="historial"]');
    if (btnHistorial && cita.paciente_id) {
      btnHistorial.href = `historial.html?id=${cita.paciente_id}`;
    }

    // Botón "marcar completada"
    const btnCompleta = contEl.querySelector('.btn-primary');
    if (btnCompleta) {
      btnCompleta.onclick = () => cambiarEstado(cita.id, 'completada');
    }
  }

  // ── Cambiar estado de cita ────────────────────────────────────────────────────
  async function cambiarEstado(id, nuevoEstado) {
    const { error } = await supabase.from('citas').update({ estado: nuevoEstado }).eq('id', id);
    if (error) { showToast('Error al actualizar cita.', 'error'); return; }
    showToast(`Cita marcada como ${nuevoEstado}.`, 'success');
    // Refrescar día actual
    const diaSeleccionado = document.querySelector('.cal-day.selected');
    const dia = diaSeleccionado ? Number(diaSeleccionado.dataset.dia) : hoy.getDate();
    const fecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), dia);
    await cargarCitasDia(fecha);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  function actualizarStats() {
    const total      = citasHoyCache.length;
    const confirmadas = citasHoyCache.filter(c => c.estado === 'confirmada' || c.estado === 'completada').length;
    const pendientes  = citasHoyCache.filter(c => c.estado === 'pendiente').length;

    const vals = document.querySelectorAll('.stat-value');
    if (vals[0]) vals[0].textContent = total;
    if (vals[1]) vals[1].textContent = confirmadas;
    if (vals[2]) vals[2].textContent = pendientes;
  }

  // ── Calendario ────────────────────────────────────────────────────────────────
  function renderCalendario() {
    const año  = fechaActual.getFullYear();
    const mes  = fechaActual.getMonth();

    if (el('cal-mes')) {
      el('cal-mes').textContent = new Date(año, mes, 1)
        .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase());
    }

    const grid = el('cal-dias');
    if (!grid) return;
    grid.innerHTML = '';

    const primerDia  = new Date(año, mes, 1).getDay();
    const diasEnMes  = new Date(año, mes + 1, 0).getDate();
    const offset     = primerDia === 0 ? 6 : primerDia - 1;
    const diasMesAnt = new Date(año, mes, 0).getDate();

    for (let i = offset - 1; i >= 0; i--) {
      const d = document.createElement('div');
      d.className = 'cal-day otro-mes';
      d.textContent = diasMesAnt - i;
      grid.appendChild(d);
    }

    for (let dia = 1; dia <= diasEnMes; dia++) {
      const d   = document.createElement('div');
      d.className = 'cal-day';
      d.dataset.dia = dia;
      const esHoy = dia === hoyD && mes === hoyMonth && año === hoyY;
      if (esHoy) d.classList.add('today');
      d.innerHTML = `<span>${dia}</span>`;
      if (diasConCitas.has(dia)) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot';
        d.appendChild(dot);
      }
      d.addEventListener('click', () => {
        grid.querySelectorAll('.cal-day.selected').forEach(x => x.classList.remove('selected'));
        d.classList.add('selected');
        const fecha = new Date(año, mes, dia);
        actualizarSubtituloDia(dia, mes, año);
        cargarCitasDia(fecha);
      });
      grid.appendChild(d);
    }

    const restantes = (grid.children.length % 7 === 0) ? 0 : 7 - (grid.children.length % 7);
    for (let i = 1; i <= restantes; i++) {
      const d = document.createElement('div');
      d.className = 'cal-day otro-mes';
      d.textContent = i;
      grid.appendChild(d);
    }
  }

  function actualizarSubtituloDia(dia, mes, año) {
    const fecha = new Date(año, mes, dia).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    const sub   = el('lista-subtitle');
    if (sub) sub.textContent = fecha.replace(/^\w/, c => c.toUpperCase());
  }

  el('cal-prev')?.addEventListener('click', async () => {
    fechaActual.setMonth(fechaActual.getMonth() - 1);
    await cargarDiasConCitas(fechaActual.getFullYear(), fechaActual.getMonth());
  });

  el('cal-next')?.addEventListener('click', async () => {
    fechaActual.setMonth(fechaActual.getMonth() + 1);
    await cargarDiasConCitas(fechaActual.getFullYear(), fechaActual.getMonth());
  });

  // ── Modal nueva cita ──────────────────────────────────────────────────────────
  el('btn-nueva-cita')?.addEventListener('click', () => {
    const fechaInput = el('modal-cita')?.querySelector('input[type="date"]');
    if (fechaInput) fechaInput.value = hoyStr;
    const select = el('select-paciente-cita');
    if (select) select.value = '';
    const campos = el('nuevo-paciente-fields');
    if (campos) campos.style.display = 'none';
    el('modal-cita')?.classList.add('open');
  });

  el('btn-close-modal')?.addEventListener('click',    () => el('modal-cita')?.classList.remove('open'));
  el('btn-cancelar-modal')?.addEventListener('click', () => el('modal-cita')?.classList.remove('open'));
  el('modal-cita')?.addEventListener('click', (e) => { if (e.target === el('modal-cita')) el('modal-cita').classList.remove('open'); });

  el('form-cita')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await requireAsistencia('registrar citas'))) return;
    const form = e.target;
    let pacienteId   = el('select-paciente-cita')?.value;
    const fecha      = form.querySelector('input[type="date"]')?.value;
    const hora       = form.querySelector('input[type="time"]')?.value;
    const tipo       = form.querySelectorAll('select')[1]?.value || 'Control de vista';
    const notas      = form.querySelector('textarea')?.value.trim() || null;

    if (!pacienteId) { showToast('Selecciona un paciente.', 'warning'); return; }
    if (!fecha)      { showToast('Indica la fecha de la cita.', 'warning'); return; }
    if (!hora)       { showToast('Indica la hora de la cita.', 'warning'); return; }

    if (pacienteId === 'nuevo') {
      const nombres   = el('input-nuevo-nombres')?.value.trim();
      const apellidos = el('input-nuevo-apellidos')?.value.trim();
      if (!nombres || !apellidos) { showToast('Ingresa nombre y apellidos del paciente nuevo.', 'warning'); return; }
      const { data: nuevoPac, error: errPac } = await supabase
        .from('pacientes').insert({ nombres, apellidos }).select('id').single();
      if (errPac || !nuevoPac) { showToast('Error al registrar el paciente.', 'error'); return; }
      pacienteId = nuevoPac.id;
    }

    const { error } = await supabase.from('citas').insert({
      paciente_id: pacienteId, fecha, hora, tipo, notas, estado: 'pendiente',
    });

    if (error) { showToast('Error al agendar cita.', 'error'); return; }
    el('modal-cita')?.classList.remove('open');
    form.reset();
    const campos = el('nuevo-paciente-fields');
    if (campos) campos.style.display = 'none';
    showToast('Cita agendada correctamente.', 'success');
    await cargarDiasConCitas(fechaActual.getFullYear(), fechaActual.getMonth());
    if (fecha === hoyStr) await cargarCitasDia(hoyStr);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el('modal-cita')?.classList.remove('open'); });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await Promise.all([
    cargarPacientesSelect(),
    cargarDiasConCitas(fechaActual.getFullYear(), fechaActual.getMonth()),
    cargarCitasDia(hoyStr),
  ]);

  actualizarSubtituloDia(hoyD, hoyMonth, hoyY);
});

