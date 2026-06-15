/* theme.js — Modo oscuro/claro y personalización del color de acento */

const KEY_THEME = 'app-theme';
const KEY_COLOR = 'app-color';

const PALETA = [
  { id: 'azul',    label: 'Azul corporativo', accent: '#4a90d9', strong: '#2f74bd', soft: '#cfe2f4', bg: 'rgba(74,144,217,0.08)',  glow: 'rgba(74,144,217,0.28)' },
  { id: 'verde',   label: 'Verde',             accent: '#2e9e6b', strong: '#226f4b', soft: '#b7e3d2', bg: 'rgba(46,158,107,0.08)',  glow: 'rgba(46,158,107,0.28)' },
  { id: 'morado',  label: 'Morado',            accent: '#7c3aed', strong: '#5b21b6', soft: '#ddd6fe', bg: 'rgba(124,58,237,0.08)',  glow: 'rgba(124,58,237,0.28)' },
  { id: 'naranja', label: 'Naranja',           accent: '#d97a0f', strong: '#b55d09', soft: '#fed7aa', bg: 'rgba(217,122,15,0.08)',  glow: 'rgba(217,122,15,0.28)' },
  { id: 'rojo',    label: 'Rojo elegante',     accent: '#e11d48', strong: '#be123c', soft: '#fecdd3', bg: 'rgba(225,29,72,0.08)',   glow: 'rgba(225,29,72,0.28)' },
];

/**
 * Inicializa el sistema de temas: aplica preferencias guardadas e inyecta
 * el botón de toggle oscuro/claro y el panel de colores en .topbar-actions.
 */
export function initTheme() {
  const savedTheme = localStorage.getItem(KEY_THEME) || 'light';
  const savedColor = localStorage.getItem(KEY_COLOR) || 'azul';

  // Aplicar sin transición para evitar flash en carga
  document.documentElement.setAttribute('data-theme', savedTheme);
  _applyColor(savedColor, false);

  // Activar transiciones DESPUÉS del primer paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add('theme-ready');
  }));

  _injectControls(savedTheme, savedColor);
}

// ─── Aplicar color de acento ──────────────────────────────────────────────────
function _applyColor(colorId, save = true) {
  const c = PALETA.find(p => p.id === colorId) || PALETA[0];
  const r = document.documentElement;
  r.style.setProperty('--c-accent',             c.accent);
  r.style.setProperty('--c-accent-strong',       c.strong);
  r.style.setProperty('--c-accent-soft',         c.soft);
  r.style.setProperty('--c-accent-bg',           c.bg);
  r.style.setProperty('--c-accent-glow',         c.glow);
  r.style.setProperty('--c-sidebar-active-line', c.accent);
  if (save) localStorage.setItem(KEY_COLOR, colorId);
}

// ─── Inyectar controles en topbar ─────────────────────────────────────────────
function _injectControls(temaActual, colorActual) {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;

  // ── Toggle modo oscuro ──
  const btnTema = _el('button', 'btn-icon btn-theme-toggle');
  btnTema.title = temaActual === 'dark' ? 'Modo claro' : 'Modo oscuro';
  btnTema.setAttribute('aria-label', btnTema.title);
  btnTema.innerHTML = _iconTema(temaActual);
  btnTema.addEventListener('click', _toggleTheme);

  // ── Botón paleta ──
  const btnPaleta = _el('button', 'btn-icon btn-palette-toggle');
  btnPaleta.title = 'Color del sistema';
  btnPaleta.setAttribute('aria-label', btnPaleta.title);
  btnPaleta.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/><circle cx="7" cy="12" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="14" cy="7" r="1" fill="currentColor"/><circle cx="17" cy="11" r="1" fill="currentColor"/></svg>`;
  btnPaleta.addEventListener('click', (e) => { e.stopPropagation(); _togglePanel(btnPaleta); });

  // Insertar al inicio de actions
  actions.insertBefore(btnTema, actions.firstChild);
  actions.insertBefore(btnPaleta, btnTema.nextSibling);

  // ── Panel de colores ──
  const panel = document.createElement('div');
  panel.id = 'color-panel';
  panel.className = 'color-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="color-panel-title">Color del sistema</div>
    <div class="color-swatches">
      ${PALETA.map(c => `
        <button class="color-swatch ${c.id === colorActual ? 'active' : ''}"
                data-color="${c.id}" title="${c.label}"
                style="background:${c.accent};">
          ${c.id === colorActual ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </button>`).join('')}
    </div>`;

  panel.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _applyColor(btn.dataset.color);
      panel.querySelectorAll('.color-swatch').forEach(b => {
        const active = b.dataset.color === btn.dataset.color;
        b.classList.toggle('active', active);
        b.innerHTML = active ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      });
    });
  });

  document.body.appendChild(panel);
  document.addEventListener('click', () => { panel.hidden = true; });
}

function _togglePanel(btnRef) {
  const panel = document.getElementById('color-panel');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    const rect = btnRef.getBoundingClientRect();
    panel.style.top   = (rect.bottom + 8) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.style.left  = 'auto';
  }
}

function _toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next    = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(KEY_THEME, next);
  const btn = document.querySelector('.btn-theme-toggle');
  if (btn) {
    btn.innerHTML = _iconTema(next);
    btn.title     = next === 'dark' ? 'Modo claro' : 'Modo oscuro';
  }
}

function _iconTema(tema) {
  return tema === 'dark'
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
}

function _el(tag, cls) {
  const el = document.createElement(tag);
  el.className = cls;
  return el;
}
