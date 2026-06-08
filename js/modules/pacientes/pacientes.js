/* pacientes.js — CRUD de pacientes con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatDate, formatPhone, formatInitials } from '../../utils/formatters.js';
import { esc, isValidDNI, isRequired } from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth();
  await initUI(_usuario);

  const el  = (id) => document.getElementById(id);
  let pacientesCache = [];

  // ── Cargar pacientes ─────────────────────────────────────────────────────────
  async function cargarPacientes(busqueda = '', estado = '') {
    let query = supabase
      .from('pacientes')
      .select('*')
      .order('apellidos');

    if (busqueda) {
      query = query.or(`nombres.ilike.%${busqueda}%,apellidos.ilike.%${busqueda}%,dni.ilike.%${busqueda}%`);
    }
    if (estado === 'activo')   query = query.eq('activo', true);
    if (estado === 'inactivo') query = query.eq('activo', false);

    const { data, error } = await query;
    if (error) { showToast('Error al cargar pacientes.', 'error'); return; }
    pacientesCache = data || [];
    renderTabla(pacientesCache);
  }

  // ── Render tabla ─────────────────────────────────────────────────────────────
  function renderTabla(pacientes) {
    const tbody = document.querySelector('#tabla-pacientes tbody');
    const info  = el('pag-info');
    if (!tbody) return;

    if (info) info.textContent = `${pacientes.length} paciente${pacientes.length !== 1 ? 's' : ''}`;

    if (!pacientes.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-ink-muted);">Sin pacientes registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = pacientes.map(p => {
      const nombre  = `${esc(p.apellidos)}, ${esc(p.nombres)}`;
      const initials = formatInitials(`${p.nombres} ${p.apellidos}`);
      const edad    = p.fecha_nacimiento ? calcularEdad(p.fecha_nacimiento) : '—';
      const badge   = p.activo ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-neutral">Inactivo</span>';
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;border-radius:50%;background:#e8f1f8;color:#355472;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;flex-shrink:0;">${esc(initials)}</div>
              <div>
                <div style="font-weight:600;color:var(--c-ink);font-size:.87rem;">${nombre}</div>
                <div style="font-size:.75rem;color:var(--c-ink-muted);">DNI: ${esc(p.dni) || '—'}</div>
              </div>
            </div>
          </td>
          <td>${esc(p.dni) || '—'}</td>
          <td>${edad}</td>
          <td>${formatPhone(p.telefono)}</td>
          <td style="font-size:.82rem;color:var(--c-ink-muted);">${esc(p.email) || '—'}</td>
          <td>${badge}</td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn-icon" title="Ver historial" data-action="historial" data-id="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="btn-icon" title="Editar" data-action="editar" data-id="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon --danger" title="Eliminar" data-action="eliminar" data-id="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Delegación de eventos en tabla ───────────────────────────────────────────
  document.querySelector('#tabla-pacientes')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = btn.dataset.id;
    const accion = btn.dataset.action;

    if (accion === 'historial') {
      window.location.href = `historial.html?id=${id}`;
    }
    if (accion === 'editar') {
      const pac = pacientesCache.find(p => p.id === id);
      if (pac) abrirModal(pac);
    }
    if (accion === 'eliminar') {
      const pac = pacientesCache.find(p => p.id === id);
      const ok  = await confirmDialog(`¿Eliminar a <strong>${esc(pac?.nombres)} ${esc(pac?.apellidos)}</strong>?<br><small>Se eliminará todo su historial.</small>`, { title: 'Eliminar Paciente' });
      if (ok) {
        const { error } = await supabase.from('pacientes').delete().eq('id', id);
        if (error) { showToast('No se pudo eliminar el paciente.', 'error'); return; }
        showToast('Paciente eliminado.', 'success');
        cargarPacientes();
      }
    }
  });

  // ── Búsqueda y filtros ───────────────────────────────────────────────────────
  let timer;
  el('search-pacientes')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const filtroEstado = el('filtro-estado')?.value || '';
      cargarPacientes(e.target.value.trim(), filtroEstado);
    }, 300);
  });

  el('filtro-estado')?.addEventListener('change', (e) => {
    const busq = el('search-pacientes')?.value.trim() || '';
    cargarPacientes(busq, e.target.value);
  });

  // ── Modal ────────────────────────────────────────────────────────────────────
  const modalOverlay = el('modal-nuevo');

  el('btn-nuevo-paciente')?.addEventListener('click', () => {
    abrirModal(null);
  });

  function abrirModal(paciente = null) {
    const form = el('form-nuevo-paciente');
    if (!form) return;
    form.reset();

    if (paciente) {
      el('pac-id').value             = paciente.id;
      el('pac-nombres').value        = paciente.nombres        || '';
      el('pac-apellidos').value      = paciente.apellidos      || '';
      el('pac-dni').value            = paciente.dni            || '';
      el('pac-fecha-nac').value      = paciente.fecha_nacimiento || '';
      el('pac-telefono').value       = paciente.telefono       || '';
      el('pac-email').value          = paciente.email          || '';
      el('pac-direccion').value      = paciente.direccion      || '';
      if (el('pac-activo')) el('pac-activo').checked = paciente.activo !== false;
      const title = el('modal-nuevo-title');
      if (title) title.textContent = 'Editar Paciente';
    } else {
      if (el('pac-id')) el('pac-id').value = '';
      if (el('pac-activo')) el('pac-activo').checked = true;
      const title = el('modal-nuevo-title');
      if (title) title.textContent = 'Nuevo Paciente';
    }

    modalOverlay?.classList.add('open');
    setTimeout(() => el('pac-nombres')?.focus(), 80);
  }

  el('btn-close-modal')?.addEventListener('click',    () => modalOverlay?.classList.remove('open'));
  el('btn-cancelar-modal')?.addEventListener('click', () => modalOverlay?.classList.remove('open'));
  modalOverlay?.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

  // ── Submit formulario ────────────────────────────────────────────────────────
  el('form-nuevo-paciente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('pac-id')?.value || null;
    const data = {
      nombres:           el('pac-nombres')?.value.trim()   || '',
      apellidos:         el('pac-apellidos')?.value.trim() || '',
      dni:               el('pac-dni')?.value.trim()       || null,
      fecha_nacimiento:  el('pac-fecha-nac')?.value        || null,
      telefono:          el('pac-telefono')?.value.trim()  || null,
      email:             el('pac-email')?.value.trim()     || null,
      direccion:         el('pac-direccion')?.value.trim() || null,
      activo:            el('pac-activo')?.checked !== false,
    };

    if (!data.nombres || !data.apellidos) {
      showToast('Nombres y apellidos son obligatorios.', 'warning'); return;
    }

    const btn = e.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    let error;
    if (id) {
      ({ error } = await supabase.from('pacientes').update(data).eq('id', id));
    } else {
      ({ error } = await supabase.from('pacientes').insert(data));
    }

    if (btn) btn.disabled = false;

    if (error) { showToast('Error al guardar paciente.', 'error'); return; }
    modalOverlay?.classList.remove('open');
    showToast(id ? 'Paciente actualizado.' : 'Paciente registrado.', 'success');
    cargarPacientes();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function calcularEdad(fechaNac) {
    const hoy   = new Date();
    const nac   = new Date(fechaNac);
    let edad    = hoy.getFullYear() - nac.getFullYear();
    const m     = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad + ' años';
  }

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarPacientes();
});

