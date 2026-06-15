/* usuarios.js — Gestión de usuarios con Supabase (solo admin) */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase.js';
import { checkAuth }      from '../../core/auth.js';
import { initUI }         from '../../core/ui.js';
import { showToast, confirmDialog } from '../../utils/alerts.js';
import { formatDate, formatInitials } from '../../utils/formatters.js';
import { esc, isValidEmail } from '../../utils/validators.js';
import { ROLES }          from '../../config/supabase.js';

// ─── Helper: llama a la Edge Function manage-user ────────────────────────────
async function _llamarManageUser(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sin sesión activa');

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Error en la solicitud al servidor');
  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  const _usuario = await checkAuth([ROLES.ADMIN]);
  await initUI(_usuario);

  const el = (id) => document.getElementById(id);
  let usuariosCache = [];

  // ── Cargar usuarios ───────────────────────────────────────────────────────────
  async function cargarUsuarios() {
    const busqueda = el('search-usuarios')?.value.trim() || '';
    const filtroRol    = el('filtro-rol')?.value || '';
    const filtroEstado = el('filtro-estado')?.value || '';

    let q = supabase.from('usuarios_perfil').select('id, nombre, email, rol, activo, created_at').order('nombre');
    if (filtroRol)    q = q.eq('rol', filtroRol);
    if (filtroEstado === 'activo')   q = q.eq('activo', true);
    if (filtroEstado === 'inactivo') q = q.eq('activo', false);

    const { data, error } = await q;
    if (error) { showToast('Error al cargar usuarios.', 'error'); return; }

    usuariosCache = (data || []).filter(u => {
      if (!busqueda) return true;
      return (u.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
             (u.email  || '').toLowerCase().includes(busqueda.toLowerCase());
    });

    actualizarStats(data || []);
    renderTabla(usuariosCache);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  function actualizarStats(todos) {
    const activos   = todos.filter(u => u.activo).length;
    const inactivos = todos.filter(u => !u.activo).length;
    if (el('stat-total'))    el('stat-total').textContent    = todos.length;
    if (el('stat-activos'))  el('stat-activos').textContent  = activos;
    if (el('stat-inactivos')) el('stat-inactivos').textContent = inactivos;
    const sub = el('subtitle-contador');
    if (sub) sub.textContent = `${todos.length} usuario${todos.length !== 1 ? 's' : ''} registrados`;
  }

  // ── Render tabla ──────────────────────────────────────────────────────────────
  function renderTabla(usuarios) {
    const tbody = el('tbody-usuarios');
    if (!tbody) return;

    if (!usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--c-ink-muted);">Sin usuarios encontrados.</td></tr>';
      return;
    }

    tbody.innerHTML = usuarios.map(u => {
      const initials  = formatInitials(u.nombre || u.email || '');
      const badge     = u.activo ? '<span class="badge bs">Activo</span>' : '<span class="badge bn">Inactivo</span>';
      const rolBadge  = u.rol === 'admin' ? '<span class="badge bi">Admin</span>' : '<span class="badge bn">Vendedor</span>';
      return `<tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-sm">${esc(initials)}</div>
            <div>
              <div class="user-cell-name">${esc(u.nombre || '—')}</div>
            </div>
          </div>
        </td>
        <td class="user-cell-email">${esc(u.email || '—')}</td>
        <td>${rolBadge}</td>
        <td>${badge}</td>
        <td style="font-size:.78rem;color:var(--c-ink-muted);">${formatDate(u.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn-icon" title="Editar" data-action="editar" data-id="${u.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon" title="${u.activo ? 'Desactivar' : 'Activar'}" data-action="toggle" data-id="${u.id}" data-activo="${u.activo}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${u.activo ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' : '<polyline points="20 6 9 17 4 12"/>'}</svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Delegación de eventos tabla ───────────────────────────────────────────────
  el('tbody-usuarios')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = btn.dataset.id;
    const accion = btn.dataset.action;

    if (accion === 'editar') {
      const u = usuariosCache.find(x => x.id === id);
      if (u) abrirModal(u);
    }
    if (accion === 'toggle') {
      const u = usuariosCache.find(x => x.id === id);
      const nuevoEstado = btn.dataset.activo !== 'true';
      const msg = nuevoEstado ? `¿Activar al usuario <strong>${esc(u?.nombre)}</strong>?` : `¿Desactivar al usuario <strong>${esc(u?.nombre)}</strong>?<br><small>No podrá iniciar sesión.</small>`;
      const ok = await confirmDialog(msg, { title: nuevoEstado ? 'Activar usuario' : 'Desactivar usuario' });
      if (ok) {
        await supabase.from('usuarios_perfil').update({ activo: nuevoEstado }).eq('id', id);
        showToast(nuevoEstado ? 'Usuario activado.' : 'Usuario desactivado.', 'success');
        cargarUsuarios();
      }
    }
  });

  // ── Modal ─────────────────────────────────────────────────────────────────────
  el('btn-nuevo-usuario')?.addEventListener('click', () => abrirModal(null));

  function abrirModal(usuario = null) {
    el('form-usuario')?.reset();
    if (el('modal-error')) el('modal-error').hidden = true;
    const pwdReq   = el('pwd-required');
    const pwdHint  = el('pwd-hint');
    const btnTexto = el('btn-guardar-texto');
    const title    = el('modal-usuario-title');

    if (usuario) {
      el('usuario-id').value = usuario.id;
      if (el('u-nombre'))  el('u-nombre').value  = usuario.nombre || '';
      if (el('u-email'))   el('u-email').value   = usuario.email  || '';
      if (el('u-rol'))     el('u-rol').value     = usuario.rol    || 'vendedor';
      if (el('u-activo'))  el('u-activo').checked = usuario.activo !== false;
      if (pwdReq)  pwdReq.style.display  = 'none';
      if (pwdHint) pwdHint.textContent   = 'Déjala vacía para no cambiarla';
      if (title)   title.textContent     = 'Editar Usuario';
      if (btnTexto) btnTexto.textContent = 'Guardar cambios';
    } else {
      if (el('usuario-id')) el('usuario-id').value = '';
      if (pwdReq)  pwdReq.style.display  = '';
      if (pwdHint) pwdHint.textContent   = 'Mínimo 8 caracteres';
      if (title)   title.textContent     = 'Nuevo Usuario';
      if (btnTexto) btnTexto.textContent = 'Crear usuario';
    }
    el('modal-usuario')?.classList.add('open');
    setTimeout(() => el('u-nombre')?.focus(), 80);
  }

  el('btn-close-modal')?.addEventListener('click',    () => el('modal-usuario')?.classList.remove('open'));
  el('btn-cancelar-modal')?.addEventListener('click', () => el('modal-usuario')?.classList.remove('open'));
  el('modal-usuario')?.addEventListener('click', (e) => { if (e.target === el('modal-usuario')) el('modal-usuario').classList.remove('open'); });

  // ── Submit ────────────────────────────────────────────────────────────────────
  el('form-usuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = el('usuario-id')?.value || null;
    const nombre   = el('u-nombre')?.value.trim();
    const email    = el('u-email')?.value.trim();
    const password = el('u-password')?.value;
    const rol      = el('u-rol')?.value || 'vendedor';
    const activo   = el('u-activo')?.checked !== false;
    const errEl    = el('modal-error');

    if (!nombre) { if (errEl) { errEl.textContent = 'El nombre es obligatorio.'; errEl.hidden = false; } return; }
    if (!isValidEmail(email)) { if (errEl) { errEl.textContent = 'Ingresa un email válido.'; errEl.hidden = false; } return; }
    if (!id && (!password || password.length < 8)) { if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; errEl.hidden = false; } return; }
    if (errEl) errEl.hidden = true;

    const btn = el('btn-guardar-usuario');
    if (btn) btn.disabled = true;

    if (id) {
      // Actualizar perfil
      const { error } = await supabase.from('usuarios_perfil').update({ nombre, rol, activo }).eq('id', id);
      if (error) { if (errEl) { errEl.textContent = error.message; errEl.hidden = false; } if (btn) btn.disabled = false; return; }
      // Cambiar password si se escribió (via Edge Function — nunca expone service_role key)
      if (password && password.length >= 8) {
        try {
          await _llamarManageUser({ action: 'cambiar_password', userId: id, password });
        } catch (errPwd) {
          showToast('Usuario actualizado pero error al cambiar contraseña: ' + errPwd.message, 'warning');
        }
      }
      showToast('Usuario actualizado.', 'success');
    } else {
      // Crear usuario via Edge Function (mantiene service_role key en el servidor)
      try {
        await _llamarManageUser({ action: 'crear_usuario', email, password, nombre, rol, activo });
        showToast('Usuario creado correctamente.', 'success');
      } catch (errCreate) {
        if (errEl) { errEl.textContent = errCreate.message; errEl.hidden = false; }
        if (btn) btn.disabled = false;
        return;
      }
    }

    if (btn) btn.disabled = false;
    el('modal-usuario')?.classList.remove('open');
    cargarUsuarios();
  });

  // ── Filtros ───────────────────────────────────────────────────────────────────
  let timer;
  el('search-usuarios')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cargarUsuarios, 300); });
  el('filtro-rol')?.addEventListener('change',    cargarUsuarios);
  el('filtro-estado')?.addEventListener('change', cargarUsuarios);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el('modal-usuario')?.classList.remove('open'); });

  // ── Inicio ───────────────────────────────────────────────────────────────────
  await cargarUsuarios();
});

