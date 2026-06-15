/* alerts.js — Toast notifications y confirm dialog */

let _container = null;

function getContainer() {
  if (!_container) {
    _container = document.createElement('div');
    _container.id = 'toast-container';
    Object.assign(_container.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: '99999',
      display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none',
    });
    document.body.appendChild(_container);
    if (!document.getElementById('toast-keyframes')) {
      const s = document.createElement('style');
      s.id = 'toast-keyframes';
      s.textContent = `
        @keyframes toastIn  { from{transform:translateX(110%);opacity:0} to{transform:none;opacity:1} }
        @keyframes toastOut { from{opacity:1} to{opacity:0;transform:translateX(110%)} }
      `;
      document.head.appendChild(s);
    }
  }
  return _container;
}

export function showToast(message, type = 'info', duration = 3500) {
  const palette = {
    success: { border:'#2e9e6b', icon:'✓', bg:'#f0faf5' },
    error:   { border:'#c0253a', icon:'✕', bg:'#fef2f3' },
    warning: { border:'#d97a0f', icon:'⚠', bg:'#fef9f0' },
    info:    { border:'#4a90d9', icon:'ℹ', bg:'#f0f6ff' },
  };
  const p = palette[type] || palette.info;
  const el = document.createElement('div');
  el.style.cssText = `
    pointer-events:auto;background:${p.bg};border-radius:8px;
    box-shadow:0 4px 16px rgba(0,0,0,.12);padding:11px 16px 11px 14px;
    display:flex;align-items:flex-start;gap:10px;
    font-family:'Inter',system-ui,sans-serif;font-size:.83rem;line-height:1.4;
    border-left:3px solid ${p.border};color:#0f2a44;max-width:340px;
    animation:toastIn .22s ease both;
  `;
  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = `color:${p.border};font-weight:700;font-size:1rem;flex-shrink:0;`;
  iconSpan.textContent = p.icon;
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  el.appendChild(iconSpan);
  el.appendChild(msgSpan);
  getContainer().appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease both';
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

export function confirmDialog(message, { title = 'Confirmar', confirmText = 'Eliminar', type = 'danger' } = {}) {
  return new Promise((resolve) => {
    const btnBg = type === 'danger' ? '#c0253a' : '#4a90d9';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:28px 28px 22px;max-width:400px;width:92%;
        box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:'Inter',system-ui,sans-serif;">
        <h3 style="margin:0 0 8px;font-size:1rem;color:#0f2a44;font-weight:700;">${title}</h3>
        <p style="margin:0 0 22px;color:#6b829a;font-size:.87rem;line-height:1.5;">${message}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="cd-cancel" style="padding:8px 20px;border:1px solid #d0dde9;border-radius:8px;background:#fff;color:#355472;cursor:pointer;font-size:.85rem;font-family:inherit;">Cancelar</button>
          <button id="cd-ok"     style="padding:8px 20px;border:none;border-radius:8px;background:${btnBg};color:#fff;cursor:pointer;font-size:.85rem;font-weight:600;font-family:inherit;">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cd-ok').focus();
    overlay.querySelector('#cd-ok').addEventListener('click',     () => { overlay.remove(); resolve(true); });
    overlay.querySelector('#cd-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { overlay.remove(); resolve(false); } });
  });
}
