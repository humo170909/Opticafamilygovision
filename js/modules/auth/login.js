/* login.js — Módulo de inicio de sesión */
import { supabase, APP_ROOT } from '../../config/supabase.js';

const form  = document.getElementById('login-form');
const errEl = document.querySelector('.error-message');
const btn   = form?.querySelector('[type="submit"]');

// Si ya hay sesión activa, redirigir según rol
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data: { user } }   = await supabase.auth.getUser();
  const { data: perfil }     = await supabase.from('usuarios_perfil').select('rol').eq('id', user.id).single();
  const dest = perfil?.rol === 'vendedor' ? 'ventas/dashboard-vendedor.html' : 'dashboard.html';
  try { sessionStorage.setItem('rol', perfil?.rol || ''); } catch (_) {}
  window.location.replace(APP_ROOT + 'views/' + dest);
})();

// Mostrar mensaje de usuario inactivo si viene del guard
const motivo = new URLSearchParams(window.location.search).get('motivo');
if (motivo === 'inactivo' && errEl) {
  errEl.textContent = 'Tu cuenta está desactivada. Contacta al administrador.';
  errEl.hidden = false;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!errEl || !btn) return;

  errEl.hidden   = true;
  btn.disabled   = true;
  btn.textContent = 'Ingresando…';

  const email    = document.getElementById('email')?.value.trim()    || '';
  const password = document.getElementById('password')?.value         || '';

  if (!email || !password) {
    errEl.textContent = 'Completa todos los campos.';
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Ingresar';
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = 'Correo o contraseña incorrectos.';
    errEl.hidden = false;
    btn.disabled   = false;
    btn.textContent = 'Ingresar';
    document.getElementById('password').value = '';
    document.getElementById('password').focus();
    return;
    
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: authPerfil }         = await supabase.from('usuarios_perfil').select('rol').eq('id', authUser.id).single();
  const loginDest = authPerfil?.rol === 'vendedor' ? 'ventas/dashboard-vendedor.html' : 'dashboard.html';
  try { sessionStorage.setItem('rol', authPerfil?.rol || ''); } catch (_) {}
  window.location.replace(APP_ROOT + 'views/' + loginDest);
});
