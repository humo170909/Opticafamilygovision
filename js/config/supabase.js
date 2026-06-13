import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// Reemplaza estos valores con los de tu proyecto en supabase.com > Project Settings > API
export const SUPABASE_URL      = 'https://vrscebxtqvzxspexlfdc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyc2NlYnh0cXZ6eHNwZXhsZmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjYzMDYsImV4cCI6MjA5NjM0MjMwNn0.hNcicMCe2song8TOAAGM5wxvYrZ5JX7GSUhxw_2CuRs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
  },
});

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
export const ROLES = Object.freeze({ ADMIN: 'admin', VENDEDOR: 'vendedor' });

export const TABLAS = Object.freeze({
  USUARIOS:   'usuarios_perfil',
  CATEGORIAS: 'categorias',
  PRODUCTOS:  'productos',
  PACIENTES:  'pacientes',
  CONSULTAS:  'consultas',
  RECETAS:    'recetas',
  CITAS:      'citas',
  VENTAS:     'ventas',
  DETALLE:    'detalle_ventas',
  STOCK_MOV:  'movimientos_stock',
  CONFIG:     'configuracion',
  ASISTENCIA: 'asistencia',
});

// ─── ROOT URL (compatible con GitHub Pages en subdirectorio) ──────────────────
// Calcula la URL raíz del proyecto dinámicamente, funciona en:
//   - http://localhost:5500/
//   - https://usuario.github.io/optica-GOFAMILIA/
export const APP_ROOT = (() => {
  const path = window.location.pathname;
  const idx  = path.indexOf('/views/');
  if (idx !== -1) return window.location.origin + path.slice(0, idx) + '/';
  const last = path.lastIndexOf('/');
  return window.location.origin + path.slice(0, last + 1);
})();
