/* tiempo.js — Utilidades de fecha y hora en zona horaria Lima (America/Lima) */

/** Retorna la fecha actual en Lima como "YYYY-MM-DD" */
export function fechaLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

/** Retorna la hora actual en Lima como "HH:MM" (24h) */
export function horaLima() {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

/** Retorna la hora actual en Lima como "HH:MM:SS" (24h) */
export function horaSegundosLima() {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date());
}

/**
 * Convierte una cadena de hora "HH:MM" o "HH:MM:SS" a minutos desde medianoche.
 * Retorna 0 si el valor es nulo o vacío.
 */
export function minDesdeMedianoche(t) {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Retorna el lunes de la semana actual en Lima como "YYYY-MM-DD".
 * Útil para KPIs semanales en dashboards.
 */
export function inicioSemanaLima() {
  const hoy = fechaLima(); // "YYYY-MM-DD"
  const [y, mo, d] = hoy.split('-').map(Number);
  const temp = new Date(Date.UTC(y, mo - 1, d));
  const dow = temp.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  const diasHastaLunes = dow === 0 ? -6 : 1 - dow;
  temp.setUTCDate(temp.getUTCDate() + diasHastaLunes);
  return temp.toISOString().split('T')[0];
}
