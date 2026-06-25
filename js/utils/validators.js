/* validators.js — Validaciones y escape HTML */

/** Escapa caracteres HTML para prevenir XSS en innerHTML */
export function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function isValidDNI(dni) {
  return /^\d{8}$/.test(String(dni || '').trim());
}

export function isValidRUC(ruc) {
  return /^\d{11}$/.test(String(ruc || '').trim());
}

export function isValidPhone(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  return p.length >= 7 && p.length <= 11;
}

export function isRequired(value) {
  return String(value ?? '').trim().length > 0;
}

export function isPositiveNumber(value) {
  const n = Number(value);
  return !isNaN(n) && n > 0;
}

export function isNonNegativeInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

/**
 * Valida un formulario HTML: marca errores visualmente.
 * @param {HTMLElement} form
 * @param {Array<{id:string, validate:function, message:string}>} rules
 * @returns {boolean}
 */
export function validateForm(form, rules) {
  let valid = true;
  // Limpiar errores previos
  form.querySelectorAll('.form-error').forEach(e => { e.hidden = true; e.textContent = ''; });

  for (const rule of rules) {
    const input = document.getElementById(rule.id);
    if (!input) continue;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    if (!rule.validate(value)) {
      const errEl = document.getElementById('error-' + rule.id.replace('input-', '').replace('select-', ''));
      if (errEl) { errEl.textContent = rule.message; errEl.hidden = false; }
      if (valid) input.focus();
      valid = false;
    }
  }
  return valid;
}
