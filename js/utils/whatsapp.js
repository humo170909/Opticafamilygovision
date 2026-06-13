/* whatsapp.js — Integración con CallMeBot para notificaciones WhatsApp */

/**
 * Envía una notificación de tardanza al número configurado del administrador.
 * Operación fire-and-forget — no bloquea el flujo principal.
 *
 * @param {object} config          - Objeto de configuración con campos asistencia_wsp_*
 * @param {string} nombre          - Nombre del empleado
 * @param {string} horaEntrada     - Hora de entrada "HH:MM"
 * @param {number} minutosRetraso  - Minutos de retraso
 * @param {string} [justificacion] - Motivo indicado por el empleado
 * @param {string} [fechaStr]      - Fecha "YYYY-MM-DD"
 */
export function notificarTardanza(config, nombre, horaEntrada, minutosRetraso, justificacion = '', fechaStr = '') {
  if (!config?.asistencia_wsp_activo) return;
  const tel    = config.asistencia_wsp_telefono;
  const apikey = config.asistencia_wsp_apikey;
  if (!tel || !apikey) return;

  let fechaLarga = fechaStr;
  if (fechaStr) {
    try {
      fechaLarga = new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch {}
  }

  const justText = justificacion?.trim() || 'No especificada';

  const lineas = [
    '⏰ *Óptica Family GO Vision — TARDANZA REGISTRADA*',
    '',
    `👤 Colaborador: ${nombre}`,
    fechaLarga ? `📅 Fecha: ${fechaLarga}` : null,
    `🕐 Hora de ingreso: ${horaEntrada}`,
    `⌛ Minutos de retraso: ${minutosRetraso} min`,
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

  const mensaje = lineas.filter(l => l !== null).join('\n');

  fetch(
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(tel)}&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(apikey)}`
  ).catch(() => {});
}
