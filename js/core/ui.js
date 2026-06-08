/* ui.js — Inicialización de interfaz: sidebar, topbar, datos de usuario */
import { getUser, logout } from './auth.js';
import { formatInitials }  from '../utils/formatters.js';

let _currentUser = null;

/**
 * Inicializa la UI: inyecta nombre/rol del usuario, configura sidebar mobile,
 * oculta secciones admin-only si el rol es vendedor, activa btn-logout.
 * @returns {Promise<object|null>} Usuario actual
 */
export async function initUI(usuario = null) {
  _currentUser = usuario ?? await getUser();
  if (!_currentUser) return null;

  const nombre    = _currentUser.nombre || _currentUser.email || 'Usuario';
  const initials  = formatInitials(nombre);
  const rolLabel  = _currentUser.rol === 'admin' ? 'Administrador' : 'Vendedor';

  _set('sidebar-user-name',    nombre);
  _set('sidebar-user-role',    rolLabel);
  _set('user-avatar',          initials);
  _set('user-avatar-initials', initials);

  // Persistir rol en sessionStorage para que el inline script en <head>
  // pueda aplicarlo de forma síncrona en navegaciones futuras, eliminando
  // el flash de contenido antes de que JS confirme el rol.
  try { sessionStorage.setItem('rol', _currentUser.rol); } catch (_) {}

  // Marcar el rol en <html> (mismo elemento que apunta el inline script).
  // CSS: html:not(.role-admin) .admin-only { display: none !important }
  document.documentElement.classList.add(
    _currentUser.rol === 'admin' ? 'role-admin' : 'role-vendedor'
  );

  // Revelar página (para páginas admin-only que inician con body.page-hidden)
  document.body.classList.remove('page-hidden');

  // Fecha en topbar
  const hoy  = new Date();
  const corta = hoy.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  _set('topbar-date', corta);

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  // Sidebar mobile
  _initSidebar();

  return _currentUser;
}

/** Devuelve el usuario cargado en la sesión actual (después de initUI). */
export function getCurrentUser() {
  return _currentUser;
}

// ─── Sidebar mobile toggle ────────────────────────────────────────────────────
function _initSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const btnMenu  = document.getElementById('btn-menu');

  const open  = () => {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  };

  btnMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar?.classList.contains('open') ? close() : open();
  });
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function _set(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
