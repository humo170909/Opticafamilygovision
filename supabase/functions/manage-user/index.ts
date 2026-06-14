/**
 * manage-user — Supabase Edge Function
 *
 * Permite crear usuarios y cambiar contraseñas usando la service_role key,
 * que nunca debe estar en el frontend.
 *
 * Acciones soportadas:
 *   - crear_usuario  : crea el Auth user + perfil en usuarios_perfil
 *   - cambiar_password : cambia la contraseña de un usuario existente
 *
 * Seguridad:
 *   - Requiere JWT válido en Authorization header
 *   - Verifica que el llamante tenga rol = 'admin' en usuarios_perfil
 *   - SUPABASE_SERVICE_ROLE_KEY vive solo como variable de entorno del servidor
 *
 * Deploy:
 *   supabase functions deploy manage-user --no-verify-jwt
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<tu_key>
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    // ── 1. Verificar Authorization header ────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Autorización requerida' }, 401);
    }

    const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey          = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Cliente del usuario (verifica su identidad con su propio JWT)
    const clienteUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Cliente admin (solo en servidor — nunca en frontend)
    const clienteAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 2. Verificar que el llamante está autenticado ─────────────────────────
    const { data: { user }, error: userErr } = await clienteUsuario.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Token inválido o expirado' }, 401);
    }

    // ── 3. Verificar que el llamante es administrador ─────────────────────────
    const { data: perfil } = await clienteAdmin
      .from('usuarios_perfil')
      .select('rol')
      .eq('id', user.id)
      .single();

    if (perfil?.rol !== 'admin') {
      return json({ error: 'Acceso denegado: se requiere rol administrador' }, 403);
    }

    // ── 4. Procesar la acción solicitada ──────────────────────────────────────
    const body = await req.json();
    const { action, userId, email, password, nombre, rol, activo } = body;

    // ── Crear usuario ─────────────────────────────────────────────────────────
    if (action === 'crear_usuario') {
      if (!email || !password || !nombre) {
        return json({ error: 'email, password y nombre son obligatorios' }, 400);
      }
      if (password.length < 8) {
        return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
      }

      const { data, error: errAuth } = await clienteAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, rol: rol || 'vendedor' },
      });
      if (errAuth) return json({ error: errAuth.message }, 400);

      const { error: errPerfil } = await clienteAdmin
        .from('usuarios_perfil')
        .upsert({ id: data.user.id, nombre, email, rol: rol || 'vendedor', activo: activo ?? true });
      if (errPerfil) return json({ error: errPerfil.message }, 500);

      return json({ user: { id: data.user.id, email: data.user.email } });
    }

    // ── Cambiar contraseña ────────────────────────────────────────────────────
    if (action === 'cambiar_password') {
      if (!userId || !password) {
        return json({ error: 'userId y password son obligatorios' }, 400);
      }
      if (password.length < 8) {
        return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
      }

      const { error: errPwd } = await clienteAdmin.auth.admin.updateUserById(userId, { password });
      if (errPwd) return json({ error: errPwd.message }, 400);

      return json({ ok: true });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);

  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
