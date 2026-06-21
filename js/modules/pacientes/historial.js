/* historial.js — Historial clínico con Supabase */
import { supabase }       from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast }      from '../../utils/alerts.js';
import { formatDate, formatInitials } from '../../utils/formatters.js';
import { esc }            from '../../utils/validators.js';

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth();
  await initUI(_usuario);

  const el  = (id) => document.getElementById(id);
  let pacienteSeleccionado = null;
  let pacientesCache       = [];

  // ── Cargar lista de pacientes ────────────────────────────────────────────────
  async function cargarListaPacientes() {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nombres, apellidos')
      .eq('activo', true)
      .order('apellidos');

    if (error) { showToast('Error al cargar pacientes.', 'error'); return; }
    pacientesCache = data || [];
    renderListaPacientes(pacientesCache);

    // Si viene ?id= en la URL, seleccionar ese paciente
    const params  = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam) {
      const item = document.querySelector(`.pac-list-item[data-id="${idParam}"]`);
      if (item) { item.click(); item.scrollIntoView({ block: 'nearest' }); }
    } else if (pacientesCache.length > 0) {
      document.querySelector('.pac-list-item')?.click();
    }
  }

  function renderListaPacientes(pacientes) {
    const listEl = document.querySelector('.pac-list');
    if (!listEl) return;

    listEl.innerHTML = pacientes.map(p => {
      const initials = formatInitials(`${p.nombres} ${p.apellidos}`);
      return `
        <div class="pac-list-item" data-id="${p.id}">
          <div class="pac-list-avatar">${esc(initials)}</div>
          <div class="pac-list-info">
            <div class="pac-list-name">${esc(p.apellidos)}, ${esc(p.nombres)}</div>
            <div class="pac-list-meta">Click para ver historial</div>
          </div>
        </div>`;
    }).join('') || '<p style="text-align:center;padding:20px;color:var(--c-ink-muted);font-size:.82rem;">Sin pacientes activos.</p>';

    listEl.querySelectorAll('.pac-list-item').forEach(item => {
      item.addEventListener('click', () => {
        listEl.querySelectorAll('.pac-list-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        seleccionarPaciente(item.dataset.id);
      });
    });
  }

  // ── Seleccionar paciente y cargar su historial ───────────────────────────────
  async function seleccionarPaciente(id) {
    const { data: paciente, error: ep } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', id)
      .single();

    if (ep || !paciente) { showToast('No se pudo cargar el paciente.', 'error'); return; }
    pacienteSeleccionado = paciente;

    actualizarFichaPaciente(paciente);
    await cargarHistorial(id);
    cargarComprasPaciente(id); // carga en background sin bloquear
    actualizarModalTitulo(paciente);
  }

  function actualizarFichaPaciente(p) {
    const initials = formatInitials(`${p.nombres} ${p.apellidos}`);
    const fichaAvatar = document.querySelector('.ficha-avatar');
    const fichaNombre = document.querySelector('.ficha-nombre');
    if (fichaAvatar) fichaAvatar.textContent = initials;
    if (fichaNombre) fichaNombre.textContent = `${p.nombres} ${p.apellidos}`;

    const metas = document.querySelectorAll('.ficha-meta span');
    if (metas[0]) metas[0].textContent = p.dni ? `DNI ${p.dni}` : 'Sin DNI';
    if (metas[2]) metas[2].textContent = p.edad != null ? p.edad + ' años' : '—';
    if (metas[4]) metas[4].textContent = p.telefono || '—';

    const fedadEl = el('ficha-edad');
    if (fedadEl) fedadEl.textContent = p.edad != null ? p.edad + ' años' : '—';
    const femail = el('ficha-email');
    if (femail) femail.textContent = p.email || '—';
    const fdir = el('ficha-direccion');
    if (fdir) fdir.textContent = p.direccion || '—';
    const fpri = el('ficha-primera-visita');
    if (fpri) fpri.textContent = formatDate(p.created_at);
  }

  function actualizarModalTitulo(p) {
    const titleEl = document.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = `Nueva Consulta — ${p.nombres} ${p.apellidos}`;
  }

  // ── Cargar historial de consultas ────────────────────────────────────────────
  async function cargarHistorial(pacienteId) {
    const { data: consultas, error } = await supabase
      .from('consultas')
      .select('*, graduaciones(*)')
      .eq('paciente_id', pacienteId)
      .order('fecha', { ascending: false });

    if (error) { showToast('Error al cargar historial.', 'error'); return; }
    renderTimeline(consultas || []);

    // Cargar graduación actual (consulta más reciente con datos de graduación)
    const conGrad = (consultas || []).find(c => c.graduaciones?.[0]);
    renderGraduacionActual(conGrad || null);

    // Cargar recetas
    const { data: recetas } = await supabase
      .from('recetas')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    renderRecetas(recetas || []);

    // Actualizar meta de lista
    const selected = document.querySelector('.pac-list-item.selected .pac-list-meta');
    if (selected && consultas?.length) {
      selected.textContent = 'Última: ' + formatDate(consultas[0].fecha);
    }
  }

  function renderTimeline(consultas) {
    const panel = el('panel-consultas');
    if (!panel) return;

    if (!consultas.length) {
      panel.innerHTML = '<p style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.84rem;">Sin consultas registradas.</p>';
      return;
    }

    const estadoBadge = { completada:'bs', seguimiento:'bw', recogida:'bi', registro:'bn', cancelada:'bd' };

    panel.innerHTML = `<div class="timeline">${consultas.map((c, idx) => {
      const badge  = estadoBadge[c.estado?.toLowerCase()] || 'bn';
      const dotCls = idx === 0 ? 'tl-dot success' : 'tl-dot';
      const g = c.graduaciones?.[0];
      const gradHTML = g ? `
        <div class="grad-grid">
          <div class="grad-eye">
            <div class="grad-eye-title"><span class="dot-od"></span> OD</div>
            <div class="grad-row"><span class="grad-key">Esfera</span><span class="grad-val">${fGrad(g.od_esfera)}</span></div>
            <div class="grad-row"><span class="grad-key">Cilindro</span><span class="grad-val">${fGrad(g.od_cilindro)}</span></div>
            <div class="grad-row"><span class="grad-key">Eje</span><span class="grad-val">${g.od_eje ?? '—'}°</span></div>
            <div class="grad-row"><span class="grad-key">AV</span><span class="grad-val">${esc(g.od_av) || '—'}</span></div>
            ${g.od_adicion != null ? `<div class="grad-row"><span class="grad-key">Adición</span><span class="grad-val">${fGrad(g.od_adicion)}</span></div>` : ''}
          </div>
          <div class="grad-eye">
            <div class="grad-eye-title"><span class="dot-oi"></span> OI</div>
            <div class="grad-row"><span class="grad-key">Esfera</span><span class="grad-val">${fGrad(g.oi_esfera)}</span></div>
            <div class="grad-row"><span class="grad-key">Cilindro</span><span class="grad-val">${fGrad(g.oi_cilindro)}</span></div>
            <div class="grad-row"><span class="grad-key">Eje</span><span class="grad-val">${g.oi_eje ?? '—'}°</span></div>
            <div class="grad-row"><span class="grad-key">AV</span><span class="grad-val">${esc(g.oi_av) || '—'}</span></div>
            ${g.oi_adicion != null ? `<div class="grad-row"><span class="grad-key">Adición</span><span class="grad-val">${fGrad(g.oi_adicion)}</span></div>` : ''}
          </div>
        </div>
        ${g.dp != null ? `<div style="font-size:.75rem;color:var(--c-ink-muted);margin-top:4px;">DP: ${g.dp} mm</div>` : ''}
        ${g.observaciones ? `<div style="font-size:.75rem;color:var(--c-ink-muted);margin-top:2px;">Obs: ${esc(g.observaciones)}</div>` : ''}` : '';

      return `
        <div class="tl-item">
          <div class="tl-dot-col">
            <div class="${dotCls}"></div>
            ${idx < consultas.length - 1 ? '<div class="tl-line"></div>' : ''}
          </div>
          <div class="tl-content">
            <div class="tl-fecha">${formatDate(c.fecha)}</div>
            <div class="tl-card">
              <div class="tl-card-top">
                <span class="tl-tipo">${esc(c.tipo || 'Consulta')}</span>
                ${c.estado ? `<span class="badge ${badge}">${esc(c.estado)}</span>` : ''}
              </div>
              ${c.motivo      ? `<div class="tl-body"><strong>Motivo:</strong> ${esc(c.motivo)}</div>` : ''}
              ${c.diagnostico ? `<div class="tl-body"><strong>Diagnóstico:</strong> ${esc(c.diagnostico)}</div>` : ''}
              ${gradHTML}
            </div>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  function renderGraduacionActual(c) {
    const panel = el('panel-graduacion');
    if (!panel) return;
    const g = c?.graduaciones?.[0];
    if (!g) {
      panel.innerHTML = '<p style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.84rem;">Sin datos de graduación registrados.</p>';
      return;
    }
    panel.innerHTML = `
      <p class="section-label" style="margin-bottom:14px;">Graduación vigente — ${formatDate(c.fecha)}</p>
      <div class="grad-grid">
        <div class="grad-eye">
          <div class="grad-eye-title"><span class="dot-od"></span> OD — Ojo Derecho</div>
          <div class="grad-row"><span class="grad-key">Esfera</span><span class="grad-val">${fGrad(g.od_esfera)}</span></div>
          <div class="grad-row"><span class="grad-key">Cilindro</span><span class="grad-val">${fGrad(g.od_cilindro)}</span></div>
          <div class="grad-row"><span class="grad-key">Eje</span><span class="grad-val">${g.od_eje ?? '—'}°</span></div>
          <div class="grad-row"><span class="grad-key">AV c/c</span><span class="grad-val">${esc(g.od_av) || '—'}</span></div>
          ${g.od_adicion != null ? `<div class="grad-row"><span class="grad-key">Adición</span><span class="grad-val">${fGrad(g.od_adicion)}</span></div>` : ''}
        </div>
        <div class="grad-eye">
          <div class="grad-eye-title"><span class="dot-oi"></span> OI — Ojo Izquierdo</div>
          <div class="grad-row"><span class="grad-key">Esfera</span><span class="grad-val">${fGrad(g.oi_esfera)}</span></div>
          <div class="grad-row"><span class="grad-key">Cilindro</span><span class="grad-val">${fGrad(g.oi_cilindro)}</span></div>
          <div class="grad-row"><span class="grad-key">Eje</span><span class="grad-val">${g.oi_eje ?? '—'}°</span></div>
          <div class="grad-row"><span class="grad-key">AV c/c</span><span class="grad-val">${esc(g.oi_av) || '—'}</span></div>
          ${g.oi_adicion != null ? `<div class="grad-row"><span class="grad-key">Adición</span><span class="grad-val">${fGrad(g.oi_adicion)}</span></div>` : ''}
        </div>
      </div>
      ${g.dp != null ? `<div style="margin-top:10px;font-size:.78rem;color:var(--c-ink-muted);">DP: ${g.dp} mm</div>` : ''}
      ${g.observaciones ? `<div style="margin-top:6px;font-size:.78rem;color:var(--c-ink-muted);">Observaciones: ${esc(g.observaciones)}</div>` : ''}`;
  }

  function renderRecetas(recetas) {
    const panel = el('panel-recetas');
    if (!panel) return;

    if (!recetas.length) {
      panel.innerHTML = '<p style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.84rem;">Sin recetas registradas.</p>';
      return;
    }

    panel.innerHTML = `<p class="section-label" style="margin-bottom:14px;">Historial de recetas</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${recetas.map((r, i) => `
          <div class="tl-card">
            <div class="tl-card-top">
              <span class="tl-tipo">Receta #${String(i + 1).padStart(3, '0')} — ${formatDate(r.created_at)}</span>
              <span class="badge ${i === 0 ? 'bs' : 'bn'}">${i === 0 ? 'Vigente' : 'Histórica'}</span>
            </div>
            <div class="receta-box">
              <div class="receta-title">Descripción / Indicaciones</div>
              ${r.descripcion ? `<div class="receta-item">${esc(r.descripcion)}</div>` : '<div class="receta-item" style="color:var(--c-ink-muted);font-size:.78rem;">Sin descripción registrada.</div>'}
              ${r.archivo_url ? `<div class="receta-item"><a href="${esc(r.archivo_url)}" target="_blank" rel="noopener" style="color:var(--c-info);">Ver archivo adjunto →</a></div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }

  // ── Cargar compras realizadas por el paciente ────────────────────────────────
  const TIPOS_LUNAS = new Set([
    'Blue Cut','Transition','Kodak','Monofocal','Bifocal','Progresivo','Fotocromático',
  ]);
  const TIPOS_TRATS = new Set(['Antirreflejo','Polarizado']);
  const METODOS_LABEL = {
    efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia', yape:'Yape', plin:'Plin',
  };

  async function cargarComprasPaciente(pacienteId) {
    const cont = el('compras-timeline');
    if (!cont) return;
    cont.innerHTML = '<p style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.84rem;">Cargando…</p>';

    const { data: ventas } = await supabase
      .from('ventas')
      .select(`
        id, created_at, total, metodo_pago, descuento, created_by,
        detalle_ventas(cantidad, productos(nombre)),
        venta_complementos(tipo, descripcion, cantidad, subtotal)
      `)
      .eq('paciente_id', pacienteId)
      .eq('estado', 'completada')
      .order('created_at', { ascending: false })
      .limit(15);

    if (!ventas?.length) {
      cont.innerHTML = '<p style="text-align:center;padding:24px;color:var(--c-ink-muted);font-size:.84rem;">Sin compras registradas.</p>';
      return;
    }

    // Resolver nombres de vendedores en una sola consulta
    const idsVendedor = [...new Set(ventas.map(v => v.created_by).filter(Boolean))];
    const vendedoresMap = {};
    if (idsVendedor.length) {
      const { data: usuarios } = await supabase
        .from('usuarios_perfil')
        .select('id, nombre')
        .in('id', idsVendedor);
      (usuarios || []).forEach(u => { vendedoresMap[u.id] = u.nombre; });
    }

    const svgCheck = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

    cont.innerHTML = `<div class="timeline">${ventas.map((v, idx) => {
      const vendedor = vendedoresMap[v.created_by] || '—';
      const prods = v.detalle_ventas    || [];
      const comps = v.venta_complementos || [];
      const lunas  = comps.filter(c =>  TIPOS_LUNAS.has(c.tipo));
      const trats  = comps.filter(c =>  TIPOS_TRATS.has(c.tipo));
      const servs  = comps.filter(c => !TIPOS_LUNAS.has(c.tipo) && !TIPOS_TRATS.has(c.tipo));

      const listaComp = (arr) => arr.map(c =>
        `<div class="compra-linea">${svgCheck} ${esc(c.tipo)}${c.descripcion ? ' — ' + esc(c.descripcion) : ''} ×${c.cantidad}</div>`
      ).join('');

      return `
        <div class="tl-item">
          <div class="tl-dot-col">
            <div class="${idx === 0 ? 'tl-dot success' : 'tl-dot'}"></div>
            ${idx < ventas.length - 1 ? '<div class="tl-line"></div>' : ''}
          </div>
          <div class="tl-content">
            <div class="tl-fecha">${formatDate(v.created_at)}</div>
            <div class="tl-card compra-card-full">
              <div class="tl-card-top">
                <span class="tl-tipo">Venta #${v.id}</span>
                <span class="compra-total-badge">S/ ${parseFloat(v.total || 0).toFixed(2)}</span>
              </div>

              ${prods.length ? `
                <div class="compra-section">
                  <div class="compra-section-hdr">Productos</div>
                  ${prods.map(d => `<div class="compra-linea">${svgCheck} ${esc(d.productos?.nombre || '—')} ×${d.cantidad}</div>`).join('')}
                </div>` : ''}

              ${lunas.length ? `
                <div class="compra-section">
                  <div class="compra-section-hdr lunas">Lunas</div>
                  ${listaComp(lunas)}
                </div>` : ''}

              ${trats.length ? `
                <div class="compra-section">
                  <div class="compra-section-hdr trats">Tratamientos</div>
                  ${listaComp(trats)}
                </div>` : ''}

              ${servs.length ? `
                <div class="compra-section">
                  <div class="compra-section-hdr">Servicios</div>
                  ${listaComp(servs)}
                </div>` : ''}

              <div class="compra-meta-full">
                <span>${esc(METODOS_LABEL[v.metodo_pago] || v.metodo_pago || '—')}</span>
                <span>Vendedor: <strong>${esc(vendedor)}</strong></span>
                ${v.descuento > 0 ? `<span>Desc: ${(v.descuento * 100).toFixed(0)}%</span>` : ''}
              </div>
            </div>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  // ── Tabs del historial ────────────────────────────────────────────────────────
  document.querySelectorAll('.hist-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hist-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.hist-panel').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      const target = el('panel-' + tab.dataset.tab);
      if (target) target.style.display = 'block';
    });
  });

  // ── Búsqueda en lista de pacientes ────────────────────────────────────────────
  el('search-hist')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.pac-list-item').forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // ── Modal nueva consulta ─────────────────────────────────────────────────────
  el('btn-nueva-consulta')?.addEventListener('click', () => {
    if (!pacienteSeleccionado) { showToast('Selecciona un paciente primero.', 'warning'); return; }
    el('form-consulta')?.reset();
    el('modal-consulta')?.classList.add('open');
    const fechaInput = el('modal-consulta')?.querySelector('input[type="date"]');
    if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];
  });

  el('btn-close-modal')?.addEventListener('click',    () => el('modal-consulta')?.classList.remove('open'));
  el('btn-cancelar-modal')?.addEventListener('click', () => el('modal-consulta')?.classList.remove('open'));
  el('modal-consulta')?.addEventListener('click', (e) => { if (e.target === el('modal-consulta')) el('modal-consulta').classList.remove('open'); });

  el('form-consulta')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pacienteSeleccionado) return;

    const inputs = e.target.querySelectorAll('select, input, textarea');
    const get    = (label) => {
      for (const el of inputs) {
        const lbl = el.closest('.form-group')?.querySelector('.form-label')?.textContent;
        if (lbl?.toLowerCase().includes(label.toLowerCase())) return el.value;
      }
      return '';
    };

    const pNum = v => { const n = parseFloat(v); return (v === '' || v == null || isNaN(n)) ? null : n; };
    const pInt = v => { const n = parseInt(v);   return (v === '' || v == null || isNaN(n)) ? null : n; };
    const pStr = v => { const s = (v || '').trim(); return s === '' ? null : s; };

    const consultaData = {
      paciente_id: pacienteSeleccionado.id,
      fecha:       get('fecha') || new Date().toISOString().split('T')[0],
      motivo:      get('motivo') || null,
      diagnostico: get('diagnóstico') || null,
    };

    const btn = e.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    const { data: consulta, error: errC } = await supabase
      .from('consultas').insert(consultaData).select().single();

    if (errC) {
      if (btn) btn.disabled = false;
      showToast('Error al guardar consulta.', 'error');
      return;
    }

    const gradData = {
      consulta_id:   consulta.id,
      od_esfera:     pNum(el('od-esfera')?.value),
      od_cilindro:   pNum(el('od-cilindro')?.value),
      od_eje:        pInt(el('od-eje')?.value),
      od_av:         pStr(el('od-av')?.value),
      od_adicion:    pNum(el('od-adicion')?.value),
      oi_esfera:     pNum(el('oi-esfera')?.value),
      oi_cilindro:   pNum(el('oi-cilindro')?.value),
      oi_eje:        pInt(el('oi-eje')?.value),
      oi_av:         pStr(el('oi-av')?.value),
      oi_adicion:    pNum(el('oi-adicion')?.value),
      dp:            pNum(el('consulta-dp')?.value),
      observaciones: pStr(el('consulta-obs')?.value),
    };

    const hasGrad = Object.entries(gradData)
      .filter(([k]) => k !== 'consulta_id')
      .some(([, v]) => v !== null);

    if (hasGrad) {
      const { error: errG } = await supabase.from('graduaciones').insert(gradData);
      if (errG) showToast('Consulta guardada, error en datos de graduación.', 'warning');
    }

    if (btn) btn.disabled = false;
    e.target.reset();
    el('modal-consulta')?.classList.remove('open');
    showToast('Consulta registrada.', 'success');
    await cargarHistorial(pacienteSeleccionado.id);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function fGrad(val) {
    if (val === null || val === undefined) return '—';
    const n = Number(val);
    return (n >= 0 ? '+' : '') + n.toFixed(2);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el('modal-consulta')?.classList.remove('open');
  });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarListaPacientes();
});

