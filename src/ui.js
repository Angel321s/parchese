// Piezas de interfaz compartidas: íconos, avisos, hojas, confirmaciones, tarjetas y QR.
import QRCode from 'qrcode';
import { esc, money, grad, dayShort, dayNum, timeShort, cap, dateLong } from './lib/format.js';

const ic = (p) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

export const I = {
  back: ic('<path d="M15 18l-6-6 6-6"/>'),
  go: ic('<path d="M9 6l6 6-6 6"/>'),
  pin: ic('<path d="M12 21s-7-5.2-7-11a7 7 0 0114 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  cal: ic('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  ticket: ic('<path d="M3 9a2 2 0 002-2h14a2 2 0 002 2 2 2 0 000 4 2 2 0 00-2 2H5a2 2 0 00-2-2 2 2 0 000-4z"/><path d="M14 7v10"/>'),
  check: ic('<path d="M5 13l4 4L19 7"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: ic('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  copy: ic('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>'),
  store: ic('<path d="M4 9l1-5h14l1 5M5 9v11h14V9M5 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0"/>'),
  user: ic('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>'),
  qr: ic('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2M20 14v6h-6v-2"/>'),
  chat: ic('<path d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1120 12z"/>'),
  shield: ic('<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/>'),
  card: ic('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  share: ic('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8"/>'),
  chart: ic('<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>'),
  door: ic('<path d="M5 21V4a1 1 0 011-1h9l4 2v16M3 21h18"/><circle cx="12.5" cy="12" r="1"/>'),
  bell: ic('<path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 004 0"/>'),
  edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  out: ic('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4"/>'),
  camera: ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  google: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="stroke:none"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/></svg>',
};

// ---------- avisos ----------

export function toast(msg, kind = 'ok') {
  const root = document.getElementById('toasts');
  if (!root) return;
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = (kind === 'err' ? I.x : I.check) + '<span>' + esc(msg) + '</span>';
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ---------- hojas (ventanas sobre la página) ----------

let sheetClose = null;

export function openSheet(html, { onClose } = {}) {
  const root = document.getElementById('sheet-root');
  root.innerHTML =
    '<div class="sheet-bg" data-close-sheet></div>' +
    '<div class="sheet" role="dialog" aria-modal="true">' +
    '<button class="x" data-close-sheet aria-label="Cerrar">' + I.x + '</button>' + html + '</div>';
  root.classList.add('open');
  document.body.classList.add('noscroll');
  sheetClose = onClose || null;
  const first = root.querySelector('input,select,textarea');
  if (first && window.matchMedia('(min-width: 640px)').matches) first.focus();
  return root.querySelector('.sheet');
}

export function closeSheet() {
  const root = document.getElementById('sheet-root');
  if (!root || !root.classList.contains('open')) return;
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('noscroll');
  const cb = sheetClose;
  sheetClose = null;
  cb?.();
}

export function confirmDialog({ title, body = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      resolve(v);
    };
    const sheet = openSheet(
      `<h3>${esc(title)}</h3>${body ? `<p class="muted mt-s">${body}</p>` : ''}
       <div class="acts end mt">
         <button class="btn btn-ghost" data-ans="no">${esc(cancel)}</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ans="yes">${esc(ok)}</button>
       </div>`,
      { onClose: () => done(false) },
    );
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ans]');
      if (!b) return;
      done(b.dataset.ans === 'yes');
      closeSheet();
    });
  });
}

// ---------- mensajes de error ----------

const ERRORS = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/email-already-in-use': 'Ya hay una cuenta con ese correo. Entra con tu contraseña.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'Ese correo no parece válido.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
  'auth/cancelled-popup-request': 'Cerraste la ventana de Google antes de terminar.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a intentar.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  unavailable: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  'sold-out': 'Se acabaron los cupos de esa entrada. Prueba con otra o con menos cantidad.',
  'event-closed': 'Este evento ya no está a la venta.',
  'event-changed': 'El bar acaba de cambiar este evento. Recarga la página para ver la información nueva.',
  'permission-denied': 'No se pudo hacer: no tienes permiso o alguien ya lo cambió. Recarga la página.',
  unauthenticated: 'Entra a tu cuenta para continuar.',
  'invalid-argument': 'Revisa los datos e inténtalo de nuevo.',
};

export const errorMessage = (e) => ERRORS[e?.code] || e?.userMessage || 'Algo salió mal. Inténtalo de nuevo.';

// ---------- tarjetas ----------

export function flyer(ev, cls = '') {
  const d = new Date(ev.startsAt);
  const tags = (ev.genres || []).slice(0, 2).map((g) => `<span>${esc(g)}</span>`).join('');
  return `<div class="flyer ${cls}" style="background:${grad(ev.title)}">
    <div class="grain"></div>
    <div class="f-top"><div class="f-tags">${tags}</div>
      <div class="f-day"><small>${esc(cap(dayShort(d)))}</small><b>${esc(dayNum(d))}</b></div></div>
    <div><p class="f-ttl">${esc(ev.title)}</p><p class="f-sub">${esc(ev.barName || '')} · ${esc(timeShort(d))}</p></div>
  </div>`;
}

function priceLabel(ev) {
  const prices = Object.values(ev.ticketTypes || {}).map((t) => t.price);
  if (!prices.length) return '';
  const paid = prices.filter((x) => x > 0);
  if (!paid.length) return '<b>Gratis</b>';
  const free = paid.length < prices.length ? ' <span class="tag mint">Lista gratis</span>' : '';
  return `<span>Desde</span> <b>${money(Math.min(...paid))}</b>${free}`;
}

export function eventCard(ev) {
  return `<a class="ev" href="/e/${encodeURIComponent(ev.id)}">
    ${flyer(ev)}
    <div class="ev-b">
      <div class="ev-meta">${I.cal}<span>${esc(cap(dateLong(new Date(ev.startsAt))))}</span></div>
      <div class="ev-meta">${I.pin}<span>${esc(ev.barName || '')}${ev.barZone ? ' · ' + esc(ev.barZone) : ''}</span></div>
      <div class="ev-f"><div class="price">${priceLabel(ev)}</div>
        <span class="btn sm btn-ghost">Ver</span></div>
    </div>
  </a>`;
}

export const STATUS = {
  pendiente: ['Pendiente de pago', 'amb'],
  confirmado: ['Lista para entrar', 'mint'],
  usado: ['Usada', ''],
  rechazado: ['Pago no recibido', 'danger'],
  reembolsado: ['Reembolsada', ''],
};

export function statusChip(status) {
  const [label, cls] = STATUS[status] || [status, ''];
  return `<span class="tag ${cls}">${esc(label)}</span>`;
}

export function qrSvg(text) {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B0812', light: '#FFFFFF' },
  });
}

export const loadingBlock = (text = 'Cargando…') => `<div class="loading"><div class="spin"></div><p class="muted">${esc(text)}</p></div>`;

export const emptyBlock = (title, text = '', action = '') =>
  `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action ? `<div class="mt">${action}</div>` : ''}</div>`;

export function setTitle(t) {
  document.title = t ? `${t} · Párchese` : 'Párchese · Eventos y reservas para la rumba';
}

export async function copyText(text, ok = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    openSheet(`<h3>Cópialo aquí</h3><p class="muted">Mantén presionado y copia:</p><div class="input sel mt">${esc(text)}</div>`);
  }
}
