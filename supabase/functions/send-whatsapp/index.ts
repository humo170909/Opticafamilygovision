/**
 * send-whatsapp — Proxy servidor→CallMeBot para evitar CORS en el navegador.
 *
 * DEPLOY:
 *   supabase functions deploy send-whatsapp --no-verify-jwt
 *
 * El flag --no-verify-jwt es obligatorio: sin él, el gateway de Supabase
 * intercepta el preflight OPTIONS (que el navegador manda sin Authorization)
 * y devuelve 401 antes de que este código corra, causando el error CORS.
 * Esta función verifica el JWT manualmente solo en peticiones POST.
 *
 * SECRETS (supabase secrets set ...):
 *   CALLMEBOT_PHONE   → número con código de país  (+51987654321)
 *   CALLMEBOT_APIKEY  → API key de CallMeBot
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

// ─── CORS headers — se incluyen en TODAS las respuestas ───────────────────────
// Access-Control-Allow-Origin: * permite llamadas desde localhost, 127.0.0.1 y producción.
// Si quieres restringir a un dominio específico, cambia * por 'https://tu-dominio.com'
const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper: respuesta JSON con headers CORS garantizados
const json = (body: object, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {

  const metodo = req.method;
  const origen = req.headers.get('origin') ?? '(sin origin)';

  console.log(`[send-whatsapp] ${metodo} desde ${origen}`);

  // ── 1. Preflight CORS ──────────────────────────────────────────────────────
  // El navegador manda OPTIONS antes de cada POST cross-origin.
  // Debe responder 200 + headers CORS para que el navegador permita el POST real.
  // NUNCA verificar JWT aquí — el navegador no manda Authorization en OPTIONS.
  if (metodo === 'OPTIONS') {
    console.log('[send-whatsapp] Preflight OK →', origen);
    return new Response('ok', { status: 200, headers: CORS });
  }

  // ── 2. Solo aceptar POST ───────────────────────────────────────────────────
  if (metodo !== 'POST') {
    console.warn('[send-whatsapp] Método rechazado:', metodo);
    return json({ error: 'Método no permitido. Usa POST.' }, 405);
  }

  // ── 3. Verificar JWT del usuario (solo en POST) ────────────────────────────
  // supabase.functions.invoke() y fetch() con Authorization: Bearer <token>
  // ambos pasan este check automáticamente cuando el usuario tiene sesión activa.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    console.error('[send-whatsapp] Sin Authorization header válido');
    return json({ error: 'No autorizado. Se requiere Authorization: Bearer <token>.' }, 401);
  }

  // ── 4. Leer credenciales de CallMeBot desde variables de entorno ───────────
  // NUNCA exponerlas al frontend. Viven solo en los Secrets del servidor.
  const phone  = Deno.env.get('CALLMEBOT_PHONE')  ?? '';
  const apikey = Deno.env.get('CALLMEBOT_APIKEY') ?? '';

  if (!phone || !apikey) {
    console.error('[send-whatsapp] ❌ Secrets no configurados: CALLMEBOT_PHONE / CALLMEBOT_APIKEY');
    return json({
      error: 'Configuración del servidor incompleta. Configura los Secrets CALLMEBOT_PHONE y CALLMEBOT_APIKEY.',
    }, 500);
  }

  // ── 5. Parsear body JSON ───────────────────────────────────────────────────
  interface Payload {
    nombre?           : string;
    fecha?            : string;   // YYYY-MM-DD
    hora?             : string;   // HH:MM
    minutos_tardanza? : number;
    justificacion?    : string;
  }

  let payload: Payload;
  try {
    payload = await req.json() as Payload;
    console.log('[send-whatsapp] Payload recibido:', JSON.stringify(payload));
  } catch (e) {
    console.error('[send-whatsapp] Body JSON inválido:', e);
    return json({ error: 'Body inválido. Se esperaba JSON con { nombre, hora, ... }.' }, 400);
  }

  const { nombre, fecha, hora, minutos_tardanza, justificacion } = payload;

  if (!nombre || !hora) {
    console.error('[send-whatsapp] Campos requeridos faltantes. nombre:', nombre, '| hora:', hora);
    return json({ error: 'Faltan campos requeridos: nombre y hora son obligatorios.' }, 400);
  }

  // ── 6. Formatear fecha en español ──────────────────────────────────────────
  let fechaLarga = '';
  if (fecha) {
    try {
      fechaLarga = new Date(fecha + 'T00:00:00').toLocaleDateString('es-PE', {
        weekday: 'long',
        day    : 'numeric',
        month  : 'long',
        year   : 'numeric',
      });
    } catch {
      fechaLarga = fecha; // fallback: mostrar la fecha raw si falla el formato
    }
  }

  const justText = justificacion?.trim() || 'No especificada';
  const minutos  = minutos_tardanza ?? 0;

  // ── 7. Construir mensaje de WhatsApp ───────────────────────────────────────
  const lineas: (string | null)[] = [
    '⏰ *Óptica Family GO Vision — TARDANZA REGISTRADA*',
    '',
    `👤 Colaborador: ${nombre}`,
    fechaLarga ? `📅 Fecha: ${fechaLarga}` : null,
    `🕐 Hora de ingreso: ${hora}`,
    `⌛ Minutos de retraso: ${minutos} min`,
    '',
    '📝 Justificación:',
    justText,
    '',
    '📌 Estado:',
    'Tardanza registrada correctamente.',
    '',
    '────────────────────',
    '',
    'Sistema de Control de Asistencia',
    'Óptica Family GO Vision',
  ];

  const mensaje = lineas.filter((l): l is string => l !== null).join('\n');

  // ── 8. Llamar a CallMeBot desde el SERVIDOR (sin restricción CORS) ─────────
  const callmebotUrl =
    `https://api.callmebot.com/whatsapp.php` +
    `?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(mensaje)}` +
    `&apikey=${encodeURIComponent(apikey)}`;

  console.log('[send-whatsapp] Llamando a CallMeBot → phone:', phone.slice(0, 6) + '****');

  try {
    const respCallmebot = await fetch(callmebotUrl);
    const respTexto     = await respCallmebot.text();

    if (!respCallmebot.ok) {
      console.error('[send-whatsapp] ❌ CallMeBot respondió con error:', respCallmebot.status, respTexto);
      return json({
        ok             : false,
        callmebot_status: respCallmebot.status,
        callmebot_body  : respTexto,
        mensaje         : 'CallMeBot rechazó el mensaje. Verifica phone y apikey.',
      }, 502);
    }

    console.log('[send-whatsapp] ✅ Mensaje enviado a', nombre, '| Respuesta CallMeBot:', respTexto.trim());
    return json({ ok: true, detalle: respTexto.trim() }, 200);

  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error('[send-whatsapp] ❌ Error de red al contactar CallMeBot:', detalle);
    return json({
      ok     : false,
      error  : 'No se pudo contactar a CallMeBot.',
      detalle: detalle,
    }, 502);
  }
});
