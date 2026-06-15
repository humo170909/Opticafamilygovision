/* whatsapp.js — Integración con CallMeBot para notificaciones WhatsApp.
 *
 * El frontend NUNCA llama directamente a CallMeBot (causaría error CORS).
 * En su lugar invoca la Edge Function 'send-whatsapp' que actúa como proxy
 * servidor-a-servidor, sin exponer credenciales al navegador.
 */
import { supabase } from '../config/supabase.js';

/**
 * Envía una notificación de tardanza al número configurado del administrador.
 * Operación fire-and-forget — no bloquea el flujo principal.
 *
 * La firma es idéntica a la versión anterior para mantener compatibilidad
 * con todos los módulos que ya la importan.
 *
 * @param {object} config          - Objeto de configuración; solo se lee `asistencia_wsp_activo`
 * @param {string} nombre          - Nombre del empleado
 * @param {string} horaEntrada     - Hora de entrada "HH:MM"
 * @param {number} minutosRetraso  - Minutos de retraso
 * @param {string} [justificacion] - Motivo indicado por el empleado
 * @param {string} [fechaStr]      - Fecha "YYYY-MM-DD"
 */
export function notificarTardanza(config, nombre, horaEntrada, minutosRetraso, justificacion = '', fechaStr = '') {
  // El administrador puede desactivar las notificaciones desde Configuración
  if (!config?.asistencia_wsp_activo) {
    console.log('[whatsapp] Notificación desactivada en configuración (asistencia_wsp_activo = false)');
    return;
  }

  console.log('[whatsapp] Enviando notificación de tardanza para:', nombre);

  // Fire-and-forget: llama al proxy en el servidor, que contacta CallMeBot
  supabase.functions.invoke('send-whatsapp', {
    body: {
      nombre,
      fecha           : fechaStr   || null,
      hora            : horaEntrada,
      minutos_tardanza: minutosRetraso,
      justificacion   : justificacion || '',
    },
  }).then(({ data, error }) => {
    if (error) {
      console.error('[whatsapp] Error al invocar send-whatsapp:', error);
    } else {
      console.log('[whatsapp] Respuesta de send-whatsapp:', data);
    }
  }).catch((err) => {
    console.error('[whatsapp] Error de red al invocar send-whatsapp:', err);
  });
}
