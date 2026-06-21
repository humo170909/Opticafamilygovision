/* asistencia-guard.js — Verifica asistencia para operaciones del rol vendedor.
 * Admin siempre pasa. Vendedor debe tener hora_entrada el día actual.
 * El resultado se cachea por fecha para evitar llamadas redundantes a Supabase.
 */
import { supabase }       from '../config/supabase.js';
import { getCurrentUser } from '../core/ui.js';
import { fechaLima }      from './tiempo.js';
import { APP_ROOT }       from '../config/supabase.js';

let _cacheOk    = null;   // null = sin verificar, true/false = resultado del día
let _cacheFecha = null;

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica si el usuario actual tiene hora_entrada registrada hoy.
 * Admins siempre retornan true. Resultado cacheado por fecha.
 * @returns {Promise<boolean>}
 */
export async function verificarAsistencia() {
  const perfil = getCurrentUser();
  if (!perfil || perfil.rol === 'admin') return true;

  const hoy = fechaLima();
  if (_cacheFecha === hoy && _cacheOk !== null) return _cacheOk;

  const { data } = await supabase
    .from('asistencia')
    .select('id')
    .eq('usuario_id', perfil.id)
    .eq('fecha', hoy)
    .not('hora_entrada', 'is', null)
    .maybeSingle();

  _cacheFecha = hoy;
  _cacheOk    = !!data;
  return _cacheOk;
}

/**
 * Invalida el cache. Llamar después de que el vendedor marque entrada
 * para que la próxima verificarAsistencia() consulte Supabase de nuevo.
 */
export function invalidarCacheAsistencia() {
  _cacheOk    = null;
  _cacheFecha = null;
}

/**
 * Verifica asistencia. Si falta, muestra un modal informativo y retorna false.
 * Si hay asistencia (o es admin), retorna true y el flujo continúa normalmente.
 *
 * @param {string} accion — Texto descriptivo para el modal.
 *   Ej: 'registrar ventas', 'registrar gastos', 'crear citas', 'modificar pacientes'
 * @returns {Promise<boolean>}
 */
export async function requireAsistencia(accion = 'realizar esta operación') {
  const ok = await verificarAsistencia();
  if (ok) return true;
  _mostrarModal(accion);
  return false;
}

/**
 * Inyecta o actualiza el indicador de asistencia pendiente en el sidebar.
 * Llama una vez después de initUI() en páginas accesibles al vendedor.
 * No hace nada para el rol admin.
 */
export async function actualizarIndicadorSidebar() {
  const perfil = getCurrentUser();
  if (!perfil || perfil.rol === 'admin') return;
  const ok = await verificarAsistencia();
  _renderIndicadorSidebar(!ok);
}

// ─── Internos ─────────────────────────────────────────────────────────────────

function _mostrarModal(accion) {
  document.getElementById('_att_guard_modal')?.remove();

  const wrapper = document.createElement('div');
  wrapper.id = '_att_guard_modal';
  wrapper.innerHTML = `
    <div class="mag-backdrop">
      <div class="mag-box" role="alertdialog" aria-modal="true" aria-labelledby="_mag_title">
        <div class="mag-icono">⏰</div>
        <h2 class="mag-titulo" id="_mag_title">Asistencia requerida</h2>
        <p class="mag-desc">
          Debes marcar tu <strong>entrada</strong> antes de <strong>${accion}</strong>.
        </p>
        <div class="mag-footer">
          <button class="btn-secondary" id="_att_guard_cerrar">Cancelar</button>
          <a href="${APP_ROOT}views/ventas/asistencia.html" class="btn-primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            Ir a Asistencia
          </a>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper);

  const cerrar = () => wrapper.remove();

  document.getElementById('_att_guard_cerrar')
    .addEventListener('click', cerrar);

  wrapper.querySelector('.mag-backdrop')
    .addEventListener('click', (e) => {
      if (e.target.classList.contains('mag-backdrop')) cerrar();
    });

  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', _esc); }
  });
}

function _renderIndicadorSidebar(mostrar) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  let badge = document.getElementById('_att_sidebar_badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id        = '_att_sidebar_badge';
    badge.className = 'att-badge-sidebar';
    // Insertar justo antes de .sidebar-user para quedar al fondo del nav
    const sidebarUser = sidebar.querySelector('.sidebar-user');
    if (sidebarUser) sidebar.insertBefore(badge, sidebarUser);
    else sidebar.appendChild(badge);
  }

  if (mostrar) {
    badge.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Asistencia pendiente`;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
