/* auth.js — Gestión de sesión, roles y protección de rutas */
import { supabase, APP_ROOT, TABLAS } from '../config/supabase.js';

/**
 * Verifica sesión activa. Si no hay sesión o el usuario está inactivo,
 * redirige al login. Si se pasan roles requeridos y el rol no coincide,
 * redirige al dashboard.
 * @param {string[]|null} soloRoles  Ej: ['admin'] o ['admin','vendedor']
 * @returns {Promise<object|null>}   Objeto usuario con { id, email, nombre, rol, activo }
 */
export async function checkAuth(soloRoles = null) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.replace(APP_ROOT + 'views/auth/login.html');
    return null;
  }

  const user = await getUser();

  if (!user) {
    await supabase.auth.signOut();
    window.location.replace(APP_ROOT + 'views/auth/login.html');
    return null;
  }

  if (!user.activo) {
    await supabase.auth.signOut();
    window.location.replace(APP_ROOT + 'views/auth/login.html?motivo=inactivo');
    return null;
  }

  if (soloRoles && !soloRoles.includes(user.rol)) {
    window.location.replace(
      user.rol === 'vendedor'
        ? APP_ROOT + 'views/ventas/dashboard-vendedor.html'
        : APP_ROOT + 'views/dashboard.html'
    );
    return null;
  }

  return user;
}

/**
 * Devuelve el usuario autenticado con su perfil.
 * @returns {Promise<object|null>}
 */
export async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) return null;

  const { data: perfil, error: pe } = await supabase
    .from(TABLAS.USUARIOS)
    .select('nombre, rol, activo')
    .eq('id', user.id)
    .single();

  if (pe || !perfil) return null;
  return { id: user.id, email: user.email, ...perfil };
}

/**
 * Cierra sesión y redirige al login.
 */
export async function logout() {
  await supabase.auth.signOut();
  window.location.replace(APP_ROOT + 'views/auth/login.html');
}
