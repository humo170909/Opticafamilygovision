/* pacientes.js — CRUD de pacientes con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatPhone, formatInitials } from '../../utils/formatters.js';
import { esc } from '../../utils/validators.js';
import { requireAsistencia, actualizarIndicadorSidebar } from '../../utils/asistencia-guard.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth();
  await initUI(_usuario);
  actualizarIndicadorSidebar();

  const el = (id) => document.getElementById(id);
  let pacientesCache = [];

  // ── Cargar pacientes ─────────────────────────────────────────────────────────
  async function cargarPacientes(busqueda = '', estado = '') {
    let query = supabase.from('pacientes').select('*').order('apellidos');

    if (busqueda) {
      query = query.or(
        `nombres.ilike.%${busqueda}%,apellidos.ilike.%${busqueda}%,dni.ilike.%${busqueda}%`
      );
    }
    if (estado === 'activo')   query = query.eq('activo', true);
    if (estado === 'inactivo') query = query.eq('activo', false);

    const { data, error } = await query;
    if (error) { showToast('Error al cargar pacientes.', 'error'); return; }
    pacientesCache = data || [];
    renderTabla(pacientesCache);
  }

  // ── Render tabla ─────────────────────────────────────────────────────────────
  // Columnas: Paciente | DNI | Edad | Teléfono | Correo | Estado del Cliente | Acciones
  function renderTabla(pacientes) {
    const tbody = document.querySelector('#tabla-pacientes tbody');
    const info  = el('pag-info');
    if (!tbody) return;

    const total = pacientes.length;
    if (info) info.textContent = `${total} paciente${total !== 1 ? 's' : ''}`;

    const statTotal = el('stat-total');
    if (statTotal) statTotal.textContent = total;

    if (!total) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--p-ink-muted);">Sin pacientes registrados.</td></tr>`;
      const cs = el('card-subtitle');
      if (cs) cs.textContent = '0 registros';
      return;
    }

    const cs = el('card-subtitle');
    if (cs) cs.textContent = `${total} registro${total !== 1 ? 's' : ''}`;

    const sr = `<span class="sin-dato">Sin registrar</span>`;

    tbody.innerHTML = pacientes.map(p => {
      const nombre   = `${esc(p.apellidos)}, ${esc(p.nombres)}`;
      const initials = formatInitials(`${p.nombres} ${p.apellidos}`);
      const edad     = p.edad != null ? p.edad + ' años' : sr;
      const tel      = p.telefono ? esc(formatPhone(p.telefono)) : sr;
      const correo   = p.email
        ? `<a href="mailto:${esc(p.email)}" style="color:var(--p-accent);font-size:.8rem;word-break:break-all;">${esc(p.email)}</a>`
        : sr;
      const badge = p.activo !== false
        ? '<span class="badge bs">Activo</span>'
        : '<span class="badge bd">Inactivo</span>';

      return `
        <tr>
          <td>
            <div class="pac-name-cell">
              <div class="pac-avatar">${esc(initials)}</div>
              <div>
                <div class="pac-fullname">${nombre}</div>
                <div class="pac-dni">DNI: ${esc(p.dni) || '—'}</div>
              </div>
            </div>
          </td>
          <td class="col-hide-sm">${esc(p.dni) || sr}</td>
          <td class="col-hide-sm">${edad}</td>
          <td class="col-hide-sm">${tel}</td>
          <td class="col-hide-md">${correo}</td>
          <td>${badge}</td>
          <td>
            <div class="row-actions">
              <button class="btn-row" title="Ver historial clínico" data-action="historial" data-id="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="btn-row" title="Editar paciente" data-action="editar" data-id="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-row danger" title="Eliminar paciente" data-action="eliminar" data-id="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Delegación de eventos en tabla ───────────────────────────────────────────
  document.querySelector('#tabla-pacientes')?.addEventListener('click', async (e) => {
    const btn    = e.target.closest('[data-action]');
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
      if (!(await requireAsistencia('eliminar pacientes'))) return;
      const pac = pacientesCache.find(p => p.id === id);
      const ok  = await confirmDialog(
        `¿Eliminar a <strong>${esc(pac?.nombres)} ${esc(pac?.apellidos)}</strong>?<br><small>Se eliminará todo su historial.</small>`,
        { title: 'Eliminar Paciente' }
      );
      if (ok) {
        const { error } = await supabase.from('pacientes').delete().eq('id', id);
        if (error) { showToast('No se pudo eliminar el paciente.', 'error'); return; }
        showToast('Paciente eliminado.', 'success');
        cargarPacientes();
      }
    }
  });

  // ── Búsqueda y filtros ───────────────────────────────────────────────────────
  let searchTimer;
  el('search-pacientes')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      cargarPacientes(e.target.value.trim(), el('filtro-estado')?.value || '');
    }, 300);
  });

  el('filtro-estado')?.addEventListener('change', (e) => {
    cargarPacientes(el('search-pacientes')?.value.trim() || '', e.target.value);
  });

  // ── Tabs del modal ────────────────────────────────────────────────────────────
  function switchTab(tabName) {
    document.querySelectorAll('.modal-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tabName)
    );
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.style.display = p.id === `tab-${tabName}` ? '' : 'none';
    });
  }

  document.querySelectorAll('.modal-tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // ── Modal ────────────────────────────────────────────────────────────────────
  const modalOverlay = el('modal-nuevo');

  el('btn-nuevo-paciente')?.addEventListener('click', () => abrirModal(null));

  function abrirModal(paciente = null) {
    const form = el('form-nuevo-paciente');
    if (!form) return;
    form.reset();
    limpiarHC();
    switchTab('personal');

    if (paciente) {
      el('pac-id').value        = paciente.id;
      el('pac-nombres').value   = paciente.nombres          || '';
      el('pac-apellidos').value = paciente.apellidos        || '';
      el('pac-dni').value       = paciente.dni              || '';
      el('pac-edad').value = paciente.edad ?? '';
      el('pac-telefono').value  = paciente.telefono         || '';
      el('pac-email').value     = paciente.email            || '';
      el('pac-direccion').value = paciente.direccion        || '';
      el('pac-activo').value    = paciente.activo !== false ? 'activo' : 'inactivo';

      const titulo = el('modal-nuevo-title');
      if (titulo) titulo.textContent = 'Editar Paciente';

      // Cargar historia clínica y compras del paciente
      cargarHC(paciente.id);
      cargarCompras(paciente.id);
    } else {
      el('pac-id').value     = '';
      el('pac-activo').value = 'activo';
      const titulo = el('modal-nuevo-title');
      if (titulo) titulo.textContent = 'Nuevo Paciente';
      const hcFecha = el('hc-fecha');
      if (hcFecha) hcFecha.value = new Date().toISOString().split('T')[0];
      const comprasLista = document.getElementById('compras-lista');
      if (comprasLista) comprasLista.innerHTML = '<p style="color:var(--p-ink-faint);font-size:.83rem;text-align:center;padding:28px 0;">Guarda el paciente primero para ver su historial de compras.</p>';
    }

    modalOverlay?.classList.add('open');
    setTimeout(() => el('pac-nombres')?.focus(), 80);
  }

  // ── Cargar historia clínica ──────────────────────────────────────────────────
  async function cargarHC(pacienteId) {
    // Última consulta del paciente
    const { data: consultas } = await supabase
      .from('consultas')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('fecha', { ascending: false })
      .limit(1);

    const c = consultas?.[0] || null;

    if (!c) {
      // Sin historial — precargar solo la fecha de hoy
      const hcFecha = el('hc-fecha');
      if (hcFecha) hcFecha.value = new Date().toISOString().split('T')[0];
      return;
    }

    const setV = (id, v) => { const e = el(id); if (e) e.value = v ?? ''; };
    setV('hc-consulta-id', c.id);
    setV('hc-fecha',       c.fecha);
    setV('hc-motivo',      c.motivo);
    setV('hc-diagnostico', c.diagnostico);

    // Graduaciones vinculadas a esa consulta
    const { data: grads } = await supabase
      .from('graduaciones')
      .select('*')
      .eq('consulta_id', c.id)
      .limit(1);

    const g = grads?.[0];
    if (!g) return;

    setV('hc-od-esfera',    g.od_esfera);
    setV('hc-od-cilindro',  g.od_cilindro);
    setV('hc-od-eje',       g.od_eje);
    setV('hc-od-av',        g.od_av);
    setV('hc-od-adicion',   g.od_adicion);
    setV('hc-oi-esfera',    g.oi_esfera);
    setV('hc-oi-cilindro',  g.oi_cilindro);
    setV('hc-oi-eje',       g.oi_eje);
    setV('hc-oi-av',        g.oi_av);
    setV('hc-oi-adicion',   g.oi_adicion);
    setV('hc-dp',           g.dp);
    setV('hc-observaciones',g.observaciones);
  }

  // ── Cargar historial de compras del paciente ─────────────────────────────────
  async function cargarCompras(pacienteId) {
    const cont = document.getElementById('compras-lista');
    if (!cont) return;
    cont.innerHTML = '<p style="color:var(--p-ink-faint);font-size:.83rem;text-align:center;padding:24px 0;">Cargando compras…</p>';

    const { data: ventas } = await supabase
      .from('ventas')
      .select(`
        id,
        total,
        descuento,
        metodo_pago,
        estado,
        created_at,
        detalle_ventas ( cantidad, precio_unitario, subtotal, productos(nombre) ),
        venta_complementos ( tipo, descripcion, precio, cantidad, subtotal )
      `)
      .eq('paciente_id', pacienteId)
      .eq('estado', 'completada')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!ventas?.length) {
      cont.innerHTML = '<p style="color:var(--p-ink-faint);font-size:.83rem;text-align:center;padding:28px 0;">Sin compras registradas para este paciente.</p>';
      return;
    }

    const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yape: 'Yape', plin: 'Plin' };

    cont.innerHTML = ventas.map(v => {
      const fecha = new Date(v.created_at).toLocaleDateString('es-PE', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      const tagsProd = (v.detalle_ventas || []).map(d =>
        `<span class="compra-tag">${esc(d.productos?.nombre || '—')} ×${d.cantidad} — S/${parseFloat(d.subtotal || 0).toFixed(2)}</span>`
      ).join('');

      const tagsComp = (v.venta_complementos || []).map(c =>
        `<span class="compra-tag comp">${esc(c.tipo)}${c.descripcion ? ' — ' + esc(c.descripcion) : ''} ×${c.cantidad} — S/${parseFloat(c.subtotal || 0).toFixed(2)}</span>`
      ).join('');

      return `
        <div class="compra-card">
          <div class="compra-card-head">
            <span class="compra-fecha">${fecha}</span>
            <span class="compra-total">S/ ${parseFloat(v.total || 0).toFixed(2)}</span>
          </div>
          ${tagsProd ? `<div class="compra-section-label">Productos</div><div class="compra-tags">${tagsProd}</div>` : ''}
          ${tagsComp ? `<div class="compra-section-label">Lunas y Tratamientos</div><div class="compra-tags">${tagsComp}</div>` : ''}
          <div class="compra-meta">
            <span>${esc(METODOS[v.metodo_pago] || v.metodo_pago || '—')}</span>
            ${v.descuento > 0 ? `<span>Descuento: ${(v.descuento * 100).toFixed(0)}%</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function limpiarHC() {
    ['hc-consulta-id','hc-fecha','hc-motivo','hc-diagnostico',
     'hc-od-esfera','hc-od-cilindro','hc-od-eje','hc-od-av','hc-od-adicion',
     'hc-oi-esfera','hc-oi-cilindro','hc-oi-eje','hc-oi-av','hc-oi-adicion',
     'hc-dp','hc-observaciones'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  }

  // ── Guardar historia clínica ─────────────────────────────────────────────────
  async function guardarHC(pacienteId) {
    const consultaId  = el('hc-consulta-id')?.value  || null;
    const fecha       = el('hc-fecha')?.value         || new Date().toISOString().split('T')[0];
    const motivo      = el('hc-motivo')?.value.trim() || null;
    const diagnostico = el('hc-diagnostico')?.value.trim() || null;

    const toNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const toInt = v => { const n = parseInt(v);   return isNaN(n) ? null : n; };
    const toTxt = v => v?.trim() || null;

    const grad = {
      od_esfera:    toNum(el('hc-od-esfera')?.value),
      od_cilindro:  toNum(el('hc-od-cilindro')?.value),
      od_eje:       toInt(el('hc-od-eje')?.value),
      od_av:        toTxt(el('hc-od-av')?.value),
      od_adicion:   toNum(el('hc-od-adicion')?.value),
      oi_esfera:    toNum(el('hc-oi-esfera')?.value),
      oi_cilindro:  toNum(el('hc-oi-cilindro')?.value),
      oi_eje:       toInt(el('hc-oi-eje')?.value),
      oi_av:        toTxt(el('hc-oi-av')?.value),
      oi_adicion:   toNum(el('hc-oi-adicion')?.value),
      dp:           toNum(el('hc-dp')?.value),
      observaciones:toTxt(el('hc-observaciones')?.value),
    };

    const hasGrad     = Object.values(grad).some(v => v !== null);
    const hasConsulta = motivo || diagnostico || hasGrad;
    if (!hasConsulta) return; // campos vacíos → nada que guardar

    // Preserve original ID string for UUID-safe comparison; only parseInt for integer IDs
    let cId = consultaId || null;

    if (cId) {
      const payload = { fecha, motivo, diagnostico };
      console.log('[HC] UPDATE consultas — ID:', cId, '| Payload:', payload);
      const { error: eUpd } = await supabase.from('consultas')
        .update(payload)
        .eq('id', cId);
      if (eUpd) {
        console.error('[HC] Error completo al actualizar consulta:', eUpd);
        alert('Error al actualizar consulta:\n' + JSON.stringify(eUpd, null, 2));
        return;
      }
    } else {
      const { data: ins, error: eIns } = await supabase
        .from('consultas')
        .insert({ paciente_id: pacienteId, fecha, motivo, diagnostico })
        .select('id')
        .single();
      if (eIns) {
        console.error('[HC] Error al insertar consulta:', eIns);
        alert('Error al insertar consulta:\n' + JSON.stringify(eIns, null, 2));
        return;
      }
      if (!ins) return;
      cId = ins.id;
    }

    if (!hasGrad) return;

    const { data: existGrad } = await supabase
      .from('graduaciones')
      .select('id')
      .eq('consulta_id', cId)
      .limit(1);

    if (existGrad?.length) {
      const { error: eGrad } = await supabase.from('graduaciones').update(grad).eq('id', existGrad[0].id);
      if (eGrad) { console.error('[HC] Error al actualizar graduación:', eGrad); alert('Error al actualizar graduación:\n' + JSON.stringify(eGrad, null, 2)); }
    } else {
      const { error: eGrad } = await supabase.from('graduaciones').insert({ ...grad, consulta_id: cId });
      if (eGrad) { console.error('[HC] Error al insertar graduación:', eGrad); alert('Error al insertar graduación:\n' + JSON.stringify(eGrad, null, 2)); }
    }
  }

  // ── Cerrar modal ─────────────────────────────────────────────────────────────
  const cerrarModal = () => modalOverlay?.classList.remove('open');
  el('btn-close-modal')?.addEventListener('click',    cerrarModal);
  el('btn-cancelar-modal')?.addEventListener('click', cerrarModal);
  modalOverlay?.addEventListener('click', (e) => { if (e.target === modalOverlay) cerrarModal(); });

  // ── Submit formulario ────────────────────────────────────────────────────────
  el('form-nuevo-paciente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await requireAsistencia('modificar pacientes'))) return;
    const id = el('pac-id')?.value || null;

    const data = {
      nombres:   el('pac-nombres')?.value.trim()   || '',
      apellidos: el('pac-apellidos')?.value.trim() || '',
      dni:       el('pac-dni')?.value.trim()       || null,
      edad:      (() => { const v = parseInt(el('pac-edad')?.value); return (!isNaN(v) && v >= 0 && v <= 120) ? v : null; })(),
      telefono:  el('pac-telefono')?.value.trim()  || null,
      email:     el('pac-email')?.value.trim()     || null,
      direccion: el('pac-direccion')?.value.trim() || null,
      activo:    el('pac-activo')?.value !== 'inactivo',
    };

    if (!data.nombres || !data.apellidos) {
      showToast('Nombres y apellidos son obligatorios.', 'warning'); return;
    }

    const btnGuardar = el('btn-guardar-pac');
    if (btnGuardar) btnGuardar.disabled = true;

    let error, savedId = id;

    if (id) {
      ({ error } = await supabase.from('pacientes').update(data).eq('id', id));
    } else {
      const { data: inserted, error: errIns } = await supabase
        .from('pacientes')
        .insert(data)
        .select('id')
        .single();
      error   = errIns;
      savedId = inserted?.id;
    }

    if (btnGuardar) btnGuardar.disabled = false;

    if (error) { showToast('Error al guardar paciente.', 'error'); return; }

    // Guardar historia clínica si hay datos
    if (savedId) await guardarHC(savedId);

    cerrarModal();
    showToast(id ? 'Paciente actualizado.' : 'Paciente registrado.', 'success');
    cargarPacientes();
  });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarPacientes();
});
