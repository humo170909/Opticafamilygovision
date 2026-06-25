/* formatters.js — Funciones de formato para moneda, fechas, texto */

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return 'S/ ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDate(dateStr, options = {}) {
  if (!dateStr) return '—';
  try {
    const defaults = { day: '2-digit', month: 'short', year: 'numeric' };
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-PE', { ...defaults, ...options });
  } catch { return '—'; }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const tz = { timeZone: 'America/Lima' };
    const fecha = d.toLocaleDateString('es-PE', { ...tz, day: '2-digit', month: 'short', year: 'numeric' });
    const hora  = d.toLocaleTimeString('es-PE', { ...tz, hour: '2-digit', minute: '2-digit' });
    return `${fecha}, ${hora}`;
  } catch { return '—'; }
}

export function formatDateLong(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return '—'; }
}

export function formatPhone(phone) {
  if (!phone) return '—';
  const p = String(phone).replace(/\D/g, '');
  if (p.length === 9) return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  return phone;
}

export function formatInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase() || '').join('');
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)      return 'hace un momento';
  if (diff < 3600)    return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400)   return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 172800)  return 'ayer';
  if (diff < 604800)  return `hace ${Math.floor(diff / 86400)} días`;
  return formatDate(dateStr);
}

export function formatGrad(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}
